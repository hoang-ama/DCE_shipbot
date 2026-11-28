import React, { useMemo, useState } from 'react';
import { Check, Copy, Workflow, X } from 'lucide-react';
import type { AITrace, AITraceStep, ChatMessage } from '../../shared/types';
import { copyTraceText, formatRecentTraceTurns, formatTraceTurn, MAX_COPIED_TURNS, type TraceTurn } from '../trace-copy';

type CrmTraceMessage = {
  id: number | string;
  sender: 'user' | 'bot' | 'agent';
  sender_name?: string;
  message_text: string;
  created_at: string;
  ai_trace?: AITrace | null;
};

const STATUS: Record<AITraceStep['status'], { label: string; style: string }> = {
  ok: { label: 'OK', style: 'bg-emerald-100 text-emerald-800' },
  skip: { label: 'Bỏ qua', style: 'bg-slate-100 text-slate-600' },
  error: { label: 'Lỗi', style: 'bg-red-100 text-red-800' },
  info: { label: 'Điều phối', style: 'bg-blue-100 text-blue-800' },
};
const SOURCE: Record<string, string> = { rule: 'Rule-based viết câu trả lời', qwen: 'Qwen trích xuất dữ liệu', gemini: 'Gemini viết câu trả lời', rule_fallback: 'Rule fallback', error: 'Lỗi request', unknown: 'Chưa rõ nguồn' };
const NODE: Record<string, string> = { rule_reply: 'Rule-based viết câu trả lời', rule_ops_fallback: 'Rule-based nhờ DCE Ops hỗ trợ', service_router: 'Chọn dịch vụ', rule_extract: 'Rule-based trích xuất', qwen_extract: 'Qwen trích xuất', qwen_reply: 'Qwen phản hồi', gemini: 'Gemini API', express_gemini_extract: 'Gemini dự phòng trích xuất', ride_gemini_fallback: 'Gemini xác nhận / dự phòng', rent_gemini_fallback: 'Gemini xác nhận / dự phòng', truck_gemini_fallback: 'Gemini xác nhận / dự phòng', ride_gemini_final_review: 'Gemini rà soát cuối', rent_gemini_final_review: 'Gemini rà soát cuối', truck_gemini_final_review: 'Gemini rà soát cuối', final: 'Kết quả cuối cùng', web_request: 'Yêu cầu web' };
const duration = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function toChatMessage(message: CrmTraceMessage, sender: 'user' | 'bot'): ChatMessage {
  return {
    id: String(message.id), sender, text: message.message_text,
    timestamp: timeLabel(message.created_at),
    ...(sender === 'bot' && message.ai_trace ? { aiTrace: message.ai_trace } : {}),
  };
}
function makeTraceTurns(messages: CrmTraceMessage[]): TraceTurn[] {
  const turns: TraceTurn[] = [];
  messages.forEach((message, index) => {
    if (message.sender !== 'user') return;
    const nextUserIndex = messages.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.sender === 'user');
    const end = nextUserIndex < 0 ? messages.length : nextUserIndex;
    const bot = messages.slice(index + 1, end).find((candidate) => candidate.sender === 'bot' && candidate.ai_trace);
    if (!bot) return;
    turns.push({ index: turns.length + 1, user: toChatMessage(message, 'user'), reply: toChatMessage(bot, 'bot') });
  });
  return turns;
}

export function CrmAiTraceDialog({ open, onClose, customerName, messages }: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  messages: CrmTraceMessage[];
}) {
  const turns = useMemo(() => makeTraceTurns(messages), [messages]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState('');
  const [copyError, setCopyError] = useState(false);
  const copyRoot = React.useRef<HTMLDivElement>(null);
  if (!open) return null;
  const copy = async (text: string, success: string) => {
    const root = copyRoot.current;
    if (!root) return;
    try {
      await copyTraceText(text, root);
      setFeedback(success);
      setCopyError(false);
      window.setTimeout(() => setFeedback(''), 3500);
    } catch {
      setFeedback('Không thể sao chép. Kiểm tra quyền clipboard của trình duyệt rồi thử lại.');
      setCopyError(true);
    }
  };
  const recentTurns = turns.slice(-MAX_COPIED_TURNS);

  return <div ref={copyRoot} role="dialog" aria-modal="true" aria-labelledby="crm-ai-trace-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <h2 id="crm-ai-trace-title" className="flex items-center gap-2 text-lg font-bold"><Workflow className="h-5 w-5 text-blue-600" /> Luồng AI · {customerName}</h2>
          <p className="mt-1 text-xs text-slate-500">{turns.length} lượt có trace đã lưu · mỗi lượt gồm tin khách, input/output từng node và phản hồi bot.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" disabled={!recentTurns.length} onClick={() => void copy(formatRecentTraceTurns(recentTurns), `Đã sao chép ${recentTurns.length} lượt gần nhất.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"><Copy className="h-4 w-4" /> Copy All ({recentTurns.length}/10)</button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-4">
        <p role="status" aria-live="polite" className={`mb-3 min-h-4 text-xs ${copyError ? 'text-red-700' : 'text-emerald-700'}`}>{feedback}</p>
        <p className="mb-4 text-xs text-slate-600">Trace lấy từ quá trình xử lý của backend. Mở từng node để đọc payload đầy đủ; copy lượt hoặc copy riêng node. Nội dung có thể chứa dữ liệu khách hàng.</p>
        {!turns.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">Chưa có trace được lưu cho khách này. Tin nhắn cũ trước khi bật lưu trace sẽ không có dữ liệu này.</div> : <div className="space-y-4">{turns.map((turn, turnIndex) => {
          const trace = turn.reply.aiTrace;
          if (!trace) return null;
          return <article key={turn.user.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500">Lượt {turnIndex + 1} · {turn.user.timestamp}</span>
              <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-800">{SOURCE[trace.source] || trace.source}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-slate-600">{trace.reason}</span>
              <span className="ml-auto text-slate-500">{duration(trace.elapsedMs)}</span>
              <button type="button" onClick={() => void copy(formatTraceTurn({ ...turn, index: turnIndex + 1 }), `Đã copy toàn bộ lượt ${turnIndex + 1}.`)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" /> Copy lượt</button>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm"><span className="font-semibold text-blue-700">Khách: </span>{turn.user.text}</p>
            <div className="space-y-2 border-l-2 border-slate-200 pl-4">{trace.steps.map((step, stepIndex) => {
              const key = `${turn.user.id}:${stepIndex}`;
              const isOpen = expanded.has(key);
              const entries = Object.entries(step.detail || {}).filter(([, value]) => value !== undefined);
              const status = STATUS[step.status] || STATUS.info;
              const detailLabel = (name: string) => ({ input: 'INPUT · Dữ liệu đầu vào', output: 'OUTPUT · Kết quả đầu ra', error: 'ERROR · Lỗi', reply: 'OUTPUT · Nội dung phản hồi', request: 'INPUT · Request', response: 'OUTPUT · Response' }[name.toLowerCase()] || name);
              return <section key={key} className="overflow-hidden rounded-xl border border-slate-200">
                <button type="button" aria-expanded={isOpen} onClick={() => setExpanded((old) => { const next = new Set(old); next.has(key) ? next.delete(key) : next.add(key); return next; })} className="flex w-full flex-wrap items-center gap-2 bg-slate-50 px-4 py-3 text-left hover:bg-blue-50/70">
                  <span className="text-sm font-semibold">{stepIndex + 1}. {NODE[step.node] || step.node}</span><span className={`rounded px-2 py-0.5 text-xs ${status.style}`}>{status.label}</span>{step.elapsedMs !== undefined && <span className="ml-auto text-xs text-slate-500">{duration(step.elapsedMs)}</span>}
                  <span className="w-full text-xs text-blue-700">{isOpen ? 'Nhấn để thu gọn' : `Nhấn để xem INPUT / OUTPUT / ERROR${entries.length ? ` · ${entries.length} mục` : ''}`}</span>
                </button>
                {step.reason && <div className="px-4 pb-3 text-xs text-slate-600"><code>{step.reason}</code></div>}
                {isOpen && <div className="space-y-3 border-t border-slate-200 p-4">
                  {entries.length ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{entries.map(([name, value]) => <section key={name} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><h4 className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">{detailLabel(name)}</h4><pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></section>)}</div> : <p className="text-sm text-slate-500">Node này không có payload chi tiết.</p>}
                  <div className="flex justify-end"><button type="button" onClick={() => void copy(JSON.stringify({ turn: turnIndex + 1, customerInput: turn.user.text, botOutput: turn.reply.text, node: step.node, status: step.status, reason: step.reason || null, elapsedMs: step.elapsedMs ?? null, detail: step.detail || null }, null, 2), `Đã copy đầy đủ node ${stepIndex + 1} của lượt ${turnIndex + 1}.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Copy className="h-3.5 w-3.5" />Copy toàn bộ node</button></div>
                </div>}
              </section>;
            })}</div>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-blue-50 px-3 py-2.5 text-sm"><span className="font-semibold text-blue-800">ShipBot AI: </span>{turn.reply.text}</p>
          </article>;
        })}</div>}
      </div>
    </div>
  </div>;
}
