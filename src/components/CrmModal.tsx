import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Search,
  RefreshCw,
  Send,
  User,
  Phone,
  MapPin,
  Package,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  Bot,
  UserCheck,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { ShippingInfo } from '../types';

export interface CrmCustomerItem {
  user_id: string;
  name: string;
  phone: string;
  address: string;
  avatar: string;
  order_count: number;
  first_interaction: string;
  last_interaction: string;
  last_message: string;
  shipping_info: any;
}

export interface CrmMessageItem {
  id: number | string;
  user_id: string;
  sender: 'user' | 'bot' | 'agent';
  sender_name: string;
  message_text: string;
  shipping_info_snapshot?: any;
  created_at: string;
}

interface CrmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadOrderToWaybill?: (info: ShippingInfo) => void;
}

export const CrmModal: React.FC<CrmModalProps> = ({
  isOpen,
  onClose,
  onLoadOrderToWaybill,
}) => {
  const [customers, setCustomers] = useState<CrmCustomerItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CrmMessageItem[]>([]);
  const [search, setSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchCustomers = async (searchQuery = '') => {
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0 && !selectedUserId) {
        setSelectedUserId(data[0].user_id);
      }
    } catch (e) {
      console.error('Failed to fetch CRM customers:', e);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const fetchMessages = async (userId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/crm/customers/${userId}/messages`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch CRM messages:', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCustomers(search);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedUserId) {
      fetchMessages(selectedUserId);
    } else {
      setMessages([]);
    }
  }, [selectedUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers(search);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !replyText.trim() || isSending) return;

    setIsSending(true);
    setSendNotice(null);

    try {
      const res = await fetch(`/api/crm/customers/${selectedUserId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: replyText.trim(),
          agentName: 'Tư vấn viên (Web)',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText('');
        fetchMessages(selectedUserId);
        fetchCustomers(search);
      } else {
        setSendNotice(data.error || 'Gửi tin nhắn thất bại');
      }
    } catch (err: any) {
      setSendNotice(`Lỗi mạng: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.user_id === selectedUserId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col h-[92vh] max-h-[92vh] overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-800">
                  Lịch Sử Hội Thoại & CRM Khách Hàng Zalo OA
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                  {customers.length} khách hàng
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Toàn bộ tin nhắn 2 chiều giữa khách hàng Zalo và ShipBot AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                fetchCustomers(search);
                if (selectedUserId) fetchMessages(selectedUserId);
              }}
              disabled={loadingCustomers || loadingMessages}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loadingCustomers || loadingMessages ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Main Workspace */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* LEFT COLUMN: CUSTOMERS LIST (5 cols on md) */}
          <div className="md:col-span-4 lg:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/50 min-h-0">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="p-3 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, SĐT, tin nhắn..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </form>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {customers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {loadingCustomers ? 'Đang tải danh sách khách hàng...' : 'Chưa có tương tác nào từ khách hàng Zalo.'}
                </div>
              ) : (
                customers.map((c) => {
                  const isSelected = c.user_id === selectedUserId;
                  const hasOrder = c.order_count > 0 || c.shipping_info?.isConfirmed;

                  return (
                    <div
                      key={c.user_id}
                      onClick={() => setSelectedUserId(c.user_id)}
                      className={`p-3.5 cursor-pointer transition-colors flex items-start gap-3 ${
                        isSelected
                          ? 'bg-blue-50/90 border-l-4 border-blue-600'
                          : 'hover:bg-slate-100/70 border-l-4 border-transparent'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {c.avatar ? (
                          <img
                            src={c.avatar}
                            alt={c.name}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-400 to-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                            {c.name ? c.name.slice(0, 1).toUpperCase() : 'Z'}
                          </div>
                        )}
                        {hasOrder && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] border-2 border-white"
                            title="Khách đã chốt đơn"
                          >
                            ✓
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h4 className="font-bold text-xs text-slate-800 truncate">{c.name}</h4>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(c.last_interaction).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {c.phone && (
                          <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold mb-1">
                            <Phone className="w-3 h-3" />
                            <span>{c.phone}</span>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-500 truncate">
                          {c.last_message || 'Chưa có tin nhắn'}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: CHAT STREAM & CUSTOMER DOSSIER (7-8 cols on md) */}
          <div className="md:col-span-8 lg:col-span-8 flex flex-col bg-white min-h-0">
            {selectedCustomer ? (
              <>
                {/* Dossier Bar */}
                <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {selectedCustomer.avatar ? (
                        <img
                          src={selectedCustomer.avatar}
                          alt={selectedCustomer.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-slate-900">{selectedCustomer.name}</h4>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          ID: {selectedCustomer.user_id.slice(-6)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5">
                        {selectedCustomer.phone && (
                          <span className="flex items-center gap-1 font-semibold text-emerald-700">
                            <Phone className="w-3 h-3" /> {selectedCustomer.phone}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          Tương tác đầu: {new Date(selectedCustomer.first_interaction).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action: Nạp đơn vào Waybill */}
                  {selectedCustomer.shipping_info && (
                    <button
                      onClick={() => {
                        if (onLoadOrderToWaybill) {
                          onLoadOrderToWaybill(selectedCustomer.shipping_info);
                          onClose();
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                      title="Nạp dữ liệu đơn hàng vào Phiếu Vận Đơn bên ngoài app"
                    >
                      <Package className="w-3.5 h-3.5" />
                      Nạp Đơn Vào Phiếu
                    </button>
                  )}
                </div>

                {/* Extracted Shipping Info Mini-Card */}
                {selectedCustomer.shipping_info?.cargo?.name && (
                  <div className="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-900 gap-3">
                    <div className="flex items-center gap-2 truncate">
                      <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="font-bold truncate">
                        Kiện: {selectedCustomer.shipping_info.cargo.name} (
                        {selectedCustomer.shipping_info.cargo.weight || selectedCustomer.shipping_info.cargo.weightKg || '---'}
                        kg)
                      </span>
                      {selectedCustomer.shipping_info.pickup?.address && (
                        <span className="text-slate-500 text-[11px] truncate">
                          &bull; Từ: {selectedCustomer.shipping_info.pickup.address}
                        </span>
                      )}
                    </div>
                    {selectedCustomer.shipping_info.isConfirmed && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px] shrink-0 border border-emerald-300">
                        ĐÃ XÁC NHẬN
                      </span>
                    )}
                  </div>
                )}

                {/* Message Bubble Stream */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-100/50">
                  {loadingMessages ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Đang tải lịch sử trò chuyện...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Chưa có tin nhắn nào được lưu trữ cho khách hàng này.
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const isCustomer = m.sender === 'user';
                      const isAgent = m.sender === 'agent';

                      return (
                        <div
                          key={idx}
                          className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                        >
                          {/* Sender badge & time */}
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                            {isCustomer ? (
                              <span className="font-semibold text-slate-600">{m.sender_name || 'Khách hàng'}</span>
                            ) : isAgent ? (
                              <span className="font-semibold text-purple-700 flex items-center gap-1">
                                <UserCheck className="w-3 h-3" /> {m.sender_name || 'Tư vấn viên'}
                              </span>
                            ) : (
                              <span className="font-semibold text-blue-700 flex items-center gap-1">
                                <Bot className="w-3 h-3" /> ShipBot AI
                              </span>
                            )}
                            <span>&bull;</span>
                            <span>
                              {new Date(m.created_at).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Bubble */}
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed shadow-2xs whitespace-pre-wrap ${
                              isCustomer
                                ? 'bg-white text-slate-800 rounded-tl-xs border border-slate-200'
                                : isAgent
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-xs'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs'
                            }`}
                          >
                            {m.message_text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Send Reply Input (Staff / Agent direct chat) */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Gõ tin nhắn gửi trực tiếp tới Zalo của ${selectedCustomer.name}...`}
                    className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !replyText.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    {isSending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Gửi Zalo
                  </button>
                </form>
                {sendNotice && (
                  <div className="px-4 py-1 text-[11px] text-rose-600 bg-rose-50 border-t border-rose-200 font-semibold">
                    {sendNotice}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                <MessageSquare className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Chọn một khách hàng để xem chi tiết</p>
                <p className="text-xs text-slate-400">
                  Lịch sử hội thoại và thông tin đơn hàng sẽ được hiển thị tại đây.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

