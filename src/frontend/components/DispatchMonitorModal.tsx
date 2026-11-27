import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  GitBranch,
  ExternalLink,
  Truck,
  Phone,
  CreditCard,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { STATE_DETAILS } from '../playground/constants';
import { AppState } from '../../chatbot/playground/types';

interface DispatchOrderItem {
  id: string;
  trackingCode: string;
  createdAt: string;
  status: string;
  workflowState?: AppState;
  assignedPartner?: 'DCE' | 'CSDT' | null;
  customerName?: string;
  customerPhone?: string;
  chatSessionId?: string;
  baseCostVnd?: number;
  estimatedPrice?: number;
  paymentParty?: string;
  paymentTiming?: string;
  driverPhone?: string;
  source: string;
  form: {
    dia_chi_lay_hang: string;
    dia_chi_giao_hang: string;
    thong_tin_hang: string;
    thoi_gian_giao_nhan: string;
    thong_tin_bo_sung?: string | null;
  };
  threads?: Array<{
    id: string;
    partnerRole: string;
    zaloMsgId?: string;
    expectedState: string;
    createdAt: string;
  }>;
}

interface DispatchMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DispatchMonitorModal: React.FC<DispatchMonitorModalProps> = ({ isOpen, onClose }) => {
  const [orders, setOrders] = useState<DispatchOrderItem[]>([]);
  const [partners, setPartners] = useState<any>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionRole, setActionRole] = useState<'DCE' | 'CSDT' | 'CUSTOMER'>('DCE');
  const [actionText, setActionText] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dispatch/orders');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.orders) ? data.orders : [];
        setOrders(list);
        setPartners(data.partners || null);
        if (list.length > 0 && !selectedCode) {
          setSelectedCode(list[0].trackingCode);
        }
      }
    } catch (e) {
      console.error('Failed to fetch live dispatch orders:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedOrder = orders.find((o) => o.trackingCode === selectedCode) || orders[0] || null;
  const stateMeta =
    selectedOrder?.workflowState && STATE_DETAILS[selectedOrder.workflowState]
      ? STATE_DETAILS[selectedOrder.workflowState]
      : STATE_DETAILS.WAITING_DCE;

  const handleRunAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !actionText.trim() || submitting) return;
    setSubmitting(true);
    setActionFeedback(null);

    try {
      const res = await fetch(
        `/api/dispatch/orders/${encodeURIComponent(selectedOrder.trackingCode)}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: actionRole,
            message: actionText.trim(),
            dryRun: false,
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        const msg =
          data.result?.partnerMessage ||
          data.result?.customerMessage ||
          `Đã cập nhật trạng thái: ${data.result?.status || 'OK'}`;
        setActionFeedback(msg);
        setActionText('');
        await loadOrders();
      } else {
        setActionFeedback(data.error || 'Không thể xử lý thao tác điều phối');
      }
    } catch (err: any) {
      setActionFeedback(`Lỗi: ${err?.message || 'Network error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (v?: number) =>
    v ? `${Math.round(v).toLocaleString('vi-VN')} VNĐ` : 'Chưa có';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
                <span>Điều Phối Live Đa Kênh (Khách &harr; DCE &harr; CSĐT)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold">
                  {orders.length} đơn
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Theo dõi 15 trạng thái Orchestrator, giá gốc (+30%), Waterfall DCE &rarr; CSĐT &amp; SĐT tài xế
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/playground.html"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <span>Mở Simulator 3 Kênh</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={loadOrders}
              disabled={loading}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Partner Status Strip */}
        {partners && (
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  partners.dceOpsConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <strong>Cấp 1 (DCE Ops):</strong> {partners.dceOpsPhone}{' '}
              {partners.dceOpsConnected ? '(Đã liên kết Zalo)' : '(Chờ #ops)'}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  partners.csdtConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <strong>Cấp 2 (CSĐT - {partners.csdtName}):</strong> {partners.csdtPhone}{' '}
              {partners.csdtConnected ? '(Đã liên kết Zalo)' : '(Chờ #supplier)'}
            </span>
          </div>
        )}

        {/* Main 2-Pane Split */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left: Order Queue */}
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50/70 overflow-y-auto divide-y divide-slate-200">
            {orders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Chưa có đơn hàng điều phối nào.
              </div>
            ) : (
              orders.map((o) => {
                const st = o.workflowState || 'COLLECTING_INFO';
                const detail = STATE_DETAILS[st as AppState];
                const isSelected = selectedOrder?.trackingCode === o.trackingCode;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedCode(o.trackingCode)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-l-4 border-blue-600'
                        : 'hover:bg-white border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-extrabold text-slate-900">
                        #{o.trackingCode}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          detail?.bgLight || 'bg-slate-100'
                        } ${detail?.textColor || 'text-slate-700'} ${
                          detail?.borderColor || 'border-slate-300'
                        }`}
                      >
                        {st}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {o.form.dia_chi_lay_hang} &rarr; {o.form.dia_chi_giao_hang}
                    </p>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span>{o.assignedPartner ? `Đối tác: ${o.assignedPartner}` : 'Chưa gán'}</span>
                      <span className="font-bold text-emerald-700">
                        {formatMoney(o.estimatedPrice)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Order Orchestrator Inspector + Action Console */}
          <div className="md:col-span-8 flex flex-col min-h-0 overflow-y-auto p-5 space-y-4 bg-white">
            {selectedOrder ? (
              <>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black text-slate-900">
                        #{selectedOrder.trackingCode}
                      </span>
                      {selectedOrder.chatSessionId && (
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold">
                          Phiên: {selectedOrder.chatSessionId}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold border ${stateMeta.bgLight} ${stateMeta.textColor} ${stateMeta.borderColor}`}
                    >
                      {stateMeta.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{stateMeta.description}</p>
                </div>

                {/* 3-Party Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 text-xs space-y-1">
                    <div className="font-bold text-blue-800 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" /> Kênh 1: Khách hàng
                    </div>
                    <p><strong>Lấy:</strong> {selectedOrder.form.dia_chi_lay_hang}</p>
                    <p><strong>Giao:</strong> {selectedOrder.form.dia_chi_giao_hang}</p>
                    <p><strong>Hàng:</strong> {selectedOrder.form.thong_tin_hang}</p>
                    <p><strong>TG:</strong> {selectedOrder.form.thoi_gian_giao_nhan}</p>
                  </div>

                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 text-xs space-y-1">
                    <div className="font-bold text-amber-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Kênh 2/3: Đối tác &amp; Giá (+30%)
                    </div>
                    <p><strong>Phụ trách:</strong> {selectedOrder.assignedPartner || 'DCE (Cấp 1)'}</p>
                    <p><strong>Giá gốc:</strong> {formatMoney(selectedOrder.baseCostVnd)}</p>
                    <p><strong>Giá báo khách (+30%):</strong> <span className="text-emerald-700 font-bold">{formatMoney(selectedOrder.estimatedPrice)}</span></p>
                    {selectedOrder.threads && selectedOrder.threads.length > 0 && (
                      <p className="text-[10px] text-slate-500">
                        Đã log {selectedOrder.threads.length} thread Zalo (quote-reply)
                      </p>
                    )}
                  </div>

                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 text-xs space-y-1">
                    <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" /> Sau chốt &amp; Tài xế
                    </div>
                    <p><strong>SĐT gửi:</strong> {selectedOrder.customerPhone || 'Chờ cập nhật'}</p>
                    <p><strong>Thanh toán:</strong> {selectedOrder.paymentParty || '---'} ({selectedOrder.paymentTiming || '---'})</p>
                    <p className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-700" />
                      <strong>Tài xế:</strong>{' '}
                      <span className="font-bold text-emerald-800">
                        {selectedOrder.driverPhone || 'Chờ điều xe'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Live Operator Action Console */}
                <form
                  onSubmit={handleRunAction}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Gửi Phản Hồi Qua Orchestrator Cho Đơn #{selectedOrder.trackingCode}
                    </span>
                    <div className="flex items-center gap-1 text-[11px]">
                      {(['DCE', 'CSDT', 'CUSTOMER'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setActionRole(r)}
                          className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                            actionRole === r
                              ? 'bg-slate-900 text-white'
                              : 'bg-white border border-slate-200 text-slate-600'
                          }`}
                        >
                          {r === 'DCE' ? 'DCE (Cấp 1)' : r === 'CSDT' ? 'CSĐT (Cấp 2)' : 'Khách hàng'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={actionText}
                      onChange={(e) => setActionText(e.target.value)}
                      placeholder={
                        actionRole === 'CUSTOMER'
                          ? 'VD: Chốt, hoặc 0912345678, hoặc Người gửi thanh toán...'
                          : 'VD: 1tr2 (tự +30% -> 1tr56), Không (chuyển CSĐT), hoặc SĐT tài xế...'
                      }
                      className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !actionText.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Gửi
                    </button>
                  </div>

                  {actionFeedback && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-wrap">{actionFeedback}</span>
                    </div>
                  )}
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                <AlertTriangle className="w-8 h-8 text-slate-300" />
                <span>Chọn một đơn hàng ở danh sách bên trái để xem chi tiết luồng điều phối.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
