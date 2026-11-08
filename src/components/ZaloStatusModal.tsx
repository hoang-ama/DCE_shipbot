import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Key,
  ShieldAlert,
  Terminal,
  ExternalLink,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';

interface ZaloStatusData {
  connected: boolean;
  tokenValid: boolean;
  zaloError: number | null;
  zaloMessage: string;
  config: {
    appId: string;
    hasAppSecret: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    accessTokenMasked: string | null;
    refreshTokenMasked: string | null;
  };
  stats: {
    activeSessions: number;
    serverTime: string;
    uptimeSeconds: number;
  };
  logs: Array<{
    timestamp: string;
    type: 'incoming_webhook' | 'outgoing_reply' | 'token_refresh' | 'token_update' | 'error';
    summary: string;
    details?: any;
  }>;
}

interface ZaloStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: (connected: boolean) => void;
}

export const ZaloStatusModal: React.FC<ZaloStatusModalProps> = ({
  isOpen,
  onClose,
  onStatusUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ZaloStatusData | null>(null);
  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [refreshTokenInput, setRefreshTokenInput] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'update' | 'logs' | 'guide'>('overview');
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/zalo/status');
      const json: ZaloStatusData = await res.json();
      setData(json);
      if (onStatusUpdate) {
        onStatusUpdate(json.connected);
      }
    } catch (err: any) {
      console.error('Failed to fetch Zalo status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const handleUpdateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessTokenInput.trim() && !refreshTokenInput.trim()) {
      setActionMessage({ text: 'Vui lòng nhập Access Token hoặc Refresh Token!', isError: true });
      return;
    }

    setIsUpdating(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/zalo/update-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: accessTokenInput.trim() || undefined,
          refreshToken: refreshTokenInput.trim() || undefined,
        }),
      });
      const resJson = await res.json();
      if (resJson.success) {
        setActionMessage({
          text: resJson.message || 'Cập nhật token thành công!',
          isError: !resJson.tokenValid,
        });
        setAccessTokenInput('');
        setRefreshTokenInput('');
        fetchStatus();
      } else {
        setActionMessage({ text: resJson.error || 'Cập nhật thất bại', isError: true });
      }
    } catch (err: any) {
      setActionMessage({ text: `Lỗi kết nối: ${err.message}`, isError: true });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRefreshNow = async () => {
    setIsUpdating(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/zalo/refresh-now', {
        method: 'POST',
      });
      const resJson = await res.json();
      if (resJson.success) {
        setActionMessage({ text: 'Làm mới token thành công!', isError: false });
        fetchStatus();
      } else {
        setActionMessage({
          text: resJson.message || 'Không thể làm mới token bằng Refresh Token hiện tại.',
          isError: true,
        });
      }
    } catch (err: any) {
      setActionMessage({ text: `Lỗi: ${err.message}`, isError: true });
    } finally {
      setIsUpdating(false);
    }
  };

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/zalo/webhook`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
                data?.connected ? 'bg-emerald-600 shadow-emerald-500/20' : 'bg-rose-500 shadow-rose-500/20'
              }`}
            >
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">Trạng Thái Kết Nối Zalo OA</h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    data?.connected
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      data?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {data?.connected ? 'Đang Hoạt Động' : 'Mất Kết Nối'}
                </span>
              </div>
              <p className="text-xs text-slate-500">Giám sát & Quản lý Access Token, Webhook Zalo OA</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Làm mới trạng thái"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-5 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Tổng quan & Trạng thái
          </button>
          <button
            onClick={() => setActiveTab('update')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'update'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Cập nhật Token
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Nhật ký sự kiện ({data?.logs?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'guide'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Hướng dẫn Debug
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {actionMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-medium border flex items-start gap-2 ${
                actionMessage.isError
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {actionMessage.isError ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              )}
              <span className="flex-1">{actionMessage.text}</span>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Banner Status */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  data?.connected
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50/70 border-rose-200 text-rose-900'
                }`}
              >
                {data?.connected ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                )}
                <div className="text-xs space-y-1">
                  <p className="font-bold text-sm">
                    {data?.connected
                      ? 'Zalo OA đang kết nối và sẵn sàng phản hồi khách'
                      : 'Cảnh báo: Bot không thể gửi tin nhắn phản hồi tới Zalo OA'}
                  </p>
                  <p className="text-slate-600">
                    Chi tiết: <strong className="font-mono">{data?.zaloMessage || 'Đang kiểm tra...'}</strong>
                  </p>
                  {data?.zaloError === -216 && (
                    <p className="text-rose-700 font-semibold mt-1">
                      👉 Nguyên nhân: Access Token có hạn 25 giờ và đã hết hạn. Hãy chuyển qua tab "Cập nhật Token" để dán mã mới!
                    </p>
                  )}
                </div>
              </div>

              {/* Grid Thông số */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium">Access Token hiện hành</span>
                  <div className="font-mono font-semibold text-slate-800 truncate">
                    {data?.config.accessTokenMasked || 'Chưa có'}
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${data?.tokenValid ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className={data?.tokenValid ? 'text-emerald-700' : 'text-rose-700 font-semibold'}>
                      {data?.tokenValid ? 'Hợp lệ' : 'Không hợp lệ / Hết hạn'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium">Refresh Token</span>
                  <div className="font-mono font-semibold text-slate-800 truncate">
                    {data?.config.refreshTokenMasked || 'Chưa cấu hình'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {data?.config.hasRefreshToken ? 'Đã lưu trên hệ thống' : 'Chưa lưu'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium">Webhook Endpoint URL</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-700 truncate">
                      {window.location.origin}/api/zalo/webhook
                    </span>
                    <button
                      onClick={copyWebhookUrl}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="Copy URL"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium">Phiên chat Zalo đang ghi nhớ</span>
                  <div className="font-bold text-slate-800 text-sm">
                    {data?.stats.activeSessions ?? 0} khách hàng
                  </div>
                  <div className="text-[11px] text-slate-500">Tự động duy trì hội thoại liên tục</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('update')}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  Dán & Cập nhật Token mới
                </button>
                <button
                  type="button"
                  onClick={handleRefreshNow}
                  disabled={isUpdating}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                  Thử Refresh Token
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: UPDATE TOKEN */}
          {activeTab === 'update' && (
            <form onSubmit={handleUpdateToken} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
                <p className="font-bold mb-1">💡 Hướng dẫn lấy Token từ Zalo Developers trong 30 giây:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-700 text-[11px]">
                  <li>
                    Truy cập trang{' '}
                    <a
                      href="https://developers.zalo.me/tools/explorer"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 font-bold underline inline-flex items-center gap-0.5"
                    >
                      API Explorer Zalo <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Chọn: Version 4 | Loại: <strong>OA Access Token</strong></li>
                  <li>Chọn Ứng dụng: <strong>Đi Chung Express</strong> | Chọn OA: <strong>Dịch vụ hàng hóa Đi Chung</strong></li>
                  <li>Nhấn nút <strong>Tạo Access Token</strong> hoặc copy ô <strong>Access token</strong> & <strong>Refresh token</strong> dán vào form bên dưới.</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Access Token mới (Bắt buộc nếu token cũ hết hạn):</label>
                <textarea
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  placeholder="Dán mã Access Token bắt đầu bằng x9xDJ... vào đây"
                  rows={3}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Refresh Token mới (Tùy chọn - khuyên dùng để tự động gia hạn):</label>
                <input
                  type="text"
                  value={refreshTokenInput}
                  onChange={(e) => setRefreshTokenInput(e.target.value)}
                  placeholder="Dán mã Refresh Token bắt đầu bằng PZ7g0..."
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Lưu & Kích Hoạt Ngay
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500 pb-1">
                <span>Nhật ký 20 sự kiện gần nhất giữa ShipBot & Zalo OA:</span>
                <button
                  onClick={fetchStatus}
                  className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className="w-3 h-3" /> Làm mới log
                </button>
              </div>

              {(!data?.logs || data.logs.length === 0) ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
                  Chưa có sự kiện nào được ghi nhận từ khi server khởi động.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto font-mono text-[11px]">
                  {data.logs.map((log, idx) => {
                    const isErr = log.type === 'error';
                    const isHook = log.type === 'incoming_webhook';
                    const isOut = log.type === 'outgoing_reply';
                    const isRef = log.type === 'token_refresh';

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                          isErr
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : isHook
                            ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                            : isOut
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <span className="text-slate-400 shrink-0 text-[10px] mt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                        </span>
                        <div className="flex-1 space-y-0.5">
                          <div className="font-semibold">{log.summary}</div>
                          {log.details && (
                            <pre className="text-[10px] text-slate-500 whitespace-pre-wrap overflow-x-auto max-h-24 bg-white/60 p-1.5 rounded border border-slate-200/60">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GUIDE */}
          {activeTab === 'guide' && (
            <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-slate-700" />
                  1. Cách xem Live Logs trên Render (Nơi bot chạy thực tế)
                </div>
                <p className="text-slate-600">
                  Vào trang <strong>dashboard.render.com</strong> &rarr; Chọn Web Service <strong>dce-shipbot</strong> &rarr; Click tab <strong>Logs</strong>.
                </p>
                <p className="text-slate-600">
                  Tại đây sẽ hiển thị dòng: <code className="bg-slate-200 px-1 rounded">[Zalo OA] Incoming message...</code> hoặc <code className="bg-slate-200 px-1 rounded">[Zalo OA] Send response: &#123; error: -216... &#125;</code> để biết chính xác nguyên nhân lỗi.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  2. Cách dùng nút "Test Webhook" trên Zalo Developers
                </div>
                <p className="text-slate-600">
                  Vào <strong>developers.zalo.me</strong> &rarr; <strong>Official Account</strong> &rarr; <strong>Webhook</strong> &rarr; Kéo xuống bảng sự kiện &rarr; Nhấn nút <strong>Test</strong> màu xanh tại dòng <code className="bg-slate-200 px-1 rounded">user_send_text</code>.
                </p>
                <p className="text-slate-600">
                  Zalo sẽ gửi gói tin thử nghiệm và hiển thị mã <strong>200 OK</strong> kèm nội dung <code className="bg-slate-200 px-1 rounded">&#123; error: 0, message: "Received" &#125;</code>.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-600" />
                  3. Vì sao Access Token bị hết hạn sau 25 giờ?
                </div>
                <p className="text-slate-600">
                  Đây là quy định bảo mật của Zalo (OAuth v4). Access Token chỉ tồn tại tối đa 25 giờ. ShipBot đã có cơ chế tự động gia hạn (Refresh Token), tuy nhiên nếu Refresh Token bị xoay vòng hoặc server Render khởi động lại sau 15 phút không hoạt động, bạn chỉ cần mở modal này và dán mã mới là bot hoạt động trở lại ngay lập tức.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500">
          <span>Thời gian máy chủ: {data?.stats.serverTime ? new Date(data.stats.serverTime).toLocaleString('vi-VN') : '---'}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
