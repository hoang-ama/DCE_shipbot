import React, { useState } from 'react';
import { AppState, OrderFormData } from '../../../chatbot/playground/types';
import { STATE_DETAILS } from '../constants';
import { 
  GitFork, 
  FileJson, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Truck, 
  ChevronRight,
  ClipboardCopy,
  Check,
  FilePlus2
} from 'lucide-react';

interface StateTrackerProps {
  currentState: AppState;
  formData: OrderFormData;
  onOpenMermaid: () => void;
  onReset: () => void;
  onNewOrder: () => void;
  isProcessing: boolean;
  isQuotaLimited?: boolean;
}

export const StateTracker: React.FC<StateTrackerProps> = ({
  currentState,
  formData,
  onOpenMermaid,
  onReset,
  onNewOrder,
  isProcessing,
  isQuotaLimited = false,
}) => {
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const stateInfo = STATE_DETAILS[currentState];

  // Calculate completed fields count
  const filledCount = [
    formData.dia_chi_lay_hang,
    formData.dia_chi_giao_hang,
    formData.thong_tin_hang,
    formData.thoi_gian_giao_nhan,
  ].filter(Boolean).length;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(formData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine stage progression
  const isStep1Active = currentState === 'COLLECTING_INFO';
  const isStep1Done = filledCount === 4 && currentState !== 'COLLECTING_INFO';

  const isStep2Active =
    currentState === 'WAITING_DCE' ||
    currentState === 'CLARIFYING_FOR_DCE' ||
    currentState === 'WAITING_DRIVER_PHONE_DCE';
  const isStep2Done =
    [
      'WAITING_CSDT',
      'CLARIFYING_FOR_CSDT',
      'QUOTED_WAITING_CUSTOMER',
      'COLLECTING_RECIPIENT_PHONE',
      'COLLECTING_SENDER_PHONE',
      'COLLECTING_PAYMENT_PARTY',
      'COLLECTING_PAYMENT_TIME',
      'WAITING_DRIVER_PHONE_DCE',
      'WAITING_DRIVER_PHONE_CSDT',
      'CUSTOMER_DECLINED',
      'COMPLETED',
      'REJECTED',
    ].includes(currentState) && !isStep2Active;

  const isStep3Active =
    currentState === 'WAITING_CSDT' ||
    currentState === 'CLARIFYING_FOR_CSDT' ||
    currentState === 'WAITING_DRIVER_PHONE_CSDT';
  const isStep3Done =
    [
      'QUOTED_WAITING_CUSTOMER',
      'COLLECTING_RECIPIENT_PHONE',
      'COLLECTING_SENDER_PHONE',
      'COLLECTING_PAYMENT_PARTY',
      'COLLECTING_PAYMENT_TIME',
      'WAITING_DRIVER_PHONE_DCE',
      'WAITING_DRIVER_PHONE_CSDT',
      'CUSTOMER_DECLINED',
      'COMPLETED',
      'REJECTED',
    ].includes(currentState) &&
    isStep2Done &&
    !isStep3Active;

  const isQuotedWaiting = currentState === 'QUOTED_WAITING_CUSTOMER';
  const isCollectingPhones =
    currentState === 'COLLECTING_RECIPIENT_PHONE' || currentState === 'COLLECTING_SENDER_PHONE';
  const isCollectingPaymentParty = currentState === 'COLLECTING_PAYMENT_PARTY';
  const isCollectingPaymentTime = currentState === 'COLLECTING_PAYMENT_TIME';
  const isWaitingDriverPhone =
    currentState === 'WAITING_DRIVER_PHONE_DCE' || currentState === 'WAITING_DRIVER_PHONE_CSDT';
  const isCustomerDeclined = currentState === 'CUSTOMER_DECLINED';
  const isCompleted = currentState === 'COMPLETED';
  const isRejected = currentState === 'REJECTED';

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-30">
      {/* Top Main Row */}
      <div className="max-w-[1700px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Current State */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                Logistics Chat Coordinator
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Gemini 3.8 Flash
              </span>
              {isQuotaLimited && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                  title="Hạn mức Free Tier của Gemini Flash đạt giới hạn ngày. Hệ thống đang tự động điều phối bằng Smart Dispatch Engine để đảm bảo trải nghiệm liên tục."
                >
                  ⚡ Smart Dispatch Active
                </span>
              )}
            </div>

            {/* Current State pill badge */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Current State:
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border transition-all ${
                  currentState === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700'
                    : currentState === 'REJECTED'
                    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700'
                    : currentState === 'CUSTOMER_DECLINED'
                    ? 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                    : currentState === 'QUOTED_WAITING_CUSTOMER'
                    ? 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-700'
                    : currentState === 'COLLECTING_RECIPIENT_PHONE' || currentState === 'COLLECTING_SENDER_PHONE'
                    ? 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-700'
                    : currentState === 'COLLECTING_PAYMENT_PARTY'
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700'
                    : currentState === 'COLLECTING_PAYMENT_TIME'
                    ? 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-700'
                    : currentState === 'WAITING_DCE' || currentState === 'WAITING_DRIVER_PHONE_DCE'
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                    : currentState === 'WAITING_CSDT' || currentState === 'WAITING_DRIVER_PHONE_CSDT'
                    ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-700'
                    : currentState.startsWith('CLARIFYING')
                    ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700'
                    : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isProcessing ? 'animate-ping' : ''
                  } ${
                    currentState === 'COMPLETED'
                      ? 'bg-emerald-500'
                      : currentState === 'REJECTED'
                      ? 'bg-rose-500'
                      : currentState === 'CUSTOMER_DECLINED'
                      ? 'bg-slate-500'
                      : currentState === 'QUOTED_WAITING_CUSTOMER'
                      ? 'bg-sky-500'
                      : currentState === 'COLLECTING_RECIPIENT_PHONE' || currentState === 'COLLECTING_SENDER_PHONE'
                      ? 'bg-cyan-500'
                      : currentState === 'COLLECTING_PAYMENT_PARTY'
                      ? 'bg-indigo-500'
                      : currentState === 'COLLECTING_PAYMENT_TIME'
                      ? 'bg-violet-500'
                      : currentState === 'WAITING_DCE' || currentState === 'WAITING_DRIVER_PHONE_DCE'
                      ? 'bg-amber-500'
                      : currentState === 'WAITING_CSDT' || currentState === 'WAITING_DRIVER_PHONE_CSDT'
                      ? 'bg-orange-500'
                      : currentState.startsWith('CLARIFYING')
                      ? 'bg-purple-500'
                      : 'bg-blue-500'
                  }`}
                />
                {currentState}
              </div>

              {isProcessing && (
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" />
                  AI đang xử lý...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Stage Pipeline stepper */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              isStep1Active
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : isStep1Done
                ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700'
                : 'text-slate-400'
            }`}
          >
            <span>1. Form đã tiếp nhận</span>
            {isStep1Done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          </div>

          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />

          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              isStep2Active
                ? 'bg-amber-600 text-white shadow-sm font-semibold'
                : isStep2Done
                ? 'text-slate-600 dark:text-slate-300'
                : 'text-slate-400'
            }`}
          >
            <span>2. Đội xe DCE</span>
            {isStep2Done && !isStep3Active && currentState === 'COMPLETED' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>

          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />

          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
              isStep3Active
                ? 'bg-orange-600 text-white shadow-sm font-semibold'
                : isStep3Done
                ? 'text-slate-600 dark:text-slate-300'
                : 'text-slate-400'
            }`}
          >
            <span>3. Đội xe CSĐT</span>
            {isStep3Done && currentState === 'COMPLETED' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>

          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />

          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium ${
              isCompleted
                ? 'bg-emerald-600 text-white shadow-sm font-bold'
                : isWaitingDriverPhone
                ? 'bg-amber-600 text-white shadow-sm font-semibold'
                : isCollectingPaymentTime
                ? 'bg-violet-600 text-white shadow-sm font-semibold'
                : isCollectingPaymentParty
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : isCollectingPhones
                ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                : isQuotedWaiting
                ? 'bg-sky-600 text-white shadow-sm font-semibold'
                : isCustomerDeclined
                ? 'bg-slate-600 text-white shadow-sm font-bold'
                : isRejected
                ? 'bg-rose-600 text-white shadow-sm font-bold'
                : 'text-slate-400'
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>Chốt đi đơn</span>
              </>
            ) : isWaitingDriverPhone ? (
              <span>4. Xin SĐT tài xế</span>
            ) : isCollectingPaymentTime ? (
              <span>4. Thời điểm TT</span>
            ) : isCollectingPaymentParty ? (
              <span>4. Bên thanh toán</span>
            ) : isCollectingPhones ? (
              <span>4. Xin SĐT nhận/gửi</span>
            ) : isQuotedWaiting ? (
              <span>4. Chờ khách chốt</span>
            ) : isCustomerDeclined ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-white" />
                <span>Khách từ chối</span>
              </>
            ) : isRejected ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-white" />
                <span>Từ chối (Reject)</span>
              </>
            ) : (
              <span>4. Kết quả</span>
            )}
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Form JSON preview button */}
          <button
            onClick={() => setShowJsonModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
            title="Xem dữ liệu JSON của Form đơn hàng"
          >
            <FileJson className="w-4 h-4 text-indigo-500" />
            <span>Form Data JSON</span>
            <span
              className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                filledCount === 4
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
              }`}
            >
              {filledCount}/4 trường
            </span>
          </button>

          {/* Mermaid Diagram modal button */}
          <button
            onClick={onOpenMermaid}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition shadow-xs"
          >
            <GitFork className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Sơ đồ State Machine</span>
            <span className="sm:hidden">Sơ đồ</span>
          </button>

          {/* New Empty Order button */}
          <button
            onClick={onNewOrder}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Nhập một Form đơn hàng khác"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Đơn mới</span>
          </button>

          {/* Reset to pre-filled form button */}
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Khôi phục đơn mẫu và gửi lại sang DCE"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Sub-bar: Explanation of current state */}
      <div className={`px-4 py-2 border-t text-xs ${stateInfo.bgLight} ${stateInfo.borderColor} flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: stateInfo.color }} />
            {stateInfo.title}:
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            {stateInfo.description}
          </span>
        </div>

        {/* Quick form fields summary inline */}
        <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500 font-mono truncate">
          <span className="truncate max-w-[220px]">Lấy: <strong className="text-slate-800 dark:text-slate-200">{formData.dia_chi_lay_hang || '—'}</strong></span>
          <span className="truncate max-w-[220px]">Giao: <strong className="text-slate-800 dark:text-slate-200">{formData.dia_chi_giao_hang || '—'}</strong></span>
          <span>Hàng: <strong className="text-slate-800 dark:text-slate-200">{formData.thong_tin_hang || '—'}</strong></span>
          <span>TG: <strong className="text-slate-800 dark:text-slate-200">{formData.thoi_gian_giao_nhan || '—'}</strong></span>
        </div>
      </div>

      {/* JSON Form Data Drawer / Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Dữ liệu Form đơn hàng hiện tại (Real-time JSON)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Đã sao chép' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={() => setShowJsonModal(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Form summary key-value cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-medium block">1) Địa chỉ lấy hàng:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formData.dia_chi_lay_hang || '⚠️ Chưa có'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-medium block">2) Địa chỉ giao hàng:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formData.dia_chi_giao_hang || '⚠️ Chưa có'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-medium block">3) Thông tin hàng:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formData.thong_tin_hang || '⚠️ Chưa có'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-medium block">4) Thời gian giao nhận:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formData.thoi_gian_giao_nhan || '⚠️ Chưa có'}
                  </span>
                </div>
                {(formData.sdt_nguoi_nhan || formData.sdt_nguoi_gui) && (
                  <>
                    <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800">
                      <span className="text-cyan-700 dark:text-cyan-300 font-medium block">SĐT người nhận:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formData.sdt_nguoi_nhan || '—'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                      <span className="text-teal-700 dark:text-teal-300 font-medium block">SĐT người gửi:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formData.sdt_nguoi_gui || '—'}
                      </span>
                    </div>
                  </>
                )}
                {formData.ben_thanh_toan && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                    <span className="text-indigo-700 dark:text-indigo-300 font-medium block">Bên thanh toán tiền cước:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formData.ben_thanh_toan}
                    </span>
                  </div>
                )}
                {formData.thoi_diem_thanh_toan && (
                  <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800">
                    <span className="text-violet-700 dark:text-violet-300 font-medium block">Thời điểm thanh toán:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formData.thoi_diem_thanh_toan}
                    </span>
                  </div>
                )}
                {formData.sdt_tai_xe && (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 sm:col-span-2">
                    <span className="text-amber-700 dark:text-amber-300 font-medium block">SĐT tài xế nhận đơn:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formData.sdt_tai_xe}
                    </span>
                  </div>
                )}
              </div>

              {formData.thong_tin_bo_sung && (
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs">
                  <span className="font-semibold text-purple-800 dark:text-purple-300 block mb-0.5">
                    Thông tin bổ sung đã làm rõ:
                  </span>
                  <span className="text-purple-700 dark:text-purple-400">
                    {formData.thong_tin_bo_sung}
                  </span>
                </div>
              )}

              {/* Raw JSON Code viewer */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                  JSON Raw Payload:
                </label>
                <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-52 border border-slate-800">
                  {JSON.stringify(formData, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setShowJsonModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg text-xs font-semibold hover:opacity-90 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
