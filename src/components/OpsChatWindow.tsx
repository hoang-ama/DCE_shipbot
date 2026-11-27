import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, User, X } from 'lucide-react';
import type { ChatMessage } from '../types';

interface OpsChatWindowProps {
  opsName: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
}

export const OpsChatWindow: React.FC<OpsChatWindowProps> = ({ opsName, messages, onSend, onClose }) => {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const reply = text.trim();
    if (!reply) return;
    onSend(reply);
    setText('');
  };

  return (
    <section className="fixed bottom-4 right-4 z-[100] flex h-[min(680px,calc(100vh-2rem))] w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 bg-emerald-800 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><User className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold">{opsName} · Ops</h2>
            <p className="text-[11px] text-emerald-100">Đang trả lời khách · AI đã tạm dừng</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-emerald-50 hover:bg-white/10" aria-label="Thu nhỏ khung Ops"><X className="h-5 w-5" /></button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Khung Ops giả lập: tin nhắn gửi ở đây sẽ xuất hiện trong khung chat khách.</div>
        {messages.map((message) => {
          const isOps = message.sender === 'agent';
          const isCustomer = message.sender === 'user';
          return (
            <div key={message.id} className={`flex ${isOps ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${isOps ? 'rounded-tr-sm bg-emerald-700 text-white' : isCustomer ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-800' : 'rounded-tl-sm border border-violet-200 bg-violet-50 text-slate-800'}`}>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold opacity-75">
                  {isOps ? <><User className="h-3 w-3" /> Ops</> : isCustomer ? <><User className="h-3 w-3" /> Khách</> : <><Bot className="h-3 w-3" /> Bot trước khi bàn giao</>}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">{message.timestamp}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-200 bg-white p-3">
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ops nhập câu trả lời cho khách…" aria-label="Ops trả lời khách" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-hidden focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
        <button type="submit" disabled={!text.trim()} className="rounded-xl bg-emerald-700 p-2.5 text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50" title="Gửi phản hồi cho khách"><Send className="h-5 w-5" /></button>
      </form>
    </section>
  );
};
