import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, Bot, FlaskConical, RotateCcw, Send, User } from 'lucide-react';
import type { ChatMessage } from '../types';

export type ExperimentMode = 'default' | 'passenger' | 'cargo' | 'tour';

const MODES: Array<{ id: ExperimentMode; label: string; description: string }> = [
  { id: 'default', label: 'Mặc định', description: 'Chưa rõ khách muốn dịch vụ nào' },
  { id: 'passenger', label: 'Chuyển người', description: 'Ride và thuê xe' },
  { id: 'cargo', label: 'Chuyển hàng', description: 'Express và xe tải' },
  { id: 'tour', label: 'Tour', description: 'Du lịch và tour' },
];

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedMode = MODES.find((item) => item.id === mode) || MODES[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
              className={`rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60 ${mode === item.id ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/50'}`}
            >
              <span className="block text-sm font-bold text-slate-800">{item.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{item.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-slate-500">Các chế độ trên chỉ dành cho người thử nghiệm. Trong hội thoại, bot chỉ nhắn tin và không hiển thị nút lựa chọn cho khách.</p>
        <p className="mt-1 px-1 text-[11px] text-amber-700">{mode === 'passenger' ? 'Chuyển người dùng bot thử nghiệm riêng; API ghép đối tác đang chọn đối tác đầu tiên đủ điều kiện từ hồ sơ JSON giả lập.' : 'Chế độ này vẫn dùng pipeline hiện tại; phần xử lý riêng sẽ được nối sau.'}</p>
        {isOpsActive && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>Ops đã tiếp quản. Bot tạm dừng trả lời; tin nhắn tiếp theo của khách sẽ chuyển vào khung Ops.</span>
          <button type="button" onClick={onOpenOps} className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 font-semibold text-white hover:bg-amber-800">Mở khung Ops</button>
        </div>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4" aria-live="polite">
        {messages.map((message) => {
          const isBot = message.sender === 'bot' || message.sender === 'agent';
          return (
            <div key={message.id} className={`flex items-start gap-2.5 ${isBot ? 'justify-start' : 'justify-end'}`}>
              {isBot && <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${message.sender === 'agent' ? 'bg-emerald-600' : 'bg-violet-600'}`}>{message.sender === 'agent' ? <span className="text-[10px] font-bold">OPS</span> : <Bot className="h-4 w-4" />}</div>}
              <div className={`max-w-[88%] space-y-1 ${isBot ? '' : 'order-first'}`}>
                <div className={`whitespace-pre-wrap break-words rounded-2xl p-3.5 text-sm leading-relaxed shadow-xs ${message.sender === 'agent' ? 'rounded-tl-sm border border-emerald-200 bg-emerald-50 text-slate-800' : isBot ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-800' : 'rounded-tr-sm bg-violet-700 text-white'}`}>
                  {message.text}
                </div>
                <div className={`px-1 text-[10px] text-slate-400 ${isBot ? 'text-left' : 'text-right'}`}>{message.sender === 'agent' ? 'Ops · ' : ''}{message.timestamp}</div>
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
        <p className="mt-2 text-right text-[10px] text-slate-400">Chỉ hội thoại văn bản · Không có quick reply</p>
      </form>
    </section>
  );
};
