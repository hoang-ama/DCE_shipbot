import React, { useState } from 'react';
import { X, History, Trash2, Copy, Check, ExternalLink, Package } from 'lucide-react';
import { OrderRecord } from '../types';
import { generateShipmentTextSummary } from '../utils/logistics';

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OrderRecord[];
  onDeleteOrder: (id: string) => void;
  onClearAll: () => void;
  onSelectOrder: (order: OrderRecord) => void;
}

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  isOpen,
  onClose,
  orders,
  onDeleteOrder,
  onClearAll,
  onSelectOrder,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (order: OrderRecord) => {
    const text = generateShipmentTextSummary(order.shippingInfo, order.trackingCode);
    navigator.clipboard.writeText(text);
    setCopiedId(order.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Lịch Sử Đơn Vận Chuyển</h3>
              <p className="text-xs text-slate-300">
                {orders.length} đơn hàng đã lưu trên trình duyệt của bạn
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {orders.length > 0 && (
              <button
                onClick={onClearAll}
                className="px-2.5 py-1 text-xs text-rose-300 hover:text-rose-100 hover:bg-rose-900/50 rounded-lg transition-colors"
                title="Xóa toàn bộ lịch sử"
              >
                Xóa tất cả
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-3 bg-slate-50/50">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">Chưa có đơn hàng nào được lưu</p>
              <p className="text-xs text-slate-400 mt-1">
                Hãy trò chuyện với ShipBot và bấm "Xác nhận lên đơn" để lưu đơn hàng tại đây.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-blue-600">
                      {order.trackingCode}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                      Đã tạo đơn
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">{order.createdAt}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <span className="text-slate-400 text-[11px]">Lấy tại: </span>
                    <span className="text-slate-800 text-[11px] font-medium block line-clamp-2">
                      {order.shippingInfo.sender.address}
                    </span>
                    {order.shippingInfo.sender.phone && (
                      <span className="text-slate-400 font-mono text-[10px]">SĐT: {order.shippingInfo.sender.phone}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">Giao đến: </span>
                    <span className="text-slate-800 text-[11px] font-medium block line-clamp-2">
                      {order.shippingInfo.receiver.address}
                    </span>
                    {order.shippingInfo.receiver.phone && (
                      <span className="text-slate-400 font-mono text-[10px]">SĐT: {order.shippingInfo.receiver.phone}</span>
                    )}
                  </div>
                </div>

                <div className="p-2 bg-slate-50 rounded-lg text-xs flex flex-wrap items-center justify-between gap-1 mb-3">
                  <div>
                    <span className="text-slate-500">Hàng hóa: </span>
                    <span className="font-bold text-slate-800">
                      {order.shippingInfo.cargo.name || '---'}
                    </span>{' '}
                    <span className="text-slate-500">
                      {order.shippingInfo.cargo.weight ? `(${order.shippingInfo.cargo.weight})` : order.shippingInfo.cargo.weightKg ? `(${order.shippingInfo.cargo.weightKg} kg)` : ''}
                    </span>
                  </div>
                  {order.shippingInfo.deliveryTime && (
                    <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[11px] font-medium">
                      🕒 {order.shippingInfo.deliveryTime}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      onSelectOrder(order);
                      onClose();
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Xem lại trên phiếu</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopy(order)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs flex items-center gap-1 cursor-pointer"
                      title="Sao chép tóm tắt Zalo"
                    >
                      {copiedId === order.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => onDeleteOrder(order.id)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Xóa đơn này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
