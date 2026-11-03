import React from 'react';
import { Package, Sparkles, RotateCcw, History, Lightbulb } from 'lucide-react';

interface HeaderProps {
  hasApiKey: boolean;
  completionRate: number;
  onReset: () => void;
  onOpenSamples: () => void;
  onOpenHistory: () => void;
  savedOrdersCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  hasApiKey,
  completionRate,
  onReset,
  onOpenSamples,
  onOpenHistory,
  savedOrdersCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900">
                Đi Chung <span className="text-emerald-600">Express</span>
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                CSKH Vận Chuyển
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Tư vấn & Tiếp nhận thông tin đơn hàng tự động
            </p>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* AI Status Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-xs font-semibold text-blue-700 border border-blue-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span>Gemini 3.8 Flash</span>
          </div>

          {/* Sample Prompts */}
          <button
            onClick={onOpenSamples}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg text-slate-700 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-colors"
            title="Xem kịch bản đơn mẫu"
          >
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Kịch bản mẫu</span>
          </button>

          {/* Orders History */}
          <button
            onClick={onOpenHistory}
            className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg text-slate-700 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-colors"
            title="Đơn hàng đã lưu"
          >
            <History className="w-4 h-4 text-indigo-500" />
            <span className="hidden sm:inline">Lịch sử</span>
            {savedOrdersCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-blue-600 rounded-full">
                {savedOrdersCount}
              </span>
            )}
          </button>

          {/* New Order / Reset */}
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="Tạo đơn mới"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Tạo đơn mới</span>
          </button>
        </div>
      </div>
    </header>
  );
};
