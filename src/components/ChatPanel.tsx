import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Mic,
  MicOff,
  Volume2,
  Workflow,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { ChatMessage, ShippingInfo, AITraceStep, BusinessFlow } from '../types';
import { BUSINESS_FLOWS, getBusinessFlowLabel } from '../utils/businessFlows';
import { completedTraceTurns, formatTraceTurn, formatRecentTraceTurns, copyTraceText, MAX_COPIED_TURNS } from '../utils/traceCopy';

const NODE_NAMES: Record<string, string> = {
  web_request: 'Nhận yêu cầu Web', maps_expand: 'Mở rộng liên kết Google Maps', confirmation_rule: 'Kiểm tra xác nhận đơn', confirmed_order_guard: 'Bảo vệ đơn đã xác nhận',
  fast_extract: 'Trích xuất nhanh (Rule-based)', address_reverse_geocode: 'Chuẩn hóa địa chỉ', gemini_prompt: 'Tạo prompt Gemini', gemini: 'Gọi Gemini API', gemini_parse: 'Đọc kết quả Gemini',
  merge: 'Hợp nhất dữ liệu', completeness: 'Kiểm tra độ đầy đủ', rule_reply: 'Tạo phản hồi Rule-based', reply_validation: 'Kiểm tra phản hồi', fallback_reply: 'Phản hồi dự phòng', pipeline_error: 'Lỗi pipeline', final: 'Kết quả cuối cùng',
};
const STEP_STATUS: Record<AITraceStep['status'], { label: string; color: string }> = {
  ok: { label: 'OK', color: 'text-emerald-700 bg-emerald-50' }, skip: { label: 'Bỏ qua', color: 'text-slate-600 bg-slate-100' },
  error: { label: 'Lỗi', color: 'text-red-700 bg-red-50' }, info: { label: 'Thông tin', color: 'text-blue-700 bg-blue-50' },
};
const formatDuration = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  shippingInfo: ShippingInfo;
  onSelectQuickReply: (text: string) => void;
  selectedBusinessFlow: BusinessFlow | null;
  onSelectBusinessFlow: (flow: BusinessFlow) => void;
  countdown?: number | null;
  onFlushNow?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  shippingInfo,
  onSelectQuickReply,
  selectedBusinessFlow,
  onSelectBusinessFlow,
  countdown = null,
  onFlushNow,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isBusinessFlowOpen, setIsBusinessFlowOpen] = useState(false);
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; status: 'ok' | 'error'; message: string } | null>(null);
  const traceDialogRef = useRef<HTMLDialogElement>(null);
  const traceButtonRef = useRef<HTMLButtonElement>(null);
  const turns = messages.filter(m => m.sender === 'user');
  const completedTurns = completedTraceTurns(messages);
  const completedById = new Map(completedTurns.map(turn => [turn.user.id, turn]));
  const traceCount = messages.filter(m => Boolean(m.aiTrace)).length;
  const copyCount = Math.min(completedTurns.length, MAX_COPIED_TURNS);
  const handleTraceCopy = async (key: string, text: string, success: string) => {
    const dialog = traceDialogRef.current;
    if (!dialog) return;
    try { await copyTraceText(text, dialog); setCopyFeedback({ key, status: 'ok', message: success }); }
    catch { setCopyFeedback({ key, status: 'error', message: 'Không thể sao chép. Kiểm tra quyền clipboard của trình duyệt rồi thử lại.' }); }
  };
  useEffect(() => {
    const dialog = traceDialogRef.current;
    if (!dialog) return;
    if (isTraceOpen && !dialog.open) dialog.showModal();
    if (!isTraceOpen && dialog.open) dialog.close();
  }, [isTraceOpen]);
  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);
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
              Dịch ngược địa chỉ • Hàng hóa • Thời gian giao nhận
            </p>
          </div>
        </div>

        {/* Right Header: Field Counter */}
        <div className="text-right hidden sm:block">
          <div className="text-[10px] text-slate-300">Đã điền</div>
          <div className="text-xs font-bold text-blue-400">
            {4 - shippingInfo.missingFields.length}/4 thông tin
          </div>
        </div>
      </div>

      {/* Business flow selector */}
      <div className="relative z-10 border-b border-slate-200 bg-white px-4 py-2.5">
        <button type="button" onClick={() => setIsBusinessFlowOpen(open => !open)} disabled={isLoading}
          aria-expanded={isBusinessFlowOpen} aria-controls="business-flow-options"
          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${selectedBusinessFlow ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'}`}>
          <span><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Luồng nghiệp vụ</span>
            <span className="text-sm font-bold text-slate-800">{selectedBusinessFlow ? getBusinessFlowLabel(selectedBusinessFlow) : 'Chọn một trong 3 luồng để bắt đầu'}</span></span>
          <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-xs">{isBusinessFlowOpen ? 'Đóng' : selectedBusinessFlow ? 'Đổi luồng' : 'Chọn luồng'}</span>
        </button>
        {isBusinessFlowOpen && <div id="business-flow-options" className="absolute left-3 right-3 top-full mt-1 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:grid-cols-3" role="group" aria-label="Chọn luồng nghiệp vụ">
          {BUSINESS_FLOWS.map(flow => <button key={flow.id} type="button" disabled={isLoading} onClick={() => { onSelectBusinessFlow(flow.id); setIsBusinessFlowOpen(false); }}
            className={`rounded-xl border p-3 text-left transition-colors ${selectedBusinessFlow === flow.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
            <span className="flex items-center justify-between gap-2 text-sm font-bold text-slate-800">{flow.label}{selectedBusinessFlow === flow.id && <Check className="h-4 w-4 text-blue-600" />}</span>
            <span className="mt-2 block space-y-1 text-[11px] leading-relaxed text-slate-500">{flow.subServices.map(service => <span key={service} className="block">• {service}</span>)}</span>
            <span className="mt-2 block text-[10px] text-slate-400">Hiện dùng cùng quy trình chat</span>
          </button>)}
        </div>}
      </div>

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

                {/* Message Meta & Action */}
                <div
                  className={`flex items-center gap-2 px-1 text-[11px] text-slate-400 ${
                    isBot ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <span>{message.timestamp}</span>
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
              disabled={!selectedBusinessFlow}
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
            placeholder={selectedBusinessFlow ? 'Nhập tin nhắn để bắt đầu…' : 'Chọn luồng nghiệp vụ phía trên để bắt đầu'}
            disabled={!selectedBusinessFlow}
            className="flex-1 px-4 py-2.5 bg-slate-50 focus:bg-white text-sm text-slate-800 placeholder-slate-400 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
          />

          <button
            type="submit"
            disabled={!selectedBusinessFlow || !inputText.trim()}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white transition-colors shadow-sm shadow-blue-500/20 cursor-pointer"
            title="Gửi tin nhắn"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-slate-400 px-1">
          <button ref={traceButtonRef} type="button" onClick={() => setIsTraceOpen(true)}
            className="mr-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors"
            title="Xem luồng xử lý AI và log theo từng lượt chat" aria-haspopup="dialog">
            <Workflow className="w-3.5 h-3.5" /> Luồng AI <span className="rounded-full bg-blue-100 px-1.5 tabular-nums">{traceCount}</span>
          </button>
          <span>Nhấn Enter để gửi tin nhắn</span>
        </div>
      </form>
      <dialog ref={traceDialogRef} aria-labelledby="ai-trace-title"
        onCancel={() => setIsTraceOpen(false)}
        onClose={() => { setCopyFeedback(null); setIsTraceOpen(false); traceButtonRef.current?.focus(); }}
        onClick={e => { if (e.target === e.currentTarget) setIsTraceOpen(false); }}
        className="fixed inset-0 m-auto w-[min(760px,94vw)] max-h-[85vh] rounded-2xl border border-slate-200 bg-white text-slate-900 p-0 shadow-2xl backdrop:bg-slate-950/45 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3">
          <div><h2 id="ai-trace-title" className="flex items-center gap-2 font-bold text-lg"><Workflow className="w-5 h-5 text-blue-600" /> Luồng xử lý AI</h2>
            <p className="text-xs text-slate-500 mt-1">{traceCount}/{turns.length} lượt có trace · Hội thoại web hiện tại</p></div>
          <div className="flex shrink-0 flex-wrap justify-end items-center gap-2">
            <button type="button" disabled={copyCount === 0} onClick={() => void handleTraceCopy('all', formatRecentTraceTurns(completedTurns), `Đã sao chép ${copyCount} lượt.`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Sao chép tối đa 10 lượt chat gần nhất">{copyFeedback?.key === 'all' && copyFeedback.status === 'ok' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copyFeedback?.key === 'all' && copyFeedback.status === 'ok' ? 'Đã copy' : 'Copy All'} ({copyCount}/10)</button>
            <button type="button" autoFocus onClick={() => setIsTraceOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 text-slate-500" aria-label="Đóng luồng AI"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4 bg-slate-50">
          <div role="status" aria-live="polite" className={copyFeedback?.status === 'error' ? 'text-xs text-red-700' : 'text-xs text-emerald-700'}>{copyFeedback?.message}</div>
          <p className="text-xs text-slate-600">Trace được tạo bởi backend sau mỗi lượt chat. Có thể chứa nội dung tin nhắn và thông tin khách hàng; kiểm tra trước khi chia sẻ.</p>
          {turns.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Chưa có lượt chat. Hãy gửi tin nhắn để xem luồng AI.</div>}
          {turns.map((user, i) => {
            const completed = completedById.get(user.id); const reply = completed?.reply; const trace = reply?.aiTrace;
            return <article key={user.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-slate-500">Lượt {i + 1} · {user.timestamp}</span>
                {trace && <span className="rounded-full px-2 py-1 font-semibold bg-blue-100 text-blue-800">{trace.source === 'gemini' ? 'Gemini' : trace.source === 'rule' ? 'Rule-based' : trace.source === 'error' ? 'Lỗi' : 'Rule fallback'}</span>}
                {trace && <span className="ml-auto font-mono text-slate-500">{formatDuration(trace.elapsedMs)}</span>}</div>
              <p className="text-sm break-words whitespace-pre-wrap"><span className="font-semibold text-blue-700">Khách: </span>{user.text}</p>
              {trace ? <div className="border-l-2 border-slate-200 ml-1 pl-3 space-y-2">{trace.steps.map((step, j) => {
                const status = STEP_STATUS[step.status] || STEP_STATUS.info;
                return <div key={j} className="relative rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="absolute -left-[19px] top-3 h-2.5 w-2.5 bg-blue-400 ring-2 ring-white rounded-full" />
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">{j + 1}. {NODE_NAMES[step.node] || step.node}</span><span className={`rounded px-1.5 py-0.5 ${status.color}`}>{status.label}</span>
                    {step.reason && <code className="text-slate-500">{step.reason}</code>}{step.elapsedMs !== undefined && <span className="ml-auto text-slate-500 tabular-nums">{formatDuration(step.elapsedMs)}</span>}</div>
                  {step.detail && <details className="mt-2 rounded border border-slate-200 bg-white"><summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-blue-700">Xem log / input / output</summary>
                    <div className="space-y-2 px-3 pb-3">{Object.entries(step.detail).filter(([, value]) => value !== undefined).map(([key, value]) => <div key={key}><div className="text-[11px] font-semibold text-slate-600 mb-1">{key}</div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-100 p-2 text-xs font-mono">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></div>)}</div></details>}
                </div>;
              })}</div> : <div className="text-xs text-slate-500 rounded-lg bg-slate-50 p-3">{reply ? 'Backend không trả trace cho lượt này.' : isLoading ? 'Đang xử lý, trace sẽ xuất hiện khi có phản hồi.' : 'Chưa nhận được trace.'}</div>}
              {reply && <p className="text-sm whitespace-pre-wrap break-words border-t border-slate-100 pt-2"><span className="font-semibold text-slate-700">Bot: </span>{reply.text}</p>}
              {completed && <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">{copyFeedback?.key === user.id && <span className={`text-xs ${copyFeedback.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{copyFeedback.status === 'ok' ? 'Đã sao chép' : 'Sao chép thất bại'}</span>}
                <button type="button" onClick={() => void handleTraceCopy(user.id, formatTraceTurn(completed), `Đã sao chép lượt ${i + 1}.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" aria-label={`Sao chép toàn bộ luồng lượt ${i + 1}`}>
                  {copyFeedback?.key === user.id && copyFeedback.status === 'ok' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}Copy</button></div>}
            </article>;
          })}
        </div>
      </dialog>
    </div>
  );
};
