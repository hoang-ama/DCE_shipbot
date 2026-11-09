/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { WaybillCard } from './components/WaybillCard';
import { SamplePromptsModal } from './components/SamplePromptsModal';
import { OrderHistoryModal } from './components/OrderHistoryModal';
import { SuccessOrderModal } from './components/SuccessOrderModal';
import { ZaloStatusModal } from './components/ZaloStatusModal';
import { CrmModal } from './components/CrmModal';
import { ChatMessage, ShippingInfo, OrderRecord } from './types';
import {
  INITIAL_SHIPPING_INFO,
  evaluateCompleteness,
  generateTrackingCode,
} from './utils/logistics';

const STORAGE_ORDERS_KEY = 'shipbot_saved_orders_v1';

export default function App() {
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>(INITIAL_SHIPPING_INFO);
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
      text: 'Bên em chuyên về dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Vui lòng cung cấp thông tin địa chỉ giao nhận để bên em tư vấn',
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

    // Instantly append user's message to the visible chat list
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
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
          currentInfo: shippingInfo,
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
          isConfirmed,
        });
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: data.reply || 'Dạ em đã cập nhật thông tin vận chuyển!',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        quickReplies: data.quickReplies || [],
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
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateShippingInfo = (updated: ShippingInfo) => {
    const evalResult = evaluateCompleteness(updated);
    setShippingInfo({
      ...updated,
      ...evalResult,
    });
  };

  const handleReset = () => {
    setShippingInfo(INITIAL_SHIPPING_INFO);
    setTrackingCode(generateTrackingCode());
    setMessages([
      {
        id: `msg-reset-${Date.now()}`,
        sender: 'bot',
        text: 'Bên em chuyên về dịch vụ vận chuyển hỏa tốc, giao nhận tận nơi. Vui lòng cung cấp thông tin địa chỉ giao nhận để bên em tư vấn',
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-6.5rem)] min-h-[600px]">
          {/* Left Column: AI Interactive Chat (7 cols on lg) */}
          <div className="lg:col-span-7 h-full flex flex-col min-h-0">
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              shippingInfo={shippingInfo}
              onSelectQuickReply={handleSendMessage}
            />
          </div>

          {/* Right Column: Live Companion Waybill (5 cols on lg) */}
          <div className="lg:col-span-5 h-full flex flex-col min-h-0">
            <WaybillCard
              shippingInfo={shippingInfo}
              onUpdateInfo={handleUpdateShippingInfo}
              onConfirmOrder={handleConfirmOrder}
              trackingCode={trackingCode}
            />
          </div>
        </div>
      </main>

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
      />

      <SuccessOrderModal
        isOpen={isSuccessOpen}
        onClose={() => setIsSuccessOpen(false)}
        shippingInfo={shippingInfo}
        trackingCode={trackingCode}
        onNewOrder={handleReset}
      />

      <ZaloStatusModal
        isOpen={isZaloOpen}
        onClose={() => setIsZaloOpen(false)}
        onStatusUpdate={(connected) => setIsZaloConnected(connected)}
      />

      <CrmModal
        isOpen={isCrmOpen}
        onClose={() => setIsCrmOpen(false)}
        onLoadOrderToWaybill={handleLoadOrderFromCrm}
      />
    </div>
  );
}
