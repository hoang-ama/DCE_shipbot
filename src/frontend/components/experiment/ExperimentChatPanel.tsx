import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  FlaskConical,
  RotateCcw,
  Send,
  User,
  Workflow,
  X,
} from 'lucide-react';
import type { AITraceStep, ChatMessage } from '../../../shared/types';
import { copyTraceText, formatTraceTurn, MAX_COPIED_TURNS, type TraceTurn } from '../../trace-copy';

export type ExperimentMode = 'default' | 'passenger' | 'cargo' | 'tour';

const MODES: Array<{ id: ExperimentMode; label: string; description: string }> = [
  { id: 'default', label: 'Mặc định', description: 'Chưa rõ khách muốn dịch vụ nào' },
  { id: 'passenger', label: 'Chuyển người', description: 'Ride và thuê xe' },
  { id: 'cargo', label: 'Chuyển hàng', description: 'Express và xe tải' },
  { id: 'tour', label: 'Tour', description: 'Du lịch và tour' },
];

const NODE_LABELS: Record<string, string> = {
  passenger_agent: 'Điều phối chatbot chuyển người',
  cargo_agent: 'Điều phối chatbot chuyển hàng',
  rule_flow_selection: 'Rule xác định Ride hay Rental',
  rule_service_selection: 'Rule xác định Express hay xe tải',
  rule_greeting_short: 'Rule xử lý lời chào/câu ngắn',
  qwen_prompt: 'Chuẩn bị prompt và 5 tin gần nhất cho Qwen',
  qwen_generate: 'Gọi Qwen local và đọc JSON trả về',
  qwen_flow_classifier: 'Qwen phân biệt Ride với Rental khi rule chưa rõ',
  rule_map_fields: 'Chuẩn hóa tên trường Qwen sang hồ sơ Ride/Rental',
  rule_validate_fields: 'Rule kiểm tra và chuẩn hóa trường dữ liệu',
  gemini_fallback_trigger: 'Kích hoạt Gemini khi Qwen chưa trích xuất được dữ liệu mới',
  gemini_extract: 'Gemini đọc lại hội thoại để trích xuất dữ liệu',
  passenger_booking_draft: 'Cập nhật hồ sơ chuyển người thử nghiệm',
  booking_validation: 'Kiểm tra booking',
  partner_match_function: 'Gọi hàm ghép đối tác',
  ops_handover: 'Chuyển điều phối viên',
  collect_booking_details: 'Thu thập thông tin booking',
  web_request: 'Gửi yêu cầu tới backend',
  gemini_prompt: 'Tạo prompt Gemini',
  gemini: 'Gọi Gemini API',
  gemini_parse: 'Đọc kết quả Gemini',
  fast_extract: 'Trích xuất nhanh bằng luật',
  merge: 'Hợp nhất dữ liệu',
  completeness: 'Kiểm tra thông tin còn thiếu',
  rule_reply: 'Tạo phản hồi bằng luật',
  fallback_reply: 'Tạo phản hồi dự phòng',
  final: 'Hoàn tất phản hồi',
};

const STATUS_LABELS: Record<AITraceStep['status'], { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-emerald-50 text-emerald-700' },
  skip: { label: 'Bỏ qua', className: 'bg-slate-100 text-slate-600' },
  error: { label: 'Lỗi', className: 'bg-red-50 text-red-700' },
  info: { label: 'Thông tin', className: 'bg-blue-50 text-blue-700' },
};

interface ExperimentChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  mode: ExperimentMode;
  onModeChange: (mode: ExperimentMode) => void;
  onSendMessage: (text: string) => void;
  onBack: () => void;
  onReset: () => void;
  isOpsActive: boolean;
  onOpenOps: () => void;
}

function makeTraceTurns(messages: ChatMessage[], mode: ExperimentMode): TraceTurn[] {
  const traceMessages = messages.filter((message) => message.aiTrace);
  return traceMessages.map((reply, index) => {
    const customerMessage = reply.replyToId
      ? messages.find((message) => message.id === reply.replyToId && message.sender === 'user')
      : undefined;
    const user: ChatMessage = customerMessage || {
      id: 'trace-event-' + reply.id,
      sender: 'system',
      text: mode === 'passenger'
        ? 'Tác vụ nền: kiểm tra booking hoặc ghép đối tác.'
        : 'Tác vụ chatbot không gắn với một tin nhắn khách cụ thể.',
      timestamp: reply.timestamp,
    };
    return { index: index + 1, user, reply };
  });
}

async function writeTrace(text: string, container: HTMLDialogElement | null): Promise<void> {
  if (!container) throw new Error('Không tìm thấy khung luồng AI.');
  await copyTraceText(text, container);
}

export const ExperimentChatPanel: React.FC<ExperimentChatPanelProps> = ({
  messages,
  isLoading,
  mode,
  onModeChange,
  onSendMessage,
  onBack,
  onReset,
  isOpsActive,
  onOpenOps,
}) => {
  const [inputText, setInputText] = useState('');
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [expandedTraceNodes, setExpandedTraceNodes] = useState<Set<string>>(() => new Set());
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; status: 'ok' | 'error'; message: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const traceDialogRef = useRef<HTMLDialogElement>(null);
  const traceButtonRef = useRef<HTMLButtonElement>(null);
  const selectedMode = MODES.find((item) => item.id === mode) || MODES[0];
  const traceTurns = makeTraceTurns(messages, mode);
  const copiedTurns = traceTurns.slice(-MAX_COPIED_TURNS);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const dialog = traceDialogRef.current;
    if (!dialog) return;
    if (isTraceOpen && !dialog.open) dialog.showModal();
    if (!isTraceOpen && dialog.open) dialog.close();
  }, [isTraceOpen]);

  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = window.setTimeout(() => setCopyFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  const handleCopy = async (key: string, text: string, successMessage: string) => {
    try {
      await writeTrace(text, traceDialogRef.current);
      setCopyFeedback({ key, status: 'ok', message: successMessage });
    } catch {
      setCopyFeedback({
        key,
        status: 'error',
        message: 'Không thể sao chép. Kiểm tra quyền clipboard của trình duyệt rồi thử lại.',
      });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setInputText('');
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-violet-950 via-indigo-950 to-slate-900 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/25 text-violet-200">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">Chatbot thử nghiệm</h2>
            <p className="truncate text-xs text-violet-200">Đang thử: {selectedMode.label}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10" title="Xóa phiên thử nghiệm và bắt đầu lại">
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" /> Chat chính
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Chế độ thử nghiệm nội bộ">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isLoading || isOpsActive}
              aria-pressed={mode === item.id}
              onClick={() => item.id !== mode && onModeChange(item.id)}
              className={'rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60 ' + (mode === item.id ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/50')}
            >
              <span className="block text-sm font-bold text-slate-800">{item.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{item.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-slate-500">Các chế độ trên chỉ dành cho người thử nghiệm. Trong hội thoại, bot chỉ nhắn tin và không hiển thị nút lựa chọn cho khách.</p>
        <p className="mt-1 px-1 text-[11px] text-amber-700">{mode === 'passenger' ? 'Tin nhắn dùng Qwen3-0.6B local qua cổng 8765; lời chào ngắn do rule xử lý. Matcher đối tác vẫn là giả lập, không gửi booking thật.' : 'Chế độ này dùng pipeline chat hiện tại; các pipeline riêng sẽ được nối sau.'}</p>
        {isOpsActive && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>Ops đã tiếp quản. Bot tạm dừng trả lời; tin nhắn tiếp theo của khách sẽ chuyển vào khung Ops.</span>
          <button type="button" onClick={onOpenOps} className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 font-semibold text-white hover:bg-amber-800">Mở khung Ops</button>
        </div>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4" aria-live="polite">
        {messages.map((message) => {
          const isBot = message.sender === 'bot' || message.sender === 'agent';
          return (
            <div key={message.id} className={'flex items-start gap-2.5 ' + (isBot ? 'justify-start' : 'justify-end')}>
              {isBot && <div className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ' + (message.sender === 'agent' ? 'bg-emerald-600' : 'bg-violet-600')}>{message.sender === 'agent' ? <span className="text-[10px] font-bold">OPS</span> : <Bot className="h-4 w-4" />}</div>}
              <div className={'max-w-[88%] space-y-1 ' + (isBot ? '' : 'order-first')}>
                <div className={'whitespace-pre-wrap break-words rounded-2xl p-3.5 text-sm leading-relaxed shadow-xs ' + (message.sender === 'agent' ? 'rounded-tl-sm border border-emerald-200 bg-emerald-50 text-slate-800' : isBot ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-800' : 'rounded-tr-sm bg-violet-700 text-white')}>
                  {message.text}
                </div>
                <div className={'px-1 text-[10px] text-slate-400 ' + (isBot ? 'text-left' : 'text-right')}>{message.sender === 'agent' ? 'Ops · ' : ''}{message.timestamp}</div>
              </div>
              {!isBot && <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"><User className="h-4 w-4" /></div>}
            </div>
          );
        })}
        {isLoading && !isOpsActive && <div className="flex items-center gap-2 pl-10 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />Bot đang soạn tin nhắn…</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder={isOpsActive ? 'Nhập tin nhắn tiếp theo của khách…' : 'Nhập tin nhắn để thử nghiệm…'}
            aria-label="Tin nhắn thử nghiệm"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-hidden transition-all placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
          <button type="submit" disabled={isLoading || !inputText.trim()} className="rounded-xl bg-violet-700 p-3 text-white shadow-sm transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50" title={isOpsActive ? 'Chuyển tin khách tới Ops' : 'Gửi tin nhắn'}>
            <Send className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-slate-400">
          <button ref={traceButtonRef} type="button" onClick={() => setIsTraceOpen(true)} className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-800 transition-colors hover:bg-violet-100" title="Xem log nền và luồng xử lý AI">
            <Workflow className="h-3.5 w-3.5" /> Luồng AI <span className="rounded-full bg-violet-100 px-1.5 tabular-nums">{traceTurns.length}</span>
          </button>
          <span>Chỉ hội thoại văn bản · Không có quick reply</span>
        </div>
      </form>

      <dialog
        ref={traceDialogRef}
        aria-labelledby="experiment-ai-trace-title"
        onCancel={() => setIsTraceOpen(false)}
        onClose={() => { setCopyFeedback(null); setIsTraceOpen(false); traceButtonRef.current?.focus(); }}
        onClick={(event) => { if (event.target === event.currentTarget) setIsTraceOpen(false); }}
        className="fixed inset-0 m-auto max-h-[92vh] w-[min(1180px,97vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 id="experiment-ai-trace-title" className="flex items-center gap-2 text-lg font-bold"><Workflow className="h-5 w-5 text-violet-700" /> Luồng xử lý AI · {selectedMode.label}</h2>
            <p className="mt-1 text-xs text-slate-500">{traceTurns.length} log nền · Hiển thị {copiedTurns.length} luồng gần nhất để sao chép</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={copiedTurns.length === 0}
              onClick={() => void handleCopy('all', copiedTurns.map(formatTraceTurn).join('\n\n'), 'Đã sao chép ' + copiedTurns.length + ' luồng gần nhất.')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="Sao chép tối đa 10 luồng gần nhất"
            >
              {copyFeedback?.key === 'all' && copyFeedback.status === 'ok' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copyFeedback?.key === 'all' && copyFeedback.status === 'ok' ? 'Đã copy' : 'Copy All'} ({copiedTurns.length}/10)
            </button>
            <button type="button" autoFocus onClick={() => setIsTraceOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Đóng luồng AI"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="space-y-4 bg-slate-50 px-5 py-4">
          <div role="status" aria-live="polite" className={copyFeedback?.status === 'error' ? 'text-xs text-red-700' : 'text-xs text-emerald-700'}>{copyFeedback?.message}</div>
          <p className="text-xs text-slate-600">Log gồm input, các bước xử lý backend và output. Có thể chứa tin nhắn hoặc dữ liệu khách hàng; kiểm tra trước khi chia sẻ.</p>
          {traceTurns.length === 0 && <div className="py-10 text-center text-sm text-slate-500">Chưa có log. Gửi tin nhắn hoặc hoàn tất booking để xem hoạt động nền.</div>}
          {traceTurns.map((turn) => {
            const trace = turn.reply.aiTrace;
            return (
              <article key={turn.reply.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Luồng {turn.index} · {turn.reply.timestamp}</span>
                  {trace && <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-800">{trace.source === 'qwen' ? 'Qwen local' : trace.source === 'gemini' ? 'Gemini' : trace.source === 'rule' ? 'Rule-based' : trace.source === 'error' ? 'Lỗi' : 'Rule fallback'}</span>}
                  {trace && <span className="ml-auto font-mono text-slate-500">{trace.elapsedMs} ms</span>}
                </div>
                <p className="break-words whitespace-pre-wrap text-sm"><span className="font-semibold text-blue-700">{turn.user.sender === 'system' ? 'Tác vụ: ' : 'Khách: '}</span>{turn.user.text}</p>
                {trace && <div className="ml-1 space-y-2 border-l-2 border-slate-200 pl-3">
                  {trace.steps.map((step, index) => {
                    const status = STATUS_LABELS[step.status];
                    const nodeKey = `${turn.reply.id}:${index}`;
                    const expanded = expandedTraceNodes.has(nodeKey);
                    const details = Object.entries(step.detail || {}).filter(([, value]) => value !== undefined);
                    const toggleNode = () => setExpandedTraceNodes(previous => {
                      const next = new Set(previous);
                      if (next.has(nodeKey)) next.delete(nodeKey); else next.add(nodeKey);
                      return next;
                    });
                    return (
                      <section key={index} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button type="button" aria-expanded={expanded} onClick={toggleNode} className="flex w-full flex-wrap items-center gap-2 bg-slate-50 px-4 py-3 text-left hover:bg-violet-50">
                          <span className="font-semibold">{index + 1}. {NODE_LABELS[step.node] || step.node}</span>
                          <span className={'rounded px-1.5 py-0.5 ' + status.className}>{status.label}</span>
                          {step.reason && <code className="text-slate-500">{step.reason}</code>}
                          {step.elapsedMs !== undefined && <span className="ml-auto tabular-nums text-slate-500">{step.elapsedMs} ms</span>}
                          <span className="w-full text-xs text-violet-800">{expanded ? 'Nhấn để thu gọn' : `Nhấn để xem INPUT / OUTPUT / ERROR${details.length ? ` · ${details.length} mục` : ''}`}</span>
                        </button>
                        {expanded && <div className="space-y-3 border-t border-slate-200 p-4">
                          {details.length ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{details.map(([key, value]) => <section key={key} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <h4 className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">{key.toLowerCase() === 'input' || key.toLowerCase() === 'request' ? `INPUT · ${key}` : key.toLowerCase() === 'output' || key.toLowerCase() === 'response' || key.toLowerCase() === 'reply' ? `OUTPUT · ${key}` : key.toLowerCase() === 'error' ? `ERROR · ${key}` : key}</h4>
                            <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed font-mono">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
                          </section>)}</div> : <p className="text-sm text-slate-500">Node này không có payload chi tiết.</p>}
                          <div className="flex justify-end"><button type="button" onClick={() => void handleCopy(`${nodeKey}:copy`, JSON.stringify({ customerInput: turn.user.text, botOutput: turn.reply.text, node: step.node, status: step.status, reason: step.reason || null, elapsedMs: step.elapsedMs ?? null, detail: step.detail || null }, null, 2), `Đã sao chép node ${index + 1} của luồng ${turn.index}.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                            {copyFeedback?.key === `${nodeKey}:copy` && copyFeedback.status === 'ok' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}Copy toàn bộ node
                          </button></div>
                        </div>}
                      </section>
                    );
                  })}
                </div>}
                <p className="break-words whitespace-pre-wrap border-t border-slate-100 pt-2 text-sm"><span className="font-semibold text-slate-700">Phản hồi: </span>{turn.reply.text}</p>
                <div className="flex justify-end border-t border-slate-100 pt-2">
                  {copyFeedback?.key === turn.reply.id && <span className={'mr-auto self-center text-xs ' + (copyFeedback.status === 'ok' ? 'text-emerald-700' : 'text-red-700')}>{copyFeedback.status === 'ok' ? 'Đã sao chép' : 'Sao chép thất bại'}</span>}
                  <button type="button" onClick={() => void handleCopy(turn.reply.id, formatTraceTurn(turn), 'Đã sao chép luồng ' + turn.index + '.')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                    {copyFeedback?.key === turn.reply.id && copyFeedback.status === 'ok' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}Copy luồng
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </dialog>
    </section>
  );
};
