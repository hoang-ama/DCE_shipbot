import React, { useState } from 'react';
import { Lock, X, ShieldCheck, AlertCircle } from 'lucide-react';
import { setStoredPasscode } from '../utils/auth';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onVerified: () => void;
  canDismiss?: boolean;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  canDismiss = true,
}) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError('Vui lòng nhập Admin Passcode');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': passcode.trim(),
        },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      if (res.ok) {
        setStoredPasscode(passcode.trim());
        setPasscode('');
        onVerified();
      } else {
        setError('Passcode không chính xác. Vui lòng thử lại.');
      }
    } catch {
      setError('Không thể kết nối máy chủ để xác thực.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Xác Thực Quản Trị Viên</h3>
              <p className="text-[11px] text-slate-300">
                Bảo vệ dữ liệu CRM, Đơn hàng, Zalo OA & Điều phối
              </p>
            </div>
          </div>
          {canDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Hệ thống đang bật bảo vệ <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800">ADMIN_PASSCODE</code>. Nhập mã bảo vệ để truy cập các API quản trị và điều phối live.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Admin API Key / Passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Nhập passcode quản trị..."
              autoFocus
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            {isSubmitting ? 'Đang kiểm tra...' : 'Mở Khóa Quản Trị'}
          </button>
        </form>
      </div>
    </div>
  );
};
