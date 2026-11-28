import { SERVICE_LABELS,GROUP_LABELS } from '../../shared/service-menu';
import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Mic,
  MicOff,
  Volume2,
  Workflow,
  FlaskConical,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { ChatMessage, ShippingInfo, AITraceSource, AITraceStep } from '../../shared/types';
import { completedTraceTurns, formatTraceTurn, formatRecentTraceTurns, copyTraceText, MAX_COPIED_TURNS } from '../trace-copy';

const TRACE_SOURCES: Record<AITraceSource, { label: string; color: string }> = {
  rule: { label: 'Rule-based', color: 'bg-emerald-100 text-emerald-800' },
  qwen: { label: 'Qwen trích xuất', color: 'bg-violet-100 text-violet-800' },
  gemini: { label: 'Gemini', color: 'bg-blue-100 text-blue-800' },
  rule_fallback: { label: 'Rule-based fallback', color: 'bg-amber-100 text-amber-900' },
  unknown: { label: 'Chưa xác định', color: 'bg-slate-100 text-slate-600' },
  error: { label: 'Lỗi request', color: 'bg-red-100 text-red-800' },
};
const NODE_NAMES: Record<string, string> = {
  service_router: 'Chọn dịch vụ', service_router_gemini: 'Gemini phân loại dịch vụ', ride_rule: 'Ride – Rule-based', ride_gemini: 'Ride – Gemini', rent_rule: 'Rent – Rule-based', rent_gemini: 'Rent – Gemini', truck_rule: 'Truck – Rule-based', truck_gemini: 'Truck – Gemini', tour_rule: 'Tour – Rule-based', tour_gemini: 'Tour – Gemini',
  rule: 'Rule-based / Fast Path', qwen: 'Qwen local', validate: 'Extraction Validator',
  rule_extract: 'Rule-based NLP / DCE', qwen_extract: 'Qwen Extract', qwen_reply: 'Qwen Reply',
  merge: 'Hợp nhất dữ liệu', reply_validate: 'Reply Validator', gemini_extract_validate: 'Gemini Extraction Validator', gemini_validate: 'Gemini Reply Validator', final: 'Kết quả cuối cùng',
  local_reply: 'Tạo phản hồi bằng Rule-based', rule_reply: 'Rule-based viết câu trả lời', rule_ops_fallback: 'Rule-based nhờ DCE Ops hỗ trợ', legacy_pipeline: 'Pipeline Express gốc',
  legacy_rule: 'Rule-based trong Express', legacy_extract: 'Regex / trích xuất sơ bộ',
  gemini: 'Gemini API', address_enrichment: 'Chuẩn hóa địa chỉ (DCE / Gemini)', legacy_reply: 'Tổng hợp dữ liệu và tạo phản hồi',
  legacy_fallback: 'Rule-based fallback', router: 'AI Router', web_request: 'Web request',
  legacy_result: 'Kết quả Express',
};
const STEP_STATUS: Record<AITraceStep['status'], { label: string; color: string }> = {
  ok: { label: 'OK', color: 'text-emerald-700 bg-emerald-50' },
  skip: { label: 'Bỏ qua', color: 'text-slate-600 bg-slate-100' },
  error: { label: 'Lỗi / từ chối', color: 'text-red-700 bg-red-50' },
  info: { label: 'Điều phối', color: 'text-blue-700 bg-blue-50' },
};
const REASONS: Record<string, string> = {
  RULE_VALIDATED: 'Rule-based đủ dữ liệu cho lượt này', UNHANDLED_TEXT: 'Còn nội dung chưa xử lý',
  TEXT_RECEIVED: 'Đã nhận câu trả lời từ Qwen', REPLY_VALIDATED: 'Câu trả lời qua kiểm tra',
  CANONICAL_FORM: 'Dùng phiếu xác nhận chính thức của backend', DATA_MERGED: 'Dữ liệu đã xác minh',
  SAFE_FALLBACK: 'Chỉ sử dụng thông tin đã xác minh', GEMINI_TEXT_RECEIVED: 'Gemini tạo câu trả lời',
  FAST_PATH: 'Khớp quy tắc, không gọi LLM', NO_MATCH: 'Không khớp quy tắc nhanh',
  RULE_DISABLED: 'Fast Path đang tắt', QWEN_DISABLED: 'Qwen đang tắt',
  DIRECT_LEGACY: 'Tác vụ được chuyển thẳng sang Express gốc',
  JSON_RECEIVED: 'Đã nhận JSON, chưa xác thực', VALIDATED: 'Dữ liệu Qwen đã qua kiểm tra',
  RULE_REPLY: 'Backend tạo câu trả lời, không gọi thêm LLM',
  QWEN_TIMEOUT: 'Qwen quá thời gian chờ', QWEN_BUSY: 'Qwen đang xử lý request khác',
  QWEN_INPUT_TOO_LONG: 'Đầu vào vượt giới hạn ký tự', NO_QWEN_RESULT: 'Không có kết quả Qwen để kiểm tra',
  GEMINI_JSON_RECEIVED: 'Gemini trả JSON; backend tiếp tục kiểm tra và tổng hợp', RULE_FOLLOWUP_SELECTED: 'Rule-based chọn tối đa hai trường còn thiếu để hỏi', RULE_RESPONSE_CREATED: 'Câu trả lời do Rule-based tạo', GEMINI_CREDITS_EXHAUSTED: 'Gemini báo hết credit; Rule-based hướng khách nhờ DCE Ops',
  GEMINI_NO_CLIENT: 'Gemini chưa được khởi tạo', GEMINI_TIMEOUT: 'Gemini quá thời gian chờ',
  GEMINI_REQUEST_ERROR: 'Lỗi gọi Gemini', GEMINI_EMPTY_RESPONSE: 'Gemini không trả nội dung',
  GEMINI_INVALID_JSON: 'Gemini trả JSON lỗi', LEGACY_CONFIRMATION: 'Xác nhận bằng quy tắc có sẵn',
  LEGACY_PROCESSING_ERROR: 'Lỗi xử lý Express; dùng fallback',
  ROUTER_DISABLED: 'AI Router đang tắt', CHAT_REQUEST_FAILED: 'Không nhận được kết quả từ API chat',
};
const formatDuration = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  shippingInfo: ShippingInfo;
  onSelectQuickReply: (text: string) => void;
  countdown?: number | null;
  onFlushNow?: () => void;
  onOpenExperiment?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  shippingInfo,
  onSelectQuickReply,
  countdown = null,
  onFlushNow,
  onOpenExperiment,
}) => {
  const [inputText, setInputText] = useState('');
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [expandedTraceSteps, setExpandedTraceSteps] = useState<Set<string>>(() => new Set());
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; status: 'ok' | 'error'; message: string } | null>(null);
  const copySequence = useRef(0);
  const traceDialogRef = useRef<HTMLDialogElement>(null);
  const traceButtonRef = useRef<HTMLButtonElement>(null);
  const traceCount = messages.filter(m => m.aiTrace).length;
  const turns = messages.filter(m => m.sender === 'user');
  const completedTurns = completedTraceTurns(messages);
  const completedById = new Map(completedTurns.map(turn => [turn.user.id, turn]));
  const copyCount = Math.min(completedTurns.length, MAX_COPIED_TURNS);

  const handleCopy = async (key: string, text: string, success: string) => {
    const dialog = traceDialogRef.current;
    if (!dialog) return;
    const sequence = ++copySequence.current;
    setCopyFeedback(null);
    try {
      await copyTraceText(text, dialog);
      if (sequence === copySequence.current) setCopyFeedback({ key, status: 'ok', message: success });
    } catch {
      if (sequence === copySequence.current) setCopyFeedback({ key, status: 'error', message: 'Không thể sao chép. Kiểm tra quyền clipboard của trình duyệt rồi thử lại.' });
    }
  };

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  useEffect(() => {
    const dialog = traceDialogRef.current;
    if (!dialog) return;
    if (isTraceOpen && !dialog.open) dialog.showModal();
    if (!isTraceOpen && dialog.open) dialog.close();
  }, [isTraceOpen]);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'vi-VN';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start speech recognition', err);
      }
    }
  };

  // Text to speech for bot message
  const speakMessage = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // Format message to ensure confirmation form fields 1) 2) 3) 4) are strictly separated by newlines
  const formatDisplayMessage = (text: string) => {
    if (!text) return '';
    if (text.includes('1)') && (text.includes('2)') || text.includes('3)'))) {
      return text
        .replace(/:\s*(?:1\)|1\.\s*)/g, ':\n1) ')
        .replace(/([^\n])\s*(?:2\)|2\.\s*)/g, '$1\n2) ')
        .replace(/([^\n])\s*(?:3\)|3\.\s*)/g, '$1\n3) ')
        .replace(/([^\n])\s*(?:4\)|4\.\s*)/g, '$1\n4) ');
    }
    return text;
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-inner">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight flex items-center gap-1.5">
              CSKH Đi Chung
              <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-semibold">
                Tư Vấn Đơn Hàng
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              {shippingInfo.subVertical ? SERVICE_LABELS[shippingInfo.subVertical] : shippingInfo.mainVertical ? GROUP_LABELS[shippingInfo.mainVertical] : "Chọn nhóm dịch vụ"}
            </p>
          </div>
        </div>

        {/* Right Header: Field Counter */}
        <div className="text-right hidden sm:block">
          <div className="text-[10px] text-slate-300">Đã điền</div>
          <div className="text-xs font-bold text-blue-400">
            {shippingInfo.subVertical === "express" ? `${4-shippingInfo.missingFields.length}/4 thông tin` : shippingInfo.subVertical ? "Phiếu tư vấn" : "Chọn dịch vụ"}
          </div>
        </div>
      </div>

      {onOpenExperiment && <div className="relative z-10 border-b border-slate-200 bg-white px-4 py-2.5">
        <button type="button" onClick={onOpenExperiment} disabled={isLoading}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-left transition-colors hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60">
          <span><span className="block text-[10px] font-semibold uppercase tracking-wide text-violet-700">Không gian riêng</span>
            <span className="text-sm font-bold text-slate-800">Mở chatbot thử nghiệm</span></span>
          <span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-xs"><FlaskConical className="h-4 w-4" />Thử nghiệm</span>
        </button>
      </div>}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60">
        {messages.map((message) => {
          const isBot = message.sender === 'bot';
          const isSystem = message.sender === 'system';

          if (isSystem) {
            return (
              <div key={message.id} className="flex justify-center my-2">
                <span className="text-xs px-3 py-1 bg-slate-200/70 text-slate-600 rounded-full">
                  {message.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${isBot ? 'justify-start' : 'justify-end'}`}
            >
              {isBot && (
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-[85%] sm:max-w-[75%] space-y-1`}>
                <div
                  className={`p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-2xs ${
                    isBot
                      ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                      : 'bg-blue-600 text-white rounded-tr-xs shadow-blue-500/10'
                  }`}
                >
                  {formatDisplayMessage(message.text)}
                </div>

                {isBot && message.id === messages.at(-1)?.id && !isLoading && !!message.quickReplies?.length && <div className="flex flex-wrap gap-2 pt-2">{message.quickReplies.map(choice => <button type="button" key={choice} onClick={() => onSelectQuickReply(choice)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">{choice}</button>)}</div>}
                {/* Message Meta & Action */}
                <div
                  className={`flex items-center gap-2 px-1 text-[11px] text-slate-400 ${
                    isBot ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <span>{message.timestamp}</span>
                  {isBot && message.aiTrace && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TRACE_SOURCES[message.aiTrace.source]?.color || 'bg-slate-100 text-slate-600'}`} title="Nguồn tạo câu trả lời">{TRACE_SOURCES[message.aiTrace.source]?.label || 'Nguồn chưa rõ'}</span>}
                  {isBot && (
                    <button
                      type="button"
                      onClick={() => speakMessage(message.text)}
                      className="p-1 hover:text-blue-600 transition-colors"
                      title="Đọc to tin nhắn"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {!isBot && (
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* Dichung is typing message bubble */}
        {isLoading && (
          <div className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-100/95 border border-slate-200/80 px-3.5 py-2.5 rounded-2xl rounded-tl-xs shadow-2xs flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Dichung is typing</span>
              <span className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 border border-blue-200/70 rounded-xl mb-2 text-xs text-blue-900 animate-in fade-in duration-150">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
            </span>
            <span className="font-semibold text-xs tracking-tight">Dichung is typing...</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2.5 rounded-xl border transition-all ${
                isListening
                  ? 'bg-red-500 text-white border-red-500 animate-pulse'
                  : 'bg-slate-50 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border-slate-200'
              }`}
              title={isListening ? 'Đang lắng nghe... bấm để dừng' : 'Nói bằng giọng nói tiếng Việt'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Nhập tin nhắn hoặc chọn dịch vụ…"
            className="flex-1 px-4 py-2.5 bg-slate-50 focus:bg-white text-sm text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white transition-colors shadow-sm shadow-blue-500/20 cursor-pointer"
            title="Gửi tin nhắn"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-slate-400 px-1">
          <button ref={traceButtonRef} type="button" onClick={() => setIsTraceOpen(true)}
            className="mr-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors"
            title="Xem các bước xử lý AI theo từng lượt trò chuyện" aria-haspopup="dialog">
            <Workflow className="w-3.5 h-3.5" /> Luồng AI <span className="rounded-full bg-blue-100 px-1.5 tabular-nums">{traceCount}</span>
          </button>
          <span>Nhấn Enter để gửi tin nhắn</span>
        </div>
      </form>
      <dialog ref={traceDialogRef} aria-labelledby="ai-trace-title"
        onCancel={() => setIsTraceOpen(false)}
        onClose={() => { ++copySequence.current; setCopyFeedback(null); setIsTraceOpen(false); traceButtonRef.current?.focus(); }}
        onClick={e => { if (e.target === e.currentTarget) setIsTraceOpen(false); }}
        className="fixed inset-0 m-auto w-[min(1180px,97vw)] max-h-[92vh] rounded-2xl border border-slate-200 bg-white text-slate-900 p-0 shadow-2xl backdrop:bg-slate-950/45 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="ai-trace-title" className="flex items-center gap-2 font-bold text-lg"><Workflow className="w-5 h-5 text-blue-600" /> Luồng xử lý AI</h2>
            <p className="text-xs text-slate-500 mt-1">{traceCount}/{turns.length} lượt có trace · Hội thoại web hiện tại</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end items-center gap-2">
            <button type="button" disabled={copyCount === 0}
              onClick={() => void handleCopy('all', formatRecentTraceTurns(completedTurns), `Đã sao chép ${copyCount} lượt.`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Sao chép tối đa 10 lượt đã kết thúc gần nhất, gồm tất cả chi tiết trace">
              {copyFeedback?.key === 'all' && copyFeedback.status === 'ok' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copyFeedback?.key === 'all' && copyFeedback.status === 'ok' ? 'Đã copy' : 'Copy All'} ({copyCount}/10)
            </button>
            <button type="button" autoFocus onClick={() => setIsTraceOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 text-slate-500" aria-label="Đóng luồng AI"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4 bg-slate-50">
          <div role="status" aria-live="polite" className={copyFeedback?.status === 'error' ? 'text-xs text-red-700' : 'text-xs text-emerald-700'}>{copyFeedback?.message}</div>
          <p className="text-xs text-slate-600">Trace lấy từ backend sau khi xử lý xong. Copy bao gồm toàn bộ chi tiết đã nhận, kể cả các Node đang thu gọn. Copy All lấy tối đa 10 lượt gần nhất đã kết thúc. Nội dung có thể chứa thông tin khách hàng; kiểm tra trước khi chia sẻ.</p>
          {turns.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Chưa có lượt chat. Hãy gửi một tin nhắn để xem luồng AI.</div>}
          {turns.map((user, i) => {
            const completed = completedById.get(user.id);
            const reply = completed?.reply;
            const trace = reply?.aiTrace;
            const source = trace ? (TRACE_SOURCES[trace.source] || TRACE_SOURCES.unknown) : null;
            return <article key={user.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Lượt {i + 1} · {user.timestamp}</span>
                {source && <span className={`rounded-full px-2 py-1 font-semibold ${source.color}`}>{source.label}</span>}
                {trace && <span className="ml-auto font-mono text-slate-500">{formatDuration(trace.elapsedMs)}</span>}
              </div>
              <p className="text-sm break-words whitespace-pre-wrap"><span className="font-semibold text-blue-700">Khách: </span>{user.text}</p>
              {trace ? <div className="border-l-2 border-slate-200 ml-1 pl-3 space-y-2">
                {trace.steps.map((step, j) => {
                  const status = STEP_STATUS[step.status] || STEP_STATUS.info;
                  const stepKey = `${user.id}:${j}`;
                  const isExpanded = expandedTraceSteps.has(stepKey);
                  const detailEntries = Object.entries(step.detail || {}).filter(([, value]) => value !== undefined);
                  const toggleStep = () => setExpandedTraceSteps(previous => {
                    const next = new Set(previous);
                    if (next.has(stepKey)) next.delete(stepKey); else next.add(stepKey);
                    return next;
                  });
                  const detailLabel = (key: string) => ({ input: 'INPUT · Dữ liệu đầu vào', output: 'OUTPUT · Kết quả đầu ra', error: 'ERROR · Lỗi', reply: 'OUTPUT · Nội dung phản hồi', request: 'INPUT · Request', response: 'OUTPUT · Response' }[key.toLowerCase()] || key);
                  return <div key={j} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <span className="absolute -left-[19px] top-4 h-2.5 w-2.5 bg-blue-400 ring-2 ring-white rounded-full" />
                    <button type="button" aria-expanded={isExpanded} onClick={toggleStep}
                      className="flex w-full flex-wrap items-center gap-2 bg-slate-50 px-4 py-3 text-left hover:bg-blue-50/70">
                      <span className="font-semibold text-sm">{j + 1}. {NODE_NAMES[step.node] || step.node}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${status.color}`}>{status.label}</span>
                      {step.elapsedMs !== undefined && <span className="ml-auto text-xs text-slate-500 tabular-nums">{formatDuration(step.elapsedMs)}</span>}
                      <span className="w-full text-xs text-blue-700">{isExpanded ? 'Nhấn để thu gọn' : `Nhấn để xem INPUT / OUTPUT / ERROR${detailEntries.length ? ` · ${detailEntries.length} mục` : ''}`}</span>
                    </button>
                    {step.reason && <div className="px-4 pb-3 text-xs text-slate-600">{REASONS[step.reason] && <span>{REASONS[step.reason]} · </span>}<code>{step.reason}</code></div>}
                    {isExpanded && <div className="space-y-3 border-t border-slate-200 p-4">
                      {detailEntries.length ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{detailEntries.map(([key, value]) => <section key={key} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <h4 className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">{detailLabel(key)}</h4>
                        <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed font-mono">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
                      </section>)}</div> : <p className="text-sm text-slate-500">Node này không có payload chi tiết.</p>}
                      <div className="flex justify-end"><button type="button"
                        onClick={() => void handleCopy(`${stepKey}:copy`, JSON.stringify({ turn: i + 1, customerInput: user.text, botOutput: reply?.text || null, node: step.node, status: step.status, reason: step.reason || null, elapsedMs: step.elapsedMs ?? null, detail: step.detail || null }, null, 2), `Đã sao chép đầy đủ Node ${j + 1} của lượt ${i + 1}.`)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                        {copyFeedback?.key === `${stepKey}:copy` && copyFeedback.status === 'ok' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}Copy toàn bộ node
                      </button></div>
                    </div>}
                  </div>;
                })}
              </div> : <div className="text-xs text-slate-500 rounded-lg bg-slate-50 p-3">{reply ? 'Backend không trả trace cho lượt này.' : isLoading ? 'Đang xử lý, trace sẽ xuất hiện khi có phản hồi.' : 'Chưa nhận được trace.'}</div>}
              {reply && <p className="text-sm whitespace-pre-wrap break-words border-t border-slate-100 pt-2"><span className="font-semibold text-slate-700">Bot: </span>{reply.text}</p>}
              {completed && <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                {copyFeedback?.key === user.id && <span className={`text-xs ${copyFeedback.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{copyFeedback.status === 'ok' ? 'Đã sao chép' : 'Sao chép thất bại'}</span>}
                <button type="button" onClick={() => void handleCopy(user.id, formatTraceTurn(completed), `Đã sao chép lượt ${i + 1}.`)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  aria-label={`Sao chép toàn bộ luồng lượt ${i + 1}`} title="Sao chép input, output, lỗi và tất cả Node của lượt này">
                  {copyFeedback?.key === user.id && copyFeedback.status === 'ok' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
              </div>}
            </article>;
          })}
        </div>
      </dialog>
    </div>
  );
};
