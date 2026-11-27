/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { ExperimentChatPanel } from './components/ExperimentChatPanel';
import type { ExperimentMode } from './components/ExperimentChatPanel';
import { PassengerBookingPanel } from './components/PassengerBookingPanel';
import { OpsChatWindow } from './components/OpsChatWindow';
import { WaybillCard } from './components/WaybillCard';
import { SamplePromptsModal } from './components/SamplePromptsModal';
import { OrderHistoryModal } from './components/OrderHistoryModal';
import { SuccessOrderModal } from './components/SuccessOrderModal';
import { ZaloStatusModal } from './components/ZaloStatusModal';
import { CrmModal } from './components/CrmModal';
import { ChatMessage, ShippingInfo, OrderRecord, RoutingConfig, BusinessFlow } from './types';
import { getBusinessFlowLabel } from './utils/businessFlows';
import {
  INITIAL_SHIPPING_INFO,
  evaluateCompleteness,
  generateTrackingCode,
  DCE_OPS_PHONE,
  DEFAULT_SUPPLIER_NAME,
  DEFAULT_SUPPLIER_PHONE,
} from './utils/logistics';

const STORAGE_ORDERS_KEY = 'shipbot_saved_orders_v1';

export default function App() {
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>(INITIAL_SHIPPING_INFO);
  const selectedBusinessFlow: BusinessFlow = 'chuyen_hang';
  const [isExperimentMode, setIsExperimentMode] = useState(false);
  const [experimentMode, setExperimentMode] = useState<ExperimentMode>('default');
  const [experimentMessages, setExperimentMessages] = useState<ChatMessage[]>([{
    id: 'experiment-welcome',
    sender: 'bot',
    text: 'Chào anh/chị, mình có thể hỗ trợ gì cho anh/chị hôm nay?',
    timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  }]);
  const [isExperimentLoading, setIsExperimentLoading] = useState(false);
  const [experimentId, setExperimentId] = useState(() => `experiment-${Date.now()}`);
  const [isOpsActive, setIsOpsActive] = useState(false);
  const [isOpsWindowOpen, setIsOpsWindowOpen] = useState(false);
  const [opsName, setOpsName] = useState('Nguyễn An');
  const [opsMessages, setOpsMessages] = useState<ChatMessage[]>([]);
  const [isPassengerMatching, setIsPassengerMatching] = useState(false);
  const [matchedPartner, setMatchedPartner] = useState<any>(null);
  const [trackingCode, setTrackingCode] = useState<string>(generateTrackingCode());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  // Modals state
  const [isSamplesOpen, setIsSamplesOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState<boolean>(false);
  const [isZaloOpen, setIsZaloOpen] = useState<boolean>(false);
  const [isZaloConnected, setIsZaloConnected] = useState<boolean | null>(null);
  const [isCrmOpen, setIsCrmOpen] = useState<boolean>(false);
  const [routingConfig, setRoutingConfig] = useState<RoutingConfig>({
    opsPhone: DCE_OPS_PHONE,
    supplierName: DEFAULT_SUPPLIER_NAME,
    supplierPhone: DEFAULT_SUPPLIER_PHONE,
  });

  // Saved orders from localStorage
  const [savedOrders, setSavedOrders] = useState<OrderRecord[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_ORDERS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Initial greeting message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome-1',
      sender: 'bot',
      text: 'Chào anh/chị! Bên em có thể hỗ trợ vận chuyển hàng hóa. Anh/chị cần tư vấn dịch vụ nào ạ?',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Check server health & Zalo status
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(data.hasApiKey);
      })
      .catch((err) => {
        console.warn('Could not contact /api/health:', err);
      });

    fetch('/api/zalo/status')
      .then((res) => res.json())
      .then((data) => {
        setIsZaloConnected(data.connected);
      })
      .catch(() => {
        setIsZaloConnected(false);
      });

    // Synchronize shipping orders from PostgreSQL shipbot-db
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setSavedOrders(data.orders);
        }
      })
      .catch((err) => {
        console.warn('Could not contact /api/orders, keeping localStorage:', err);
      });

    // Fetch dynamic Ops & Default Supplier routing config
    fetch('/api/config/routing')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.opsPhone) {
          setRoutingConfig(data);
        }
      })
      .catch(() => {});
  }, []);

  // Save orders to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(savedOrders));
    } catch (e) {
      console.error('Failed to save orders to localStorage', e);
    }
  }, [savedOrders]);

  // Send message immediately without countdown
  const handleSendMessage = async (userText: string) => {
    if (!selectedBusinessFlow) return;
    // If user clicked standard scenario shortcut
    if (userText === 'Dùng kịch bản mẫu đầy đủ') {
      setIsSamplesOpen(true);
      return;
    }

    // Instantly append user's message to the visible chat list
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const historyPayload = newMessages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: historyPayload,
          currentInfo: { ...shippingInfo, businessFlow: selectedBusinessFlow },
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      if (data.shippingInfo) {
        // Re-evaluate completeness locally to guarantee consistency
        const evalResult = evaluateCompleteness(data.shippingInfo);
        const isConfirmed = Boolean(
          data.shippingInfo.isConfirmed ||
          (data.reply && data.reply.includes('báo giá cho mình ạ'))
        );
        setShippingInfo({
          ...data.shippingInfo,
          ...evalResult,
          businessFlow: selectedBusinessFlow,
          isConfirmed,
        });
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: data.reply || 'Dạ em đã cập nhật thông tin vận chuyển!',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        quickReplies: data.quickReplies || [],
        aiTrace: data.aiTrace,
        replyToId: userMsg.id,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error('Error contacting chat endpoint:', error);
      const errorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sender: 'bot',
        text: 'Dạ em đã lưu nhận thông tin của anh/chị. Anh/chị xem bảng bên phải để kiểm tra các trường đã được điền hoặc bấm "Sửa nhanh" để cập nhật trực tiếp nhé ạ!',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        quickReplies: [],
        replyToId: userMsg.id,
        aiTrace: {
          source: 'error', reason: 'CHAT_REQUEST_FAILED', elapsedMs: 0,
          steps: [{ node: 'web_request', status: 'error', reason: 'CHAT_REQUEST_FAILED', detail: { message: error instanceof Error ? error.message : String(error) } }],
        },
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetExperimentSession = (mode: ExperimentMode = experimentMode) => {
    setExperimentMode(mode);
    setExperimentId(`experiment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    setExperimentMessages([{
      id: `experiment-welcome-${mode}-${Date.now()}`,
      sender: 'bot',
      text: 'Chào anh/chị, mình có thể hỗ trợ gì cho anh/chị hôm nay?',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    }]);
    setIsOpsActive(false);
    setIsOpsWindowOpen(false);
    setOpsMessages([]);
    setOpsName('Nguyễn An');
    setMatchedPartner(null);
    setIsPassengerMatching(false);
  };

  const handleExperimentModeChange = (mode: ExperimentMode) => resetExperimentSession(mode);

  const addExperimentBotMessage = (text: string, trace?: Array<{ step: string; status: 'ok' | 'skip' | 'error'; detail?: unknown }>, replyToId?: string) => {
    const message: ChatMessage = {
      id: `experiment-bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'bot',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      replyToId,
      ...(trace ? { aiTrace: {
        source: 'rule' as const,
        reason: 'PASSENGER_EXPERIMENT_AGENT',
        elapsedMs: 0,
        steps: trace.map((step) => ({ node: step.step, status: step.status, detail: step.detail && typeof step.detail === 'object' ? step.detail as Record<string, unknown> : undefined })),
      } } : {}),
    };
    setExperimentMessages((previous) => [...previous, message]);
    return message;
  };

  const activateOpsHandover = (conversation: ChatMessage[], profile?: Record<string, unknown>) => {
    setIsOpsActive(true);
    setIsOpsWindowOpen(true);
    const name = typeof profile?.displayName === 'string' ? profile.displayName : 'Nguyễn An';
    setOpsName(name);
    setOpsMessages(conversation);
  };

  const handleSendExperimentMessage = async (userText: string) => {
    const userMsg: ChatMessage = {
      id: `experiment-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    const newMessages = [...experimentMessages, userMsg];
    setExperimentMessages(newMessages);

    if (isOpsActive) {
      setOpsMessages((previous) => [...previous, userMsg]);
      return;
    }
    setIsExperimentLoading(true);

    try {
      const passengerMode = experimentMode === 'passenger';
      const historyPayload = newMessages.map((message) => ({ role: message.sender === 'user' ? 'user' : 'model', content: message.text }));
      const res = await fetch(passengerMode ? '/api/passenger-transport/agent-turn' : '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passengerMode ? {
          event: 'message',
          experimentId,
          message: userText,
        } : {
          message: userText,
          history: historyPayload,
          currentInfo: INITIAL_SHIPPING_INFO,
          experimentMode,
        }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (passengerMode) {
        const botMessage = addExperimentBotMessage(data.reply || 'Bot chưa tạo được phản hồi.', data.trace, userMsg.id);
        if (data.handover) activateOpsHandover([...newMessages, botMessage], data.opsProfile);
        return;
      }
      const botMsg: ChatMessage = {
        id: `experiment-bot-${Date.now()}`,
        sender: 'bot',
        text: data.reply || 'Bot chưa tạo được phản hồi.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        aiTrace: data.aiTrace,
        replyToId: userMsg.id,
      };
      setExperimentMessages((previous) => [...previous, botMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `experiment-error-${Date.now()}`,
        sender: 'bot',
        text: `Không thể kết nối chatbot thử nghiệm. ${error instanceof Error ? error.message : ''}`.trim(),
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        replyToId: userMsg.id,
        aiTrace: {
          source: 'error', reason: 'EXPERIMENT_CHAT_REQUEST_FAILED', elapsedMs: 0,
          steps: [{ node: 'web_request', status: 'error', reason: 'EXPERIMENT_CHAT_REQUEST_FAILED' }],
        },
      };
      setExperimentMessages((previous) => [...previous, errorMsg]);
    } finally {
      setIsExperimentLoading(false);
    }
  };

  const handlePassengerBookingReady = async (flow: 'ride' | 'rental', booking: Record<string, unknown>) => {
    if (isOpsActive) return;
    setIsPassengerMatching(true);
    setMatchedPartner(null);
    try {
      const res = await fetch('/api/passenger-transport/agent-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'booking_ready', experimentId, flow, booking }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.partner) setMatchedPartner({ ...data.partner, flow });
      const botMessage = addExperimentBotMessage(data.reply || 'Đã xử lý booking thử nghiệm.', data.trace);
      if (data.handover) activateOpsHandover([...experimentMessages, botMessage], data.opsProfile);
    } catch (error) {
      addExperimentBotMessage(`Không thể gọi API ghép đối tác thử nghiệm: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsPassengerMatching(false);
    }
  };

  const handleOpsReply = (text: string) => {
    const reply: ChatMessage = {
      id: `ops-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: 'agent',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setOpsMessages((previous) => [...previous, reply]);
    setExperimentMessages((previous) => [...previous, reply]);
  };

  const handleUpdateShippingInfo = (updated: ShippingInfo) => {
    const evalResult = evaluateCompleteness(updated);
    setShippingInfo({
      ...updated,
      ...evalResult,
      businessFlow: selectedBusinessFlow || undefined,
    });
  };

  const handleReset = () => {
    setShippingInfo({ ...INITIAL_SHIPPING_INFO, businessFlow: selectedBusinessFlow || undefined });
    setTrackingCode(generateTrackingCode());
    setMessages([
      {
        id: `msg-reset-${Date.now()}`,
        sender: 'bot',
        text: selectedBusinessFlow
          ? `Mình đang ở luồng ${getBusinessFlowLabel(selectedBusinessFlow)}. Vui lòng cung cấp thông tin địa chỉ giao nhận để bên em tư vấn.`
          : 'Chào anh/chị! Vui lòng chọn luồng nghiệp vụ ở phía trên khung chat để bắt đầu.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleConfirmOrder = async () => {
    if (!shippingInfo.isComplete) return;

    const newOrder: OrderRecord = {
      id: `order-${Date.now()}`,
      trackingCode,
      createdAt: new Date().toLocaleString('vi-VN'),
      status: 'created',
      source: 'web',
      customerName: shippingInfo.sender?.name || '',
      customerPhone: shippingInfo.sender?.phone || '',
      shippingInfo,
    };

    setSavedOrders((prev) => [newOrder, ...prev]);
    setIsSuccessOpen(true);

    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder),
      });
    } catch (e) {
      console.warn('Failed to save order to PostgreSQL server:', e);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    setSavedOrders((prev) => prev.filter((o) => o.id !== id));
    try {
      await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete order from server:', e);
    }
  };

  const handleClearAllOrders = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử đơn hàng trong Database?')) {
      setSavedOrders([]);
      try {
        await fetch('/api/orders', { method: 'DELETE' });
      } catch (e) {
        console.warn('Failed to clear all orders on server:', e);
      }
    }
  };

  const handleSelectOrderFromHistory = (order: OrderRecord) => {
    setShippingInfo(order.shippingInfo);
    setTrackingCode(order.trackingCode);
    const systemNotice: ChatMessage = {
      id: `sys-${Date.now()}`,
      sender: 'system',
      text: `Đã tải lại đơn hàng mã ${order.trackingCode}`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, systemNotice]);
  };

  const handleLoadOrderFromCrm = (info: any) => {
    if (info) {
      setShippingInfo(info);
      if (info.trackingCode) {
        setTrackingCode(info.trackingCode);
      }
      const systemNotice: ChatMessage = {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: `Đã nạp dữ liệu đơn hàng từ khách hàng Zalo vào Phiếu Vận Đơn!`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, systemNotice]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70 font-sans text-slate-900 selection:bg-blue-500 selection:text-white">
      {/* Top Header */}
      <Header
        hasApiKey={hasApiKey}
        completionRate={shippingInfo.completionRate}
        onReset={handleReset}
        onOpenSamples={() => setIsSamplesOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        savedOrdersCount={savedOrders.length}
        onOpenZaloStatus={() => setIsZaloOpen(true)}
        isZaloConnected={isZaloConnected}
        onOpenCrm={() => setIsCrmOpen(true)}
      />

      {/* Main App Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 print:hidden">
        {/* Core 2-Column Responsive Workspace */}
        <div className={`grid grid-cols-1 ${isExperimentMode ? 'lg:grid-cols-2' : 'lg:grid-cols-12'} gap-5 h-[calc(100vh-6.5rem)] min-h-[600px]`}>
          {/* Left Column: AI Interactive Chat (7 cols on lg) */}
          <div className={`${isExperimentMode ? 'lg:col-span-1' : 'lg:col-span-7'} h-full flex flex-col min-h-0`}>
            {isExperimentMode ? (
              <ExperimentChatPanel
                messages={experimentMessages}
                isLoading={isExperimentLoading}
                mode={experimentMode}
                onModeChange={handleExperimentModeChange}
                onSendMessage={handleSendExperimentMessage}
                onBack={() => setIsExperimentMode(false)}
                onReset={() => resetExperimentSession()}
                isOpsActive={isOpsActive}
                onOpenOps={() => setIsOpsWindowOpen(true)}
              />
            ) : (
              <ChatPanel
                messages={messages}
                isLoading={isLoading}
                onSendMessage={handleSendMessage}
                shippingInfo={shippingInfo}
                selectedBusinessFlow={selectedBusinessFlow}
                onOpenExperiment={() => setIsExperimentMode(true)}
              />
            )}
          </div>

          {isExperimentMode && <div className="h-full min-h-0">
            {experimentMode === 'passenger' ? (
              <PassengerBookingPanel
                key={experimentId}
                onBookingReady={handlePassengerBookingReady}
                isMatching={isPassengerMatching}
                matchedPartner={matchedPartner}
              />
            ) : (
              <section className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">{experimentMode === 'default' ? '?' : experimentMode === 'cargo' ? 'H' : 'T'}</div>
                  <h2 className="mt-4 text-base font-bold text-slate-900">Bảng thông tin thử nghiệm</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">Chọn chế độ <strong>Chuyển người</strong> để mở bảng booking Ride/Rental. Bảng thông tin riêng cho chế độ này sẽ được thiết kế khi triển khai luồng tương ứng.</p>
                </div>
              </section>
            )}
          </div>}

          {/* Right Column: Live Companion Waybill (5 cols on lg) */}
          {!isExperimentMode && <div className="lg:col-span-5 h-full flex flex-col min-h-0">
            <WaybillCard
              shippingInfo={shippingInfo}
              onUpdateInfo={handleUpdateShippingInfo}
              onConfirmOrder={handleConfirmOrder}
              trackingCode={trackingCode}
              routingConfig={routingConfig}
            />
          </div>}
        </div>
      </main>

      {isExperimentMode && isOpsActive && isOpsWindowOpen && <OpsChatWindow
        opsName={opsName}
        messages={opsMessages}
        onSend={handleOpsReply}
        onClose={() => setIsOpsWindowOpen(false)}
      />}

      {/* Modals */}
      <SamplePromptsModal
        isOpen={isSamplesOpen}
        onClose={() => setIsSamplesOpen(false)}
        onSelectPrompt={handleSendMessage}
      />

      <OrderHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        orders={savedOrders}
        onDeleteOrder={handleDeleteOrder}
        onClearAll={handleClearAllOrders}
        onSelectOrder={handleSelectOrderFromHistory}
        routingConfig={routingConfig}
      />

      <SuccessOrderModal
        isOpen={isSuccessOpen}
        onClose={() => setIsSuccessOpen(false)}
        shippingInfo={shippingInfo}
        trackingCode={trackingCode}
        onNewOrder={handleReset}
        routingConfig={routingConfig}
      />

      <ZaloStatusModal
        isOpen={isZaloOpen}
        onClose={() => setIsZaloOpen(false)}
        onStatusUpdate={(connected) => setIsZaloConnected(connected)}
        onRoutingUpdate={(cfg) => setRoutingConfig(cfg)}
      />

      <CrmModal
        isOpen={isCrmOpen}
        onClose={() => setIsCrmOpen(false)}
        onLoadOrderToWaybill={handleLoadOrderFromCrm}
      />
    </div>
  );
}
