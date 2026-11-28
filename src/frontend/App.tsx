import { GROUP_MENU } from '../shared/service-menu';
import { ServiceDraftCard } from './components/ServiceDraftCard';
import { SUPPORT_MESSAGE } from '../shared/support-message';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { ExperimentChatPanel, type ExperimentMode } from './components/experiment/ExperimentChatPanel';
import { PassengerBookingPanel } from './components/experiment/PassengerBookingPanel';
import { CargoBookingPanel } from './components/experiment/CargoBookingPanel';
import { TourBookingPanel } from './components/experiment/TourBookingPanel';
import { OpsChatWindow } from './components/experiment/OpsChatWindow';
import { WaybillCard } from './components/WaybillCard';
import { SamplePromptsModal } from './components/SamplePromptsModal';
import { OrderHistoryModal } from './components/OrderHistoryModal';
import { SuccessOrderModal } from './components/SuccessOrderModal';
import { ZaloStatusModal } from './components/ZaloStatusModal';
import { CrmModal } from './components/CrmModal';
import { AdminAuthModal } from './components/AdminAuthModal';
import { DispatchMonitorModal } from './components/DispatchMonitorModal';
import { installAdminFetchInterceptor } from './utils/auth';
import { resolveAddressForDraft } from '../chatbot/validation/field-check';
import { AITrace, ChatMessage, ShippingInfo, OrderRecord, RoutingConfig } from '../shared/types';
import {
  INITIAL_SHIPPING_INFO,
  evaluateCompleteness,
  generateTrackingCode,
  DCE_OPS_PHONE,
  DEFAULT_SUPPLIER_NAME,
  DEFAULT_SUPPLIER_PHONE,
} from './utils/logistics';

const STORAGE_ORDERS_KEY = 'dev_bot_saved_orders_v1';
const CHAT_JOB_TIMEOUT_MS = 60_000;

async function requestChatJob(payload: Record<string, unknown>, requestId: string) {
  const started = Date.now();
  const headers = { 'Content-Type': 'application/json', 'X-Chat-Request-Id': requestId };
  let initial: any;
  // Reusing the same request ID makes a retry idempotent if the POST response was lost.
  while (!initial && Date.now() - started < CHAT_JOB_TIMEOUT_MS) {
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${body.error || response.statusText}`);
        Object.assign(error, { aiTrace: body.aiTrace, code: body.error });
        throw error;
      }
      initial = body;
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 500));
    }
  }
  if (!initial?.jobId) {
    const error = new Error('Không nhận được mã tác vụ chat trong giới hạn 1 phút.');
    Object.assign(error, { code: 'CHAT_JOB_TIMEOUT' });
    throw error;
  }

  while (Date.now() - started < CHAT_JOB_TIMEOUT_MS) {
    try {
      const response = await fetch(`/api/chat/jobs/${encodeURIComponent(initial.jobId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (body.status === 'running' || response.status === 202) {
        await new Promise(resolve => window.setTimeout(resolve, 500));
        continue;
      }
      if (!response.ok || body.status === 'error') {
        const error = new Error(body.error === 'CHAT_JOB_TIMEOUT'
          ? 'Qwen chưa hoàn tất trong 1 phút. Lượt này chưa có câu trả lời; hãy thử lại.'
          : `Chat thất bại: ${body.error || `HTTP ${response.status}`}`);
        Object.assign(error, { aiTrace: body.aiTrace, code: body.error });
        throw error;
      }
      if (body.status === 'done' && body.result) return body.result;
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw error;
      // A dropped poll does not cancel the server job. Retry status lookup until the deadline.
    }
    await new Promise(resolve => window.setTimeout(resolve, 500));
  }
  const error = new Error('Đã hết 1 phút chờ kết quả. Tác vụ chưa có phản hồi; hãy kiểm tra trạng thái trước khi gửi lại.');
  Object.assign(error, { code: 'CHAT_JOB_TIMEOUT' });
  throw error;
}

export default function App() {
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>(INITIAL_SHIPPING_INFO);
  const [isExperimentMode, setIsExperimentMode] = useState(false);
  const [experimentMode, setExperimentMode] = useState<ExperimentMode>('default');
  const [experimentMessages, setExperimentMessages] = useState<ChatMessage[]>([{
    id: 'experiment-welcome', sender: 'bot', text: 'Chào anh/chị, mình có thể hỗ trợ gì cho anh/chị hôm nay?',
    timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  }]);
  const [isExperimentLoading, setIsExperimentLoading] = useState(false);
  const [experimentId, setExperimentId] = useState(() => `experiment-${Date.now()}`);
  const [experimentPassengerDraft, setExperimentPassengerDraft] = useState<{ flow: 'ride' | 'rental' | null; fields: Record<string, unknown> }>({ flow: null, fields: {} });
  const [experimentShippingInfo, setExperimentShippingInfo] = useState<ShippingInfo>({ ...INITIAL_SHIPPING_INFO });
  const [isOpsActive, setIsOpsActive] = useState(false);
  const [isOpsWindowOpen, setIsOpsWindowOpen] = useState(false);
  const [opsName, setOpsName] = useState('Điều phối viên giả lập');
  const [opsMessages, setOpsMessages] = useState<ChatMessage[]>([]);
  const [isPassengerMatching, setIsPassengerMatching] = useState(false);
  const [matchedPartner, setMatchedPartner] = useState<any>(null);
  const [trackingCode, setTrackingCode] = useState<string>(generateTrackingCode());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const conversationVersion = useRef(0);
  const requestSequence = useRef(0);

  // Modals state
  const [isSamplesOpen, setIsSamplesOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState<boolean>(false);
  const [isZaloOpen, setIsZaloOpen] = useState<boolean>(false);
  const [isZaloConnected, setIsZaloConnected] = useState<boolean | null>(null);
  const [isCrmOpen, setIsCrmOpen] = useState<boolean>(false);
  const [isDispatchOpen, setIsDispatchOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isAuthRequired, setIsAuthRequired] = useState<boolean>(false);
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
      text: GROUP_MENU,
      quickReplies: [],
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const loadProtectedBootstrapData = () => {
    fetch('/api/zalo/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setIsZaloConnected(data.connected);
      })
      .catch(() => {
        setIsZaloConnected(false);
      });

    // Synchronize shipping orders from PostgreSQL shipbot-db
    fetch('/api/orders')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && Array.isArray(data.orders)) {
          setSavedOrders(data.orders);
        }
      })
      .catch((err) => {
        console.warn('Could not contact /api/orders, keeping localStorage:', err);
      });

    // Fetch dynamic Ops & Default Supplier routing config
    fetch('/api/config/routing')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.opsPhone) {
          setRoutingConfig(data);
        }
      })
      .catch(() => {});
  };

  // Check server health, Admin auth & Zalo status
  useEffect(() => {
    installAdminFetchInterceptor(() => {
      setIsAuthRequired(true);
      setIsAuthOpen(true);
    });

    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(data.hasApiKey);
      })
      .catch((err) => {
        console.warn('Could not contact /api/health:', err);
      });

    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        setIsAuthRequired(Boolean(data.authRequired));
        if (data.authRequired && !data.authorized) {
          setIsAuthOpen(true);
        } else {
          loadProtectedBootstrapData();
        }
      })
      .catch(() => {
        loadProtectedBootstrapData();
      });
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
    // If user clicked standard scenario shortcut
    if (userText === 'Dùng kịch bản mẫu đầy đủ') {
      setIsSamplesOpen(true);
      return;
    }

    const version = conversationVersion.current;
    const requestStarted = Date.now();
    // Instantly append user's message to the visible chat list
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}-${++requestSequence.current}`,
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

      const data = await requestChatJob({
          message: userText,
          history: historyPayload,
          currentInfo: shippingInfo,
        }, userMsg.id);
      if (version !== conversationVersion.current) return;

      if (data.shippingInfo) {
        // Backend is authoritative; re-evaluation used to overwrite nextQuestion and
        // incorrectly unlock orders while the backend was awaiting clarification.
        setShippingInfo({ ...data.shippingInfo, isConfirmed: Boolean(data.shippingInfo.isConfirmed) });
      }
      if (data.suppressed) return;

      const botMsg: ChatMessage = {
        id: `bot-${userMsg.id}`,
        replyToId: userMsg.id,
        aiTrace: data.aiTrace,
        sender: 'bot',
        text: data.reply || SUPPORT_MESSAGE,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        quickReplies: data.quickReplies || [],
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      if (version !== conversationVersion.current) return;
      console.error('Error contacting chat endpoint:', error);
      const errorMsg: ChatMessage = {
        id: `bot-err-${userMsg.id}`,
        replyToId: userMsg.id,
        aiTrace: (error as any)?.aiTrace || {
          source: 'error', reason: 'CHAT_REQUEST_FAILED', elapsedMs: Date.now() - requestStarted,
          steps: [{ node: 'web_request', status: 'error', reason: 'CHAT_REQUEST_FAILED', detail: { requestId: userMsg.id, error: error instanceof Error ? error.message : String(error) } }],
        },
        sender: 'bot',
        text: (error as any)?.code === 'CHAT_JOB_TIMEOUT'
          ? 'Qwen chưa trả kết quả trong 1 phút. Lượt này chưa có câu trả lời; hãy kiểm tra trạng thái tác vụ trước khi gửi lại.'
          : SUPPORT_MESSAGE,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        quickReplies: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (version === conversationVersion.current) setIsLoading(false);
    }
  };

  const handleUpdateShippingInfo = (updated: ShippingInfo) => {
    // Resolve only the addresses actually edited by the operator.
    for (const side of ['sender','receiver'] as const) if(updated[side].address!==shippingInfo[side].address) updated={...updated,[side]:{...updated[side],...resolveAddressForDraft(updated[side].address)}};
    updated={...updated,isConfirmed:false};
    const evalResult = evaluateCompleteness(updated);
    setShippingInfo({
      ...updated,
      ...evalResult,
      isComplete: !updated.pendingOperation && evalResult.isComplete,
    });
  };

  const handleReset = () => {
    conversationVersion.current++;
    setIsLoading(false);
    setShippingInfo(INITIAL_SHIPPING_INFO);
    setTrackingCode(generateTrackingCode());
    setMessages([
      {
        id: `msg-reset-${Date.now()}`,
        sender: 'bot',
        text: GROUP_MENU,
      quickReplies: [],
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const resetExperimentSession = (mode: ExperimentMode = experimentMode) => {
    setExperimentMode(mode);
    setExperimentId(`experiment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    setExperimentPassengerDraft({ flow: null, fields: {} });
    setExperimentShippingInfo({ ...INITIAL_SHIPPING_INFO });
    setExperimentMessages([{
      id: `experiment-welcome-${mode}-${Date.now()}`, sender: 'bot',
      text: 'Chào anh/chị, mình có thể hỗ trợ gì cho anh/chị hôm nay?',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    }]);
    setIsOpsActive(false);
    setIsOpsWindowOpen(false);
    setOpsMessages([]);
    setOpsName('Điều phối viên giả lập');
    setMatchedPartner(null);
    setIsPassengerMatching(false);
    setIsExperimentLoading(false);
  };

  const addExperimentBotMessage = (text: string, trace?: Array<{ step: string; status: 'ok' | 'skip' | 'error' | 'info'; detail?: unknown }>, replyToId?: string, source: AITrace['source'] = 'rule', elapsedMs = 0, reason = 'PASSENGER_EXPERIMENT_AGENT') => {
    const message: ChatMessage = {
      id: `experiment-bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'bot', text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      replyToId,
      ...(trace ? { aiTrace: {
        source, reason, elapsedMs,
        steps: trace.map((step) => ({ node: step.step, status: step.status, detail: step.detail && typeof step.detail === 'object' ? step.detail as Record<string, unknown> : undefined })),
      } } : {}),
    };
    setExperimentMessages(previous => [...previous, message]);
    return message;
  };

  const activateOpsHandover = (conversation: ChatMessage[], profile?: Record<string, unknown>) => {
    setIsOpsActive(true);
    setIsOpsWindowOpen(true);
    setOpsName(typeof profile?.displayName === 'string' ? profile.displayName : 'Điều phối viên giả lập');
    setOpsMessages(conversation);
  };

  const postPassengerAgentTurn = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/passenger-transport/agent-turn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const initial = await response.json();
    if (initial.status !== 'running' || typeof initial.jobId !== 'string') return initial;

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 1000));
      const result = await fetch(`/api/passenger-transport/agent-turn/${encodeURIComponent(initial.jobId)}`);
      const data = await result.json();
      if (result.status === 202 || data.status === 'running') continue;
      if (!result.ok) throw new Error(data.error || `HTTP error! status: ${result.status}`);
      return data;
    }
    throw new Error('Tác vụ chuyển người đã quá giới hạn 1 phút. Hãy kiểm tra luồng AI trước khi gửi lại để tránh chạy trùng lượt.');
  };

  const postCargoAgentTurn = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/cargo-transport/agent-turn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const initial = await response.json();
    if (initial.status !== 'running' || typeof initial.jobId !== 'string') return initial;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 1000));
      const result = await fetch(`/api/cargo-transport/agent-turn/${encodeURIComponent(initial.jobId)}`);
      const data = await result.json();
      if (result.status === 202 || data.status === 'running') continue;
      if (!result.ok) throw new Error(data.error || `HTTP error! status: ${result.status}`);
      return data;
    }
    throw new Error('Tác vụ chuyển hàng đã quá giới hạn 1 phút. Hãy kiểm tra luồng AI trước khi gửi lại để tránh chạy trùng lượt.');
  };

  const handleSendExperimentMessage = async (userText: string) => {
    const userMsg: ChatMessage = {
      id: `experiment-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender: 'user', text: userText,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    const newMessages = [...experimentMessages, userMsg];
    setExperimentMessages(newMessages);
    if (isOpsActive) {
      setOpsMessages(previous => [...previous, userMsg]);
      return;
    }
    setIsExperimentLoading(true);
    try {
      const passengerMode = experimentMode === 'passenger';
      const cargoMode = experimentMode === 'cargo';
      const historyPayload = newMessages.map(message => ({ role: message.sender === 'user' ? 'user' : 'model', content: message.text }));
      const data = passengerMode
        ? await postPassengerAgentTurn({ event: 'message', experimentId, message: userText, history: historyPayload.slice(-5) })
        : cargoMode
        ? await postCargoAgentTurn({ experimentId, message: userText, history: historyPayload.slice(-5), currentInfo: experimentShippingInfo })
        : await (async () => {
          return requestChatJob({ message: userText, history: historyPayload, currentInfo: experimentShippingInfo, experimentMode }, userMsg.id);
        })();
      if (passengerMode || cargoMode) {
        if (data.bookingDraft) setExperimentPassengerDraft(data.bookingDraft);
        if (cargoMode && data.shippingInfo) setExperimentShippingInfo(data.shippingInfo);
        const botMessage = addExperimentBotMessage(data.reply || 'Bot chưa tạo được phản hồi.', data.trace, userMsg.id, data.source || 'rule', data.elapsedMs || 0, data.reason || 'PASSENGER_EXPERIMENT_AGENT');
        if (data.handover) activateOpsHandover([...newMessages, botMessage], data.opsProfile);
        return;
      }
      if (data.shippingInfo) setExperimentShippingInfo(data.shippingInfo);
      if (data.suppressed) return;
      setExperimentMessages(previous => [...previous, {
        id: `experiment-bot-${Date.now()}`, sender: 'bot', text: data.reply || 'Bot chưa tạo được phản hồi.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        aiTrace: data.aiTrace, replyToId: userMsg.id,
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExperimentMessages(previous => [...previous, {
        id: `experiment-error-${Date.now()}`, sender: 'bot',
        text: `Không thể kết nối chatbot thử nghiệm. ${message}`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), replyToId: userMsg.id,
        aiTrace: { source: 'error', reason: 'EXPERIMENT_CHAT_REQUEST_FAILED', elapsedMs: 0,
          steps: [{ node: 'web_request', status: 'error', reason: 'EXPERIMENT_CHAT_REQUEST_FAILED' }] },
      }]);
    } finally { setIsExperimentLoading(false); }
  };

  const handlePassengerBookingReady = async (_flow: 'ride' | 'rental', booking: Record<string, unknown>) => {
    if (isOpsActive) return;
    setIsPassengerMatching(true);
    setMatchedPartner(null);
    try {
      const data = await postPassengerAgentTurn({ event: 'booking_ready', experimentId, booking });
      if (data.partner) setMatchedPartner({ ...data.partner, flow: booking.flow });
      const botMessage = addExperimentBotMessage(data.reply || 'Đã xử lý booking thử nghiệm.', data.trace);
      if (data.handover) activateOpsHandover([...experimentMessages, botMessage], data.opsProfile);
    } catch (error) {
      addExperimentBotMessage(`Không thể gọi API ghép đối tác thử nghiệm: ${error instanceof Error ? error.message : String(error)}`);
    } finally { setIsPassengerMatching(false); }
  };

  const handleOpsReply = (text: string) => {
    const reply: ChatMessage = {
      id: `ops-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: 'agent', text, timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setOpsMessages(previous => [...previous, reply]);
    setExperimentMessages(previous => [...previous, reply]);
  };

  const handleConfirmOrder = async () => {
    if (shippingInfo.subVertical !== "express" || !shippingInfo.isComplete || shippingInfo.pendingOperation) return;

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
    setShippingInfo({ ...order.shippingInfo, mainVertical: order.shippingInfo.mainVertical || "chuyen_hang", subVertical: order.shippingInfo.subVertical || "express" });
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
      setShippingInfo({ ...INITIAL_SHIPPING_INFO, ...info, ...(info.subVertical || info.mainVertical ? {} : (info.sender?.address || info.receiver?.address || info.cargo?.name ? {mainVertical:"chuyen_hang",subVertical:"express"} : {})) });
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
        onOpenDispatch={() => setIsDispatchOpen(true)}
        isAuthRequired={isAuthRequired}
        onOpenAdminLogin={() => setIsAuthOpen(true)}
      />

      {/* Main App Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 print:hidden">
        {/* Core 2-Column Responsive Workspace */}
        <div className={`grid grid-cols-1 ${isExperimentMode ? 'lg:grid-cols-2' : 'lg:grid-cols-12'} gap-5 h-[calc(100vh-6.5rem)] min-h-[600px]`}>
          {/* Left Column: AI Interactive Chat (7 cols on lg) */}
          <div className={`${isExperimentMode ? 'lg:col-span-1' : 'lg:col-span-7'} h-full flex flex-col min-h-0`}>
            {isExperimentMode ? <ExperimentChatPanel
              messages={experimentMessages}
              isLoading={isExperimentLoading}
              mode={experimentMode}
              onModeChange={resetExperimentSession}
              onSendMessage={handleSendExperimentMessage}
              onBack={() => setIsExperimentMode(false)}
              onReset={() => resetExperimentSession()}
              isOpsActive={isOpsActive}
              onOpenOps={() => setIsOpsWindowOpen(true)}
            /> : <ChatPanel
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              shippingInfo={shippingInfo}
              onSelectQuickReply={handleSendMessage}
              onOpenExperiment={() => setIsExperimentMode(true)}
            />}
          </div>

          {/* Right Column: Live Companion Waybill (5 cols on lg) */}
          {isExperimentMode ? <div className="lg:col-span-1 h-full min-h-0">
            {experimentMode === 'passenger' ? <PassengerBookingPanel
              key={experimentId}
              draft={experimentPassengerDraft}
              onBookingReady={handlePassengerBookingReady}
              isMatching={isPassengerMatching}
              matchedPartner={matchedPartner}
            /> : experimentMode === 'cargo' ? <CargoBookingPanel key={experimentId} info={experimentShippingInfo} /> : experimentMode === 'tour' ? <TourBookingPanel key={experimentId} info={experimentShippingInfo} /> : <section className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">{experimentMode === 'default' ? '?' : experimentMode === 'cargo' ? 'H' : 'T'}</div>
                <h2 className="mt-4 text-base font-bold text-slate-900">Bảng thông tin thử nghiệm</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">Chọn chế độ <strong>Chuyển người</strong> để mở bảng booking Ride/Rental. Bảng thông tin riêng cho chế độ này sẽ được thiết kế khi triển khai luồng tương ứng.</p>
              </div>
            </section>}
          </div> : <div className="lg:col-span-5 h-full flex flex-col min-h-0">
            {shippingInfo.subVertical === "express" ? <WaybillCard
              shippingInfo={shippingInfo}
              onUpdateInfo={handleUpdateShippingInfo}
              onConfirmOrder={handleConfirmOrder}
              trackingCode={trackingCode}
              routingConfig={routingConfig}
            /> : <ServiceDraftCard info={shippingInfo} onReset={handleReset} />}
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

      <DispatchMonitorModal
        isOpen={isDispatchOpen}
        onClose={() => setIsDispatchOpen(false)}
      />

      <AdminAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onVerified={() => {
          setIsAuthOpen(false);
          loadProtectedBootstrapData();
        }}
      />
    </div>
  );
}
