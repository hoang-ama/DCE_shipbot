import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Mic,
  MicOff,
  Volume2,
} from 'lucide-react';
import { ChatMessage, ShippingInfo } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  shippingInfo: ShippingInfo;
  onSelectQuickReply: (text: string) => void;
  countdown?: number | null;
  onFlushNow?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  shippingInfo,
  onSelectQuickReply,
  countdown = null,
  onFlushNow,
}) => {
  const [inputText, setInputText] = useState('');
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
            placeholder="Nhập thông tin gửi hàng (Ví dụ: Lấy ở Landmark 81, giao Chợ Bến Thành, 5kg hoa quả, sáng mai...)"
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

        <div className="mt-2 flex items-center justify-end text-[11px] text-slate-400 px-1">
          <span>Nhấn Enter để gửi tin nhắn</span>
        </div>
      </form>
    </div>
  );
};
