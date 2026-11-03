import React, { useState } from 'react';
import { CheckCircle2, Copy, Check, X, PackageCheck } from 'lucide-react';
import { ShippingInfo } from '../types';
import { generateShipmentTextSummary } from '../utils/logistics';

interface SuccessOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  shippingInfo: ShippingInfo;
  trackingCode: string;
  onNewOrder: () => void;
}

export const SuccessOrderModal: React.FC<SuccessOrderModalProps> = ({
  isOpen,
  onClose,
  shippingInfo,
  trackingCode,
  onNewOrder,
}) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const handleCopy = () => {
    const text = generateShipmentTextSummary(shippingInfo, trackingCode);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white mb-3 shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-extrabold tracking-tight">Tạo Đơn Vận Chuyển Thành Công!</h3>
          <p className="text-emerald-100 text-xs mt-1">
            Đơn hàng đã được lưu và sẵn sàng điều phối bưu tá đến lấy hàng
          </p>
        </div>

        {/* Details Card */}
        <div className="p-6 space-y-4">
          {/* Tracking Code Highlight */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Mã vận đơn bưu cục Đi Chung
            </div>
            <div className="text-xl font-mono font-black text-slate-900 tracking-wider mt-0.5">
              {trackingCode}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center justify-center gap-1">
              <PackageCheck className="w-3.5 h-3.5" />
              Đã sẵn sàng bốc dỡ và vận chuyển
            </div>
          </div>

          {/* Quick Summary Grid */}
          <div className="space-y-2 text-xs border border-slate-200 rounded-xl p-3.5">
            <div className="flex justify-between items-start">
              <span className="text-slate-500">Lấy tại:</span>
              <span className="font-semibold text-slate-800 text-right max-w-[70%]">
                {shippingInfo.sender.address}
                {shippingInfo.sender.phone && ` (${shippingInfo.sender.phone})`}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500">Giao đến:</span>
              <span className="font-semibold text-slate-800 text-right max-w-[70%]">
                {shippingInfo.receiver.address}
                {shippingInfo.receiver.phone && ` (${shippingInfo.receiver.phone})`}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500">Mặt hàng:</span>
              <span className="font-semibold text-slate-800 text-right">
                {shippingInfo.cargo.name || '---'}
                {shippingInfo.cargo.weight ? ` (${shippingInfo.cargo.weight})` : shippingInfo.cargo.weightKg ? ` (${shippingInfo.cargo.weightKg} kg)` : ''}
              </span>
            </div>
            {shippingInfo.cargo.dimensions.raw && (
              <div className="flex justify-between items-start">
                <span className="text-slate-500">Kích thước:</span>
                <span className="font-mono text-slate-800 text-right">
                  {shippingInfo.cargo.dimensions.raw}
                </span>
              </div>
            )}
            <div className="flex justify-between items-start">
              <span className="text-slate-500">Thời gian giao nhận:</span>
              <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-right">
                {shippingInfo.deliveryTime || 'Tiêu chuẩn'}
              </span>
            </div>
            {shippingInfo.cargo.specialNotes && (
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-500">Ghi chú:</span>
                <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-medium">
                  {shippingInfo.cargo.specialNotes}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleCopy}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Đã sao chép vào bộ nhớ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Sao chép thông tin đơn hàng (gửi Zalo / Khách hàng)</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onClose();
                onNewOrder();
              }}
              className="w-full py-2.5 px-4 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-semibold text-center hover:bg-slate-50 transition-colors cursor-pointer"
            >
              + Tạo thêm đơn vận chuyển khác
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
