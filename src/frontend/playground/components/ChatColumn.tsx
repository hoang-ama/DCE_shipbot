import React, { useState, useRef, useEffect } from 'react';
import { AppState, ChatMessage } from '../../../chatbot/playground/types';
import {
  Send,
  Bot,
  User,
  Truck,
  Lock,
  ArrowRight,
  Clock,
  Info,
  Languages,
  Loader2,
  ImagePlus,
  Mic,
  Square,
  X,
  FileAudio,
  Maximize2,
} from 'lucide-react';

interface ChatColumnProps {
  chatId: 1 | 2 | 3;
  title: string;
  subtitle: string;
  roleBadge: string;
  roleDescription: string;
  messages: ChatMessage[];
  currentState: AppState;
  isLocked?: boolean;
  isActive: boolean;
  onSendMessage: (content: string) => void;
  onSendImage: (imageDataUrl: string, fileName: string, caption?: string) => void;
  onSendAudio: (
    audioBase64: string,
    mimeType: string,
    audioUrl: string,
    browserTranscript?: string
  ) => Promise<void> | void;
  onTranslateMessage: (messageId: string, content: string) => Promise<void>;
  isProcessing: boolean;
}

export const ChatColumn: React.FC<ChatColumnProps> = ({
  chatId,
  title,
  subtitle,
  roleBadge,
  roleDescription,
  messages,
  currentState,
  isLocked = false,
  isActive,
  onSendMessage,
  onSendImage,
  onSendAudio,
  onTranslateMessage,
  isProcessing,
}) => {
  const [inputText, setInputText] = useState('');
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveSpeechText, setLiveSpeechText] = useState('');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const speechRecRef = useRef<any>(null);
  const speechTranscriptRef = useRef<string>('');
  const cancelRecordingRef = useRef<boolean>(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      try {
        speechRecRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    setMediaError(null);
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không thể đọc tệp đã chọn.'));
      reader.readAsDataURL(file);
    });
  };

  const handleImageFile = async (file: File) => {
    setMediaError(null);
    if (!file.type.startsWith('image/')) {
      setMediaError('Vui lòng chọn tệp hình ảnh hợp lệ.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const caption = inputText.trim() || undefined;
      if (caption) setInputText('');
      onSendImage(dataUrl, file.name || 'image.png', caption);
    } catch {
      setMediaError('Không thể đọc hình ảnh. Vui lòng thử lại.');
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleImageFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await handleImageFile(file);
          return;
        }
      }
    }
  };

  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const mimeType = file.type || 'audio/mpeg';
      await onSendAudio(dataUrl, mimeType, dataUrl);
    } catch {
      setMediaError('Không thể đọc tệp âm thanh. Vui lòng thử lại.');
    }
  };

  const startRecording = async () => {
    if (isProcessing || isRecording) return;
    setMediaError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('Trình duyệt không hỗ trợ ghi âm trực tiếp. Anh/chị có thể tải tệp âm thanh lên.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      speechTranscriptRef.current = '';
      setLiveSpeechText('');
      cancelRecordingRef.current = false;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const supportedType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        try {
          speechRecRef.current?.stop();
        } catch {
          // Ignore
        }

        const wasCancelled = cancelRecordingRef.current;
        setIsRecording(false);
        setRecordingSeconds(0);

        if (wasCancelled || audioChunksRef.current.length === 0) {
          setLiveSpeechText('');
          return;
        }

        const mimeType = recorder.mimeType || supportedType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(blob);
        });

        const fallbackTranscript = speechTranscriptRef.current.trim();
        setLiveSpeechText('');
        await onSendAudio(audioDataUrl, mimeType, audioDataUrl, fallbackTranscript || undefined);
      };

      // Start optional Web Speech API in parallel as backup transcript
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = 'vi-VN';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (event: any) => {
            let combined = '';
            for (let i = 0; i < event.results.length; i++) {
              combined += event.results[i][0]?.transcript || '';
            }
            speechTranscriptRef.current = combined.trim();
            setLiveSpeechText(combined.trim());
          };
          rec.onerror = () => {
            // Ignore SpeechRecognition errors; Gemini handles audio transcription
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {
          // Ignore if SpeechRecognition cannot start
        }
      }

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setMediaError('Không thể truy cập micro. Hãy cấp quyền hoặc tải lên tệp âm thanh.');
    }
  };

  const stopAndSendRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;
    cancelRecordingRef.current = false;
    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;
    cancelRecordingRef.current = true;
    mediaRecorderRef.current.stop();
  };

  const handleTranslateClick = async (msg: ChatMessage) => {
    if (translatingIds[msg.id] || !msg.content) return;
    setTranslatingIds((prev) => ({ ...prev, [msg.id]: true }));
    try {
      await onTranslateMessage(msg.id, msg.content);
    } finally {
      setTranslatingIds((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  const getBorderTheme = () => {
    if (chatId === 1) return isActive ? 'ring-2 ring-blue-500 shadow-md' : 'border-slate-200 dark:border-slate-800';
    if (chatId === 2) return isActive ? 'ring-2 ring-amber-500 shadow-md' : 'border-slate-200 dark:border-slate-800';
    return isActive ? 'ring-2 ring-orange-500 shadow-md' : 'border-slate-200 dark:border-slate-800';
  };

  const getHeaderTheme = () => {
    if (chatId === 1) {
      return {
        bg: 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40',
        badgeBg: 'bg-blue-600 text-white',
        icon: <User className="w-4 h-4 text-blue-600" />,
      };
    }
    if (chatId === 2) {
      return {
        bg: 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40',
        badgeBg: 'bg-amber-600 text-white',
        icon: <Truck className="w-4 h-4 text-amber-600" />,
      };
    }
    return {
      bg: 'bg-gradient-to-r from-orange-50 to-rose-50 dark:from-orange-950/40 dark:to-rose-950/40',
      badgeBg: 'bg-orange-600 text-white',
      icon: <Truck className="w-4 h-4 text-orange-600" />,
    };
  };

  const headerTheme = getHeaderTheme();

  return (
    <div
      className={`relative flex flex-col h-[calc(100vh-130px)] bg-white dark:bg-slate-900 rounded-2xl border ${getBorderTheme()} overflow-hidden transition-all duration-200`}
    >
      {/* Lightbox Modal for Image Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center hover:bg-slate-100 transition"
              title="Đóng xem ảnh"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.name || 'Xem trước hình ảnh'}
              className="max-w-full max-h-[82vh] rounded-xl shadow-2xl object-contain bg-slate-900"
            />
            {previewImage.name && (
              <span className="mt-2 text-xs text-slate-300">{previewImage.name}</span>
            )}
          </div>
        </div>
      )}

      {/* Locked overlay for Column 3 when DCE hasn't rejected */}
      {isLocked && (
        <div className="absolute inset-0 z-20 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center mb-3 shadow-lg">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h4 className="font-bold text-base mb-1">Chưa kích hoạt Cột 3 (CSĐT)</h4>
          <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
            Cột 3 chỉ kích hoạt khi <strong>Nhân viên DCE (Cột 2)</strong> trả lời <span className="text-rose-400 font-bold">"Không"</span> từ chối nhận tuyến.
          </p>
        </div>
      )}

      {/* Column Header */}
      <div className={`p-3.5 border-b border-slate-200 dark:border-slate-800 ${headerTheme.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-xs">
            {headerTheme.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                {title}
              </h2>
              {isActive && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Role tag */}
        <div className="text-right shrink-0 ml-2">
          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${headerTheme.badgeBg}`}>
            {roleBadge}
          </span>
          <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {roleDescription}
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/40 dark:bg-slate-950/30">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2 text-slate-300 dark:text-slate-600">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium">Chưa có tin nhắn trong hội thoại này</p>
            <p className="text-[11px] text-slate-400 max-w-xs mt-1">
              {chatId === 1
                ? 'Nhập Form, tải ảnh hoặc gửi tin nhắn thoại để bắt đầu.'
                : chatId === 2
                ? 'Khi Form có đủ thông tin, hệ thống sẽ tự động copy sang đây.'
                : 'Cột này sẽ nhận bản copy Form khi DCE từ chối.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUserRole =
              (chatId === 1 && msg.sender === 'customer') ||
              (chatId === 2 && msg.sender === 'dce') ||
              (chatId === 3 && msg.sender === 'csdt');
            const isAI = msg.sender === 'ai';
            const isTranslating = Boolean(translatingIds[msg.id]);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUserRole ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-1 duration-150`}
              >
                {/* Sender label & badge */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px]">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">
                    {msg.senderName}
                  </span>
                  {msg.badge && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {msg.badge}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                  {Boolean(msg.content?.trim()) && (
                    <button
                      type="button"
                      onClick={() => handleTranslateClick(msg)}
                      disabled={isTranslating}
                      className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-300 dark:hover:bg-indigo-950/50 transition"
                      title="Dịch nội dung tin nhắn"
                    >
                      {isTranslating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Languages className="w-3 h-3" />
                      )}
                      <span>Dịch</span>
                    </button>
                  )}
                </div>

                {/* Structured Copied Form Card */}
                {msg.isStructuredCard && msg.cardData ? (
                  <div className="w-full max-w-md p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/90 dark:bg-blue-950/50 shadow-sm text-xs space-y-2.5">
                    <div className="space-y-1.5 text-[12px] text-slate-800 dark:text-slate-100">
                      {msg.cardData.fields?.map((f, i) => (
                        <div key={i} className="leading-snug">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">{f.label}:</span>{' '}
                          <span className="font-bold text-slate-900 dark:text-white">{f.value}</span>
                        </div>
                      ))}
                    </div>

                    {msg.cardData.actionPrompt && (
                      <div className="p-2 rounded-lg bg-blue-100/80 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-semibold flex items-center justify-between">
                        <span>{msg.cardData.actionPrompt}</span>
                        <ArrowRight className="w-4 h-4 text-blue-600 shrink-0" />
                      </div>
                    )}

                    {msg.translatedContent && (
                      <div className="pt-2 border-t border-blue-200/70 dark:border-blue-800/60 text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400 block mb-0.5">
                          Bản dịch:
                        </span>
                        {msg.translatedContent}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standard text / image / audio bubble */
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs space-y-2 ${
                      isUserRole
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : isAI
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-bl-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {msg.imageUrl && (
                      <div className="relative group">
                        <img
                          src={msg.imageUrl}
                          alt={msg.imageName || 'Hình ảnh đính kèm'}
                          onClick={() =>
                            setPreviewImage({ url: msg.imageUrl!, name: msg.imageName })
                          }
                          className="max-h-56 w-auto rounded-lg object-cover cursor-pointer border border-black/10 dark:border-white/10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewImage({ url: msg.imageUrl!, name: msg.imageName })
                          }
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-900/65 text-white opacity-0 group-hover:opacity-100 transition"
                          title="Phóng to ảnh"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {msg.audioUrl && (
                      <div className="space-y-1.5">
                        <audio
                          controls
                          src={msg.audioUrl}
                          className="w-56 max-w-full h-8 rounded-md"
                        />
                        {msg.audioTranscript && (
                          <div
                            className={`text-[11px] pt-1 border-t ${
                              isUserRole
                                ? 'border-blue-500/60 text-blue-50'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <span className="font-semibold">Phiên âm: </span>
                            {msg.audioTranscript}
                          </div>
                        )}
                      </div>
                    )}

                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                    {msg.originalContent && (
                      <div
                        className={`pt-1.5 border-t text-[11px] italic ${
                          isUserRole
                            ? 'border-blue-500/60 text-blue-100'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Nội dung gốc: "{msg.originalContent}"
                      </div>
                    )}

                    {msg.translatedContent && (
                      <div
                        className={`pt-1.5 border-t text-[11px] whitespace-pre-wrap ${
                          isUserRole
                            ? 'border-blue-500/60 text-blue-50'
                            : 'border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        <span className="font-semibold block mb-0.5">Bản dịch:</span>
                        {msg.translatedContent}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {isProcessing && isActive && (
          <div className="flex items-center gap-2 p-2 text-xs text-slate-400 animate-pulse">
            <Bot className="w-4 h-4 text-blue-500 animate-bounce" />
            <span>AI đang xử lý và dịch nội dung tin nhắn...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Hidden File Inputs for Image & Audio */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioFileChange}
      />

      {/* Input Form Bar */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        {mediaError && (
          <div className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-600 dark:text-rose-300 flex items-center justify-between">
            <span>{mediaError}</span>
            <button
              type="button"
              onClick={() => setMediaError(null)}
              className="ml-2 text-rose-500 hover:text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {!isActive ? (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span>
              {currentState === 'COMPLETED'
                ? 'Khách đã chốt đơn và chuyển đối tác đi đơn.'
                : currentState === 'CUSTOMER_DECLINED'
                ? 'Khách hàng đã từ chối báo giá.'
                : currentState === 'REJECTED'
                ? 'Tuyến này không được hỗ trợ.'
                : chatId === 1
                ? 'Đang chờ điều phối từ DCE / CSĐT ở cột bên cạnh...'
                : currentState === 'QUOTED_WAITING_CUSTOMER'
                ? 'Đang chờ Khách hàng chốt đơn, từ chối hoặc hỏi thêm...'
                : currentState === 'COLLECTING_RECIPIENT_PHONE'
                ? 'Đang xin SĐT người nhận hàng từ Khách hàng...'
                : currentState === 'COLLECTING_SENDER_PHONE'
                ? 'Đang xin SĐT người gửi hàng từ Khách hàng...'
                : currentState === 'COLLECTING_PAYMENT_PARTY'
                ? 'Đang hỏi bên thanh toán tiền cước từ Khách hàng...'
                : currentState === 'COLLECTING_PAYMENT_TIME'
                ? 'Đang hỏi thời điểm thanh toán tiền cước từ Khách hàng...'
                : currentState === 'WAITING_DRIVER_PHONE_DCE'
                ? 'Đang chờ Nhân viên DCE cung cấp số điện thoại tài xế...'
                : currentState === 'WAITING_DRIVER_PHONE_CSDT'
                ? 'Đang chờ Nhân viên CSĐT cung cấp số điện thoại tài xế...'
                : chatId === 2
                ? 'Chỉ có thể phản hồi khi đơn hàng đang ở trạng thái chờ DCE.'
                : 'Chỉ có thể phản hồi khi đơn hàng chuyển sang CSĐT.'}
            </span>
          </div>
        ) : isRecording ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-300 shrink-0">
                {formatTimer(recordingSeconds)}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                {liveSpeechText || 'Đang ghi âm tin nhắn thoại...'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                title="Hủy ghi âm"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopAndSendRecording}
                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                title="Dừng & dịch gửi tin nhắn thoại"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Gửi thoại</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-end gap-1.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => imageInputRef.current?.click()}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:border-blue-300 dark:hover:text-blue-400 disabled:opacity-40 transition shrink-0"
              title="Gửi hình ảnh (forward thẳng, không dịch)"
            >
              <ImagePlus className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={startRecording}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:border-rose-300 dark:hover:text-rose-400 disabled:opacity-40 transition shrink-0"
              title="Ghi âm tin nhắn thoại (dịch ngược & gửi dạng chữ)"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => audioInputRef.current?.click()}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-400 disabled:opacity-40 transition shrink-0"
              title="Tải tệp ghi âm lên (dịch ngược & gửi dạng chữ)"
            >
              <FileAudio className="w-4 h-4" />
            </button>

            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isProcessing}
              placeholder={
                chatId === 1
                  ? 'Nhập tin nhắn, dán ảnh hoặc gửi thoại...'
                  : chatId === 2
                  ? 'Nhập phản hồi DCE, gửi ảnh hoặc thoại...'
                  : 'Nhập phản hồi CSĐT, gửi ảnh hoặc thoại...'
              }
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none max-h-28"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || isProcessing}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold text-xs transition shadow-xs flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gửi</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
