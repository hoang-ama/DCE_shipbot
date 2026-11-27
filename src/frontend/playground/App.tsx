import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { AppState, ChatMessage, OrderFormData } from '../../chatbot/playground/types';
import {
  INITIAL_FORM_DATA,
  SAMPLE_COMPLETED_FORM,
  formatOrderFormText,
} from './constants';
import { StateTracker } from './components/StateTracker';
import { ChatColumn } from './components/ChatColumn';
import { MermaidModal } from './components/MermaidModal';

interface AttachedImageItem {
  imageUrl: string;
  imageName: string;
  caption?: string;
}

function buildFormCardFields(form: OrderFormData) {
  const fields = [
    { label: '1) Địa chỉ lấy hàng', value: form.dia_chi_lay_hang || '' },
    { label: '2) Địa chỉ giao hàng', value: form.dia_chi_giao_hang || '' },
    { label: '3) Thông tin hàng', value: form.thong_tin_hang || '' },
    { label: '4) Thời gian giao nhận', value: form.thoi_gian_giao_nhan || '' },
  ];
  if (form.thong_tin_bo_sung) {
    fields.push({ label: '5) Thông tin bổ sung', value: form.thong_tin_bo_sung });
  }
  return fields;
}

function createInitialChat1Messages(form: OrderFormData, timestamp: string): ChatMessage[] {
  return [
    {
      id: `c1-form-${Date.now()}`,
      chatId: 1,
      sender: 'customer',
      senderName: 'Khách hàng (Form đã tiếp nhận)',
      content: formatOrderFormText(form, false),
      timestamp,
      badge: 'Form đầy đủ',
      isStructuredCard: true,
      cardData: {
        title: 'Thông tin đơn hàng',
        fields: buildFormCardFields(form),
      },
    },
    {
      id: `c1-ai-fwd-${Date.now() + 1}`,
      chatId: 1,
      sender: 'ai',
      senderName: 'AI CSKH',
      content: 'Dạ em đã tiếp nhận đầy đủ thông tin đơn hàng và chuyển sang bộ phận điều phối (DCE) để hỏi báo giá cho anh/chị ngay ạ.',
      timestamp,
    },
  ];
}

function createForwardedFormMessage(
  chatId: 2 | 3,
  form: OrderFormData,
  timestamp: string
): ChatMessage {
  return {
    id: `c${chatId}-form-${Date.now()}`,
    chatId,
    sender: 'ai',
    senderName: 'AI CSKH',
    content: formatOrderFormText(form, true),
    timestamp,
    badge: 'Copy Form',
    isStructuredCard: true,
    cardData: {
      title: 'Thông tin đơn hàng',
      fields: buildFormCardFields(form),
      actionPrompt: 'Anh/chị báo giá giúp em.',
    },
  };
}

export default function App() {
  const [currentState, setCurrentState] = useState<AppState>('WAITING_DCE');
  const [formData, setFormData] = useState<OrderFormData>(SAMPLE_COMPLETED_FORM);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isMermaidOpen, setIsMermaidOpen] = useState<boolean>(false);
  const [isQuotaLimited, setIsQuotaLimited] = useState<boolean>(false);
  const [customerImages, setCustomerImages] = useState<AttachedImageItem[]>([]);
  const [quotePartner, setQuotePartner] = useState<'DCE' | 'CSDT' | null>(null);
  const [isPostQuoteFollowUp, setIsPostQuoteFollowUp] = useState<boolean>(false);

  const [chat1Messages, setChat1Messages] = useState<ChatMessage[]>(() =>
    createInitialChat1Messages(SAMPLE_COMPLETED_FORM, 'Hiện tại')
  );
  const [chat2Messages, setChat2Messages] = useState<ChatMessage[]>(() => [
    createForwardedFormMessage(2, SAMPLE_COMPLETED_FORM, 'Hiện tại'),
  ]);
  const [chat3Messages, setChat3Messages] = useState<ChatMessage[]>([]);

  const triggerCelebration = () => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // Ignore if canvas not ready
    }
  };

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Reset to pre-filled sample form already copied to DCE
  const handleReset = () => {
    const ts = getTimestamp();
    setCurrentState('WAITING_DCE');
    setFormData(SAMPLE_COMPLETED_FORM);
    setCustomerImages([]);
    setQuotePartner(null);
    setIsPostQuoteFollowUp(false);
    setIsProcessing(false);
    setChat1Messages(createInitialChat1Messages(SAMPLE_COMPLETED_FORM, ts));
    setChat2Messages([createForwardedFormMessage(2, SAMPLE_COMPLETED_FORM, ts)]);
    setChat3Messages([]);
  };

  // Start a fresh empty order in COLLECTING_INFO
  const handleNewOrder = () => {
    setCurrentState('COLLECTING_INFO');
    setFormData(INITIAL_FORM_DATA);
    setCustomerImages([]);
    setQuotePartner(null);
    setIsPostQuoteFollowUp(false);
    setIsProcessing(false);
    setChat1Messages([
      {
        id: `c1-new-${Date.now()}`,
        chatId: 1,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: 'Xin chào quý khách! Anh/chị vui lòng gửi thông tin đơn hàng (Địa chỉ lấy hàng, Địa chỉ giao hàng, Thông tin hàng, Thời gian giao nhận) để em chuyển điều phối báo giá ạ.',
        timestamp: getTimestamp(),
      },
    ]);
    setChat2Messages([]);
    setChat3Messages([]);
  };

  // On-demand translation toggle/fetch for any message bubble
  const handleTranslateMessage = async (messageId: string, content: string) => {
    const toggleClear = (list: ChatMessage[]) => {
      const target = list.find((m) => m.id === messageId);
      if (target?.translatedContent) {
        return list.map((m) => (m.id === messageId ? { ...m, translatedContent: undefined } : m));
      }
      return null;
    };

    const cleared1 = toggleClear(chat1Messages);
    if (cleared1) {
      setChat1Messages(cleared1);
      return;
    }
    const cleared2 = toggleClear(chat2Messages);
    if (cleared2) {
      setChat2Messages(cleared2);
      return;
    }
    const cleared3 = toggleClear(chat3Messages);
    if (cleared3) {
      setChat3Messages(cleared3);
      return;
    }

    try {
      const res = await fetch('/api/chatbot/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, targetLang: 'auto' }),
      });
      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);
      const translatedText = data.translated_text || content;

      const applyTranslation = (list: ChatMessage[]) =>
        list.map((m) => (m.id === messageId ? { ...m, translatedContent: translatedText } : m));

      setChat1Messages((prev) => applyTranslation(prev));
      setChat2Messages((prev) => applyTranslation(prev));
      setChat3Messages((prev) => applyTranslation(prev));
    } catch (err) {
      console.error('Error translating message:', err);
    }
  };

  // Transcribe audio on backend (returns plain text transcript)
  const transcribeAudio = async (
    audioBase64: string,
    mimeType: string,
    browserTranscript?: string
  ): Promise<string> => {
    const res = await fetch('/api/chatbot/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType,
        browserTranscript: browserTranscript || '',
      }),
    });
    const data = await res.json();
    if (data.quota_exceeded) setIsQuotaLimited(true);
    return (data.transcript || '').trim();
  };

  // Core Customer text pipeline (shared by typed text & voice transcript)
  const processCustomerText = async (
    text: string,
    historyOverride?: ChatMessage[],
    extraImagesToForward: AttachedImageItem[] = []
  ) => {
    // CASE 1: In COLLECTING_INFO
    if (currentState === 'COLLECTING_INFO') {
      const historyList = historyOverride || chat1Messages;
      const res = await fetch('/api/chatbot/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatHistory: historyList.map((m) => ({
            role: m.sender === 'customer' ? 'user' : 'model',
            text: m.content,
          })),
          currentForm: formData,
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);
      const updatedForm: OrderFormData = {
        dia_chi_lay_hang: data.form_data?.dia_chi_lay_hang || formData.dia_chi_lay_hang,
        dia_chi_giao_hang: data.form_data?.dia_chi_giao_hang || formData.dia_chi_giao_hang,
        thong_tin_hang: data.form_data?.thong_tin_hang || formData.thong_tin_hang,
        thoi_gian_giao_nhan: data.form_data?.thoi_gian_giao_nhan || formData.thoi_gian_giao_nhan,
        thong_tin_bo_sung: formData.thong_tin_bo_sung,
        missing_fields: data.missing_fields || [],
        is_form_complete: Boolean(data.is_form_complete),
      };

      setFormData(updatedForm);

      const aiMsg: ChatMessage = {
        id: `c1-ai-${Date.now()}`,
        chatId: 1,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: data.reply_to_customer,
        timestamp: getTimestamp(),
      };
      setChat1Messages((prev) => [...prev, aiMsg]);

      // If form is complete, copy straight to Chat 2 (DCE) + forward any attached customer images directly
      if (data.is_form_complete) {
        const ts = getTimestamp();
        const forwardedMsgs: ChatMessage[] = [
          createForwardedFormMessage(2, updatedForm, ts),
        ];
        const allImages = [...customerImages, ...extraImagesToForward];
        allImages.forEach((img, idx) => {
          forwardedMsgs.push({
            id: `c2-img-init-${Date.now() + idx}`,
            chatId: 2,
            sender: 'ai',
            senderName: 'AI CSKH',
            content: img.caption || '',
            imageUrl: img.imageUrl,
            imageName: img.imageName,
            timestamp: ts,
            badge: 'Ảnh từ Khách',
          });
        });
        setChat2Messages((prev) => [...prev, ...forwardedMsgs]);
        setCurrentState('WAITING_DCE');
      }
    }

    // CASE 2: In CLARIFYING_FOR_DCE -> chỉ dịch và chuyển tiếp sang đối tác DCE, chờ DCE phản hồi mới trả lời Khách
    else if (currentState === 'CLARIFYING_FOR_DCE') {
      const res = await fetch('/api/chatbot/customer-clarification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          staffType: 'DCE',
          form: formData,
          existingAdditionalInfo: formData.thong_tin_bo_sung,
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);
      const updatedInfo = data.updated_additional_info || `${formData.thong_tin_bo_sung}; ${text}`;
      setFormData((prev) => ({
        ...prev,
        thong_tin_bo_sung: updatedInfo,
      }));

      const translated = data.translated_to_staff || text;
      const dceUpdateMsg: ChatMessage = {
        id: `c2-clarify-${Date.now()}`,
        chatId: 2,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: `${translated}\n\nAnh/chị báo giá giúp em.`,
        originalContent: translated !== text ? text : undefined,
        timestamp: getTimestamp(),
        badge: 'Đã dịch từ Khách',
      };
      setChat2Messages((prev) => [...prev, dceUpdateMsg]);

      setCurrentState('WAITING_DCE');
    }

    // CASE 3: In CLARIFYING_FOR_CSDT -> chỉ dịch và chuyển tiếp sang đối tác CSĐT, chờ CSĐT phản hồi mới trả lời Khách
    else if (currentState === 'CLARIFYING_FOR_CSDT') {
      const res = await fetch('/api/chatbot/customer-clarification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          staffType: 'CSDT',
          form: formData,
          existingAdditionalInfo: formData.thong_tin_bo_sung,
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);
      const updatedInfo = data.updated_additional_info || `${formData.thong_tin_bo_sung}; ${text}`;
      setFormData((prev) => ({
        ...prev,
        thong_tin_bo_sung: updatedInfo,
      }));

      const translated = data.translated_to_staff || text;
      const csdtUpdateMsg: ChatMessage = {
        id: `c3-clarify-${Date.now()}`,
        chatId: 3,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: `${translated}\n\nAnh/chị báo giá giúp em.`,
        originalContent: translated !== text ? text : undefined,
        timestamp: getTimestamp(),
        badge: 'Đã dịch từ Khách',
      };
      setChat3Messages((prev) => [...prev, csdtUpdateMsg]);

      setCurrentState('WAITING_CSDT');
    }

    // CASE 4: In QUOTED_WAITING_CUSTOMER -> xử lý 3 trường hợp sau khi báo giá (Đồng ý / Từ chối / Hỏi thêm thông tin)
    else if (currentState === 'QUOTED_WAITING_CUSTOMER') {
      const activePartner: 'DCE' | 'CSDT' = quotePartner || 'DCE';
      const targetChatId = activePartner === 'DCE' ? 2 : 3;
      const setTargetMessages = activePartner === 'DCE' ? setChat2Messages : setChat3Messages;

      const res = await fetch('/api/chatbot/customer-quote-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          quotePartner: activePartner,
          form: formData,
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);
      const decision: 'ACCEPT' | 'DECLINE' | 'ASK_INFO' = data.decision || 'ASK_INFO';

      if (decision === 'ACCEPT') {
        const partnerConfirmMsg: ChatMessage = {
          id: `c${targetChatId}-accept-${Date.now()}`,
          chatId: targetChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: data.message_to_partner || 'Khách chốt, anh/chị đi đơn cho em nhé.',
          timestamp: getTimestamp(),
          badge: 'Khách chốt đơn',
        };
        setTargetMessages((prev) => [...prev, partnerConfirmMsg]);

        const askRecipientPhoneMsg: ChatMessage = {
          id: `c1-ask-recv-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content:
            'Dạ em cảm ơn anh/chị đã xác nhận chốt đơn! Anh/chị cho em xin số điện thoại người nhận hàng ạ.',
          timestamp: getTimestamp(),
          badge: 'Xin SĐT người nhận',
        };
        setChat1Messages((prev) => [...prev, askRecipientPhoneMsg]);

        setIsPostQuoteFollowUp(false);
        setCurrentState('COLLECTING_RECIPIENT_PHONE');
      } else if (decision === 'DECLINE') {
        const customerDeclineMsg: ChatMessage = {
          id: `c1-decline-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Dạ anh/chị cần em hỗ trợ gì thêm thì cứ nhắn em ạ.',
          timestamp: getTimestamp(),
          badge: 'Khách từ chối',
        };
        setChat1Messages((prev) => [...prev, customerDeclineMsg]);

        setIsPostQuoteFollowUp(false);
        setCurrentState('CUSTOMER_DECLINED');
      } else {
        // ASK_INFO: chỉ forward câu hỏi sang đối tác, chờ đối tác trả lời rồi mới phản hồi khách
        const translated = data.translated_to_staff || text;
        const firstImg = extraImagesToForward[0];
        const partnerQuestionMsg: ChatMessage = {
          id: `c${targetChatId}-postq-${Date.now()}`,
          chatId: targetChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `${translated}\n\nAnh/chị phản hồi giúp em ạ.`,
          originalContent: translated !== text ? text : undefined,
          imageUrl: firstImg?.imageUrl,
          imageName: firstImg?.imageName,
          timestamp: getTimestamp(),
          badge: 'Khách hỏi thêm',
        };
        setTargetMessages((prev) => [...prev, partnerQuestionMsg]);

        setIsPostQuoteFollowUp(true);
        setCurrentState(activePartner === 'DCE' ? 'WAITING_DCE' : 'WAITING_CSDT');
      }
    }

    // CASE 5: In COLLECTING_RECIPIENT_PHONE -> nhận SĐT người nhận rồi hỏi SĐT người gửi
    else if (currentState === 'COLLECTING_RECIPIENT_PHONE') {
      const res = await fetch('/api/chatbot/extract-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          phoneRole: 'recipient',
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);

      if (!data.is_valid || !data.phone_number) {
        setChat1Messages((prev) => [
          ...prev,
          {
            id: `c1-invalid-recv-${Date.now()}`,
            chatId: 1,
            sender: 'ai',
            senderName: 'AI CSKH',
            content:
              data.reply_if_invalid ||
              'Dạ em chưa thấy số điện thoại người nhận hợp lệ. Anh/chị vui lòng nhập lại giúp em nhé ạ.',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      const recipientPhone = String(data.phone_number);
      setFormData((prev) => ({
        ...prev,
        sdt_nguoi_nhan: recipientPhone,
      }));

      setChat1Messages((prev) => [
        ...prev,
        {
          id: `c1-ask-sender-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Dạ em đã ghi nhận SĐT người nhận (${recipientPhone}). Anh/chị cho em xin tiếp số điện thoại người gửi hàng ạ.`,
          timestamp: getTimestamp(),
          badge: 'Xin SĐT người gửi',
        },
      ]);

      setCurrentState('COLLECTING_SENDER_PHONE');
    }

    // CASE 6: In COLLECTING_SENDER_PHONE -> nhận SĐT người gửi rồi forward cả 2 SĐT sang DCE hoặc CSĐT
    else if (currentState === 'COLLECTING_SENDER_PHONE') {
      const res = await fetch('/api/chatbot/extract-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          phoneRole: 'sender',
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);

      if (!data.is_valid || !data.phone_number) {
        setChat1Messages((prev) => [
          ...prev,
          {
            id: `c1-invalid-sender-${Date.now()}`,
            chatId: 1,
            sender: 'ai',
            senderName: 'AI CSKH',
            content:
              data.reply_if_invalid ||
              'Dạ em chưa thấy số điện thoại người gửi hợp lệ. Anh/chị vui lòng nhập lại giúp em nhé ạ.',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      const senderPhone = String(data.phone_number);
      const recipientPhone = formData.sdt_nguoi_nhan || '';
      setFormData((prev) => ({
        ...prev,
        sdt_nguoi_gui: senderPhone,
      }));

      const activePartner: 'DCE' | 'CSDT' = quotePartner || 'DCE';
      const targetChatId = activePartner === 'DCE' ? 2 : 3;
      const setTargetMessages = activePartner === 'DCE' ? setChat2Messages : setChat3Messages;

      const ts = getTimestamp();
      const phonesForwardMsg: ChatMessage = {
        id: `c${targetChatId}-phones-${Date.now()}`,
        chatId: targetChatId,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: `Thông tin số điện thoại giao nhận đơn hàng:\n- SĐT người nhận: ${recipientPhone}\n- SĐT người gửi: ${senderPhone}`,
        timestamp: ts,
        badge: 'Thông tin 2 SĐT',
      };
      setTargetMessages((prev) => [...prev, phonesForwardMsg]);

      setChat1Messages((prev) => [
        ...prev,
        {
          id: `c1-ask-payment-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Dạ em đã ghi nhận đủ SĐT người nhận (${recipientPhone}) và SĐT người gửi (${senderPhone}) và chuyển sang đối tác. Anh/chị cho em hỏi thêm bên nào thanh toán tiền cước (người gửi hay người nhận) ạ?`,
          timestamp: ts,
          badge: 'Hỏi bên thanh toán',
        },
      ]);

      setCurrentState('COLLECTING_PAYMENT_PARTY');
    }

    // CASE 7: In COLLECTING_PAYMENT_PARTY -> nhận bên thanh toán tiền cước rồi forward sang DCE hoặc CSĐT -> COMPLETED
    else if (currentState === 'COLLECTING_PAYMENT_PARTY') {
      const res = await fetch('/api/chatbot/extract-payment-party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);

      if (!data.is_valid || !data.payment_party) {
        setChat1Messages((prev) => [
          ...prev,
          {
            id: `c1-invalid-payer-${Date.now()}`,
            chatId: 1,
            sender: 'ai',
            senderName: 'AI CSKH',
            content:
              data.reply_if_invalid ||
              'Dạ anh/chị xác nhận rõ giúp em là người gửi hay người nhận thanh toán tiền cước ạ?',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      const paymentParty = String(data.payment_party);
      setFormData((prev) => ({
        ...prev,
        ben_thanh_toan: paymentParty,
      }));

      const activePartner: 'DCE' | 'CSDT' = quotePartner || 'DCE';
      const targetChatId = activePartner === 'DCE' ? 2 : 3;
      const setTargetMessages = activePartner === 'DCE' ? setChat2Messages : setChat3Messages;

      const ts = getTimestamp();
      setTargetMessages((prev) => [
        ...prev,
        {
          id: `c${targetChatId}-payer-${Date.now()}`,
          chatId: targetChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Bên thanh toán tiền cước: ${paymentParty}`,
          timestamp: ts,
          badge: 'Thanh toán cước',
        },
      ]);

      setChat1Messages((prev) => [
        ...prev,
        {
          id: `c1-ask-payment-time-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Dạ em đã ghi nhận "${paymentParty}" và chuyển sang đối tác. Anh/chị cho em hỏi thêm thời điểm thanh toán tiền cước (lúc gửi hàng hay sau khi nhận hàng) ạ?`,
          timestamp: ts,
          badge: 'Hỏi thời điểm thanh toán',
        },
      ]);

      setCurrentState('COLLECTING_PAYMENT_TIME');
    }

    // CASE 8: In COLLECTING_PAYMENT_TIME -> nhận thời điểm thanh toán, forward sang đối tác (đủ 3 tin nhắn), rồi hỏi đối tác SĐT tài xế
    else if (currentState === 'COLLECTING_PAYMENT_TIME') {
      const res = await fetch('/api/chatbot/extract-payment-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);

      if (!data.is_valid || !data.payment_time) {
        setChat1Messages((prev) => [
          ...prev,
          {
            id: `c1-invalid-paytime-${Date.now()}`,
            chatId: 1,
            sender: 'ai',
            senderName: 'AI CSKH',
            content:
              data.reply_if_invalid ||
              'Dạ anh/chị xác nhận rõ giúp em là thanh toán tiền cước lúc gửi hàng hay sau khi nhận hàng ạ?',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      const paymentTime = String(data.payment_time);
      setFormData((prev) => ({
        ...prev,
        thoi_diem_thanh_toan: paymentTime,
      }));

      const activePartner: 'DCE' | 'CSDT' = quotePartner || 'DCE';
      const targetChatId = activePartner === 'DCE' ? 2 : 3;
      const setTargetMessages = activePartner === 'DCE' ? setChat2Messages : setChat3Messages;

      const ts = getTimestamp();
      setTargetMessages((prev) => [
        ...prev,
        {
          id: `c${targetChatId}-paytime-${Date.now()}`,
          chatId: targetChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Thời điểm thanh toán tiền cước: ${paymentTime}`,
          timestamp: ts,
          badge: 'Thời điểm thanh toán',
        },
        {
          id: `c${targetChatId}-ask-driver-${Date.now() + 1}`,
          chatId: targetChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Anh/chị cho em xin số điện thoại tài xế nhận đơn này để em gửi sang cho khách hàng nhé ạ.',
          timestamp: ts,
          badge: 'Xin SĐT tài xế',
        },
      ]);

      setChat1Messages((prev) => [
        ...prev,
        {
          id: `c1-waiting-driver-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Dạ em đã ghi nhận "${paymentTime}" và chuyển đầy đủ thông tin sang đối tác. Em đang hỏi số điện thoại tài xế từ đối tác để gửi lại anh/chị ngay ạ.`,
          timestamp: ts,
          badge: 'Chờ SĐT tài xế',
        },
      ]);

      setCurrentState(
        activePartner === 'DCE' ? 'WAITING_DRIVER_PHONE_DCE' : 'WAITING_DRIVER_PHONE_CSDT'
      );
    }
  };

  // Core Staff text pipeline (shared by typed text, voice transcript, and optional image caption)
  const processStaffText = async (
    staffType: 'DCE' | 'CSDT',
    text: string,
    attachedImage?: AttachedImageItem
  ) => {
    const staffChatId = staffType === 'DCE' ? 2 : 3;
    const setStaffMessages = staffType === 'DCE' ? setChat2Messages : setChat3Messages;
    const staffHistory = staffType === 'DCE' ? chat2Messages : chat3Messages;
    const staffSender = staffType === 'DCE' ? 'dce' : 'csdt';

    // Handle driver phone response when waiting for driver phone from DCE / CSĐT
    if (
      (staffType === 'DCE' && currentState === 'WAITING_DRIVER_PHONE_DCE') ||
      (staffType === 'CSDT' && currentState === 'WAITING_DRIVER_PHONE_CSDT')
    ) {
      const res = await fetch('/api/chatbot/extract-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          phoneRole: 'driver',
        }),
      });

      const data = await res.json();
      if (data.quota_exceeded) setIsQuotaLimited(true);

      if (!data.is_valid || !data.phone_number) {
        setStaffMessages((prev) => [
          ...prev,
          {
            id: `c${staffChatId}-invalid-driver-${Date.now()}`,
            chatId: staffChatId,
            sender: 'ai',
            senderName: 'AI CSKH',
            content:
              data.reply_if_invalid ||
              'Dạ em chưa thấy số điện thoại tài xế hợp lệ. Anh/chị vui lòng nhắn lại số điện thoại tài xế giúp em nhé ạ.',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      const driverPhone = String(data.phone_number);
      const ts = getTimestamp();

      setFormData((prev) => ({
        ...prev,
        sdt_tai_xe: driverPhone,
      }));

      setStaffMessages((prev) => [
        ...prev,
        {
          id: `c${staffChatId}-driver-ok-${Date.now()}`,
          chatId: staffChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Dạ em cảm ơn anh/chị, em đã gửi thông tin SĐT tài xế sang cho khách hàng rồi ạ.',
          timestamp: ts,
          badge: 'Đã gửi SĐT tài xế',
        },
      ]);

      setChat1Messages((prev) => [
        ...prev,
        {
          id: `c1-driver-phone-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: `Dạ em xin gửi anh/chị thông tin số điện thoại tài xế nhận đơn hàng ạ:\n- SĐT tài xế: ${driverPhone}`,
          imageUrl: attachedImage?.imageUrl,
          imageName: attachedImage?.imageName,
          timestamp: ts,
          badge: 'SĐT tài xế',
        },
      ]);

      setCurrentState('COMPLETED');
      triggerCelebration();
      return;
    }

    const res = await fetch('/api/chatbot/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffType,
        message: text,
        form: formData,
        additionalInfo: formData.thong_tin_bo_sung,
        isPostQuoteFollowUp,
        chatHistory: staffHistory.map((m) => ({
          role: m.sender === staffSender ? 'user' : 'model',
          text: m.content,
        })),
      }),
    });

    const data = await res.json();
    if (data.quota_exceeded) setIsQuotaLimited(true);
    const intent: 'QUOTE' | 'NEED_MORE_INFO' | 'REJECT' = data.intent || 'QUOTE';

    if (intent === 'QUOTE') {
      const aiStaffMsg: ChatMessage = {
        id: `c${staffChatId}-ai-${Date.now()}`,
        chatId: staffChatId,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: isPostQuoteFollowUp
          ? 'Dạ em cảm ơn anh/chị, em chuyển phản hồi sang khách ngay ạ.'
          : 'Dạ em cảm ơn anh/chị, em gửi báo giá sang khách ngay ạ.',
        timestamp: getTimestamp(),
        badge: isPostQuoteFollowUp ? 'Phản hồi Khách' : 'Intent: QUOTE',
      };
      setStaffMessages((prev) => [...prev, aiStaffMsg]);

      const customerQuoteMsg: ChatMessage = {
        id: `c1-quote-${Date.now()}`,
        chatId: 1,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: data.translated_message_for_customer,
        imageUrl: attachedImage?.imageUrl,
        imageName: attachedImage?.imageName,
        timestamp: getTimestamp(),
        badge: isPostQuoteFollowUp
          ? `Phản hồi từ ${staffType === 'DCE' ? 'DCE' : 'CSĐT'}`
          : `Báo giá từ ${staffType === 'DCE' ? 'DCE' : 'CSĐT'}`,
      };
      setChat1Messages((prev) => [...prev, customerQuoteMsg]);

      setQuotePartner(staffType);
      setIsPostQuoteFollowUp(false);
      setCurrentState('QUOTED_WAITING_CUSTOMER');
    } else if (intent === 'NEED_MORE_INFO') {
      const aiStaffMsg: ChatMessage = {
        id: `c${staffChatId}-ai-${Date.now()}`,
        chatId: staffChatId,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: 'Dạ để em hỏi lại khách ạ.',
        timestamp: getTimestamp(),
        badge: 'Intent: NEED_MORE_INFO',
      };
      setStaffMessages((prev) => [...prev, aiStaffMsg]);

      const customerClarifyMsg: ChatMessage = {
        id: `c1-clarify-${Date.now()}`,
        chatId: 1,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: data.translated_message_for_customer,
        imageUrl: attachedImage?.imageUrl,
        imageName: attachedImage?.imageName,
        timestamp: getTimestamp(),
        badge: 'Hỏi thêm thông tin',
      };
      setChat1Messages((prev) => [...prev, customerClarifyMsg]);

      setCurrentState(staffType === 'DCE' ? 'CLARIFYING_FOR_DCE' : 'CLARIFYING_FOR_CSDT');
    } else if (intent === 'REJECT') {
      if (staffType === 'DCE') {
        const aiDceMsg: ChatMessage = {
          id: `c2-ai-${Date.now()}`,
          chatId: 2,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Dạ em cảm ơn anh/chị, để em chuyển đơn sang bộ phận khác ạ.',
          timestamp: getTimestamp(),
          badge: 'Intent: REJECT',
        };
        setChat2Messages((prev) => [...prev, aiDceMsg]);

        const ts = getTimestamp();
        const forwardedMsgs: ChatMessage[] = [
          createForwardedFormMessage(3, formData, ts),
        ];
        customerImages.forEach((img, idx) => {
          forwardedMsgs.push({
            id: `c3-img-fwd-${Date.now() + idx}`,
            chatId: 3,
            sender: 'ai',
            senderName: 'AI CSKH',
            content: img.caption || '',
            imageUrl: img.imageUrl,
            imageName: img.imageName,
            timestamp: ts,
            badge: 'Ảnh từ Khách',
          });
        });
        setChat3Messages((prev) => [...prev, ...forwardedMsgs]);
        setCurrentState('WAITING_CSDT');
      } else {
        const aiCsdtMsg: ChatMessage = {
          id: `c3-ai-${Date.now()}`,
          chatId: 3,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Dạ em cảm ơn anh/chị ạ.',
          timestamp: getTimestamp(),
          badge: 'Intent: REJECT',
        };
        setChat3Messages((prev) => [...prev, aiCsdtMsg]);

        const customerRejectMsg: ChatMessage = {
          id: `c1-reject-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Dạ rất tiếc, tuyến này bên em không hỗ trợ được ạ. Em xin lỗi vì sự bất tiện này!',
          timestamp: getTimestamp(),
          badge: 'Tuyến không hỗ trợ',
        };
        setChat1Messages((prev) => [...prev, customerRejectMsg]);

        setCurrentState('REJECTED');
      }
    }
  };

  // Text send handlers
  const handleCustomerSend = async (text: string) => {
    if (isProcessing) return;

    const userMsg: ChatMessage = {
      id: `c1-${Date.now()}`,
      chatId: 1,
      sender: 'customer',
      senderName: 'Khách hàng',
      content: text,
      timestamp: getTimestamp(),
    };

    const nextHistory = [...chat1Messages, userMsg];
    setChat1Messages(nextHistory);
    setIsProcessing(true);

    try {
      await processCustomerText(text, nextHistory);
    } catch (err) {
      console.error('Error handling customer message:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDceSend = async (text: string) => {
    if (isProcessing) return;

    const dceMsg: ChatMessage = {
      id: `c2-dce-${Date.now()}`,
      chatId: 2,
      sender: 'dce',
      senderName: 'Nhân viên DCE',
      content: text,
      timestamp: getTimestamp(),
    };

    setChat2Messages((prev) => [...prev, dceMsg]);
    setIsProcessing(true);

    try {
      await processStaffText('DCE', text);
    } catch (err) {
      console.error('Error handling DCE message:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCsdtSend = async (text: string) => {
    if (isProcessing) return;

    const csdtMsg: ChatMessage = {
      id: `c3-csdt-${Date.now()}`,
      chatId: 3,
      sender: 'csdt',
      senderName: 'Nhân viên CSĐT',
      content: text,
      timestamp: getTimestamp(),
    };

    setChat3Messages((prev) => [...prev, csdtMsg]);
    setIsProcessing(true);

    try {
      await processStaffText('CSDT', text);
    } catch (err) {
      console.error('Error handling CSĐT message:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Image handlers: forward image straight without translation
  const handleCustomerImage = async (imageUrl: string, imageName: string, caption?: string) => {
    if (isProcessing) return;
    const ts = getTimestamp();

    const userImgMsg: ChatMessage = {
      id: `c1-img-${Date.now()}`,
      chatId: 1,
      sender: 'customer',
      senderName: 'Khách hàng',
      content: caption || '',
      imageUrl,
      imageName,
      timestamp: ts,
      badge: 'Hình ảnh',
    };

    const nextHistory = [...chat1Messages, userImgMsg];
    setChat1Messages(nextHistory);
    const attached: AttachedImageItem = { imageUrl, imageName, caption };
    setCustomerImages((prev) => [...prev, attached]);

    if (currentState === 'COLLECTING_INFO') {
      if (caption) {
        setIsProcessing(true);
        try {
          await processCustomerText(caption, nextHistory, [attached]);
        } catch (err) {
          console.error('Error handling customer image caption:', err);
        } finally {
          setIsProcessing(false);
        }
      } else {
        setChat1Messages((prev) => [
          ...prev,
          {
            id: `c1-ai-img-${Date.now()}`,
            chatId: 1,
            sender: 'ai',
            senderName: 'AI CSKH',
            content: 'Dạ em đã nhận hình ảnh. Anh/chị bổ sung thêm thông tin đơn hàng còn thiếu để em chuyển kèm sang điều phối nhé ạ.',
            timestamp: getTimestamp(),
          },
        ]);
      }
      return;
    }

    if (
      currentState === 'CLARIFYING_FOR_DCE' ||
      currentState === 'CLARIFYING_FOR_CSDT' ||
      currentState === 'QUOTED_WAITING_CUSTOMER'
    ) {
      if (currentState === 'QUOTED_WAITING_CUSTOMER' && caption) {
        setIsProcessing(true);
        try {
          await processCustomerText(caption, nextHistory, [attached]);
        } catch (err) {
          console.error('Error handling customer post-quote image caption:', err);
        } finally {
          setIsProcessing(false);
        }
        return;
      }

      const activePartner =
        currentState === 'CLARIFYING_FOR_DCE'
          ? 'DCE'
          : currentState === 'CLARIFYING_FOR_CSDT'
          ? 'CSDT'
          : quotePartner || 'DCE';
      const targetChatId = activePartner === 'DCE' ? 2 : 3;
      const setTargetMessages = targetChatId === 2 ? setChat2Messages : setChat3Messages;
      const nextState: AppState = targetChatId === 2 ? 'WAITING_DCE' : 'WAITING_CSDT';

      setTargetMessages((prev) => [
        ...prev,
        {
          id: `c${targetChatId}-img-fwd-${Date.now()}`,
          chatId: targetChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: caption
            ? `${caption}\n\nAnh/chị ${currentState === 'QUOTED_WAITING_CUSTOMER' ? 'phản hồi giúp em ạ.' : 'báo giá giúp em.'}`
            : `Hình ảnh từ khách hàng.\n\nAnh/chị ${currentState === 'QUOTED_WAITING_CUSTOMER' ? 'phản hồi giúp em ạ.' : 'báo giá giúp em.'}`,
          imageUrl,
          imageName,
          timestamp: ts,
          badge: 'Chuyển tiếp ảnh',
        },
      ]);

      if (currentState === 'QUOTED_WAITING_CUSTOMER') {
        setIsPostQuoteFollowUp(true);
      }
      setCurrentState(nextState);
    }
  };

  const handleStaffImage = async (
    staffType: 'DCE' | 'CSDT',
    imageUrl: string,
    imageName: string,
    caption?: string
  ) => {
    if (isProcessing) return;
    const ts = getTimestamp();
    const staffChatId = staffType === 'DCE' ? 2 : 3;
    const setStaffMessages = staffType === 'DCE' ? setChat2Messages : setChat3Messages;
    const staffName = staffType === 'DCE' ? 'Nhân viên DCE' : 'Nhân viên CSĐT';
    const staffSender = staffType === 'DCE' ? 'dce' : 'csdt';

    const staffImgMsg: ChatMessage = {
      id: `c${staffChatId}-img-${Date.now()}`,
      chatId: staffChatId,
      sender: staffSender,
      senderName: staffName,
      content: caption || '',
      imageUrl,
      imageName,
      timestamp: ts,
      badge: 'Hình ảnh',
    };
    setStaffMessages((prev) => [...prev, staffImgMsg]);

    if (caption) {
      setIsProcessing(true);
      try {
        await processStaffText(staffType, caption, { imageUrl, imageName, caption });
      } catch (err) {
        console.error(`Error handling ${staffType} image caption:`, err);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Pure image -> forward directly to Chat 1 without translation
    setStaffMessages((prev) => [
      ...prev,
      {
        id: `c${staffChatId}-ai-img-${Date.now()}`,
        chatId: staffChatId,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: 'Dạ em đã chuyển thẳng hình ảnh sang khách hàng ạ.',
        timestamp: ts,
        badge: 'Chuyển tiếp ảnh',
      },
    ]);

    setChat1Messages((prev) => [
      ...prev,
      {
        id: `c1-img-from-staff-${Date.now()}`,
        chatId: 1,
        sender: 'ai',
        senderName: 'AI CSKH',
        content: '',
        imageUrl,
        imageName,
        timestamp: ts,
        badge: staffType === 'DCE' ? 'Ảnh từ DCE' : 'Ảnh từ CSĐT',
      },
    ]);

    if (
      (staffType === 'DCE' && currentState === 'WAITING_DRIVER_PHONE_DCE') ||
      (staffType === 'CSDT' && currentState === 'WAITING_DRIVER_PHONE_CSDT')
    ) {
      setStaffMessages((prev) => [
        ...prev,
        {
          id: `c${staffChatId}-ai-img-driver-${Date.now()}`,
          chatId: staffChatId,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: 'Dạ em đã chuyển ảnh sang khách hàng. Anh/chị nhắn thêm giúp em số điện thoại tài xế bằng chữ hoặc thoại nhé ạ.',
          timestamp: ts,
          badge: 'Chuyển tiếp ảnh',
        },
      ]);

      setChat1Messages((prev) => [
        ...prev,
        {
          id: `c1-img-from-staff-${Date.now()}`,
          chatId: 1,
          sender: 'ai',
          senderName: 'AI CSKH',
          content: '',
          imageUrl,
          imageName,
          timestamp: ts,
          badge: staffType === 'DCE' ? 'Ảnh từ DCE' : 'Ảnh từ CSĐT',
        },
      ]);
      return;
    }

    setCurrentState(staffType === 'DCE' ? 'CLARIFYING_FOR_DCE' : 'CLARIFYING_FOR_CSDT');
  };

  // Voice message handlers: transcribe + translate + forward as TEXT
  const handleCustomerAudio = async (
    audioBase64: string,
    mimeType: string,
    audioUrl: string,
    browserTranscript?: string
  ) => {
    if (isProcessing) return;
    const msgId = `c1-audio-${Date.now()}`;
    const ts = getTimestamp();

    const audioMsg: ChatMessage = {
      id: msgId,
      chatId: 1,
      sender: 'customer',
      senderName: 'Khách hàng',
      content: '',
      audioUrl,
      timestamp: ts,
      badge: 'Tin nhắn thoại',
    };

    setChat1Messages((prev) => [...prev, audioMsg]);
    setIsProcessing(true);

    try {
      const transcript = await transcribeAudio(audioBase64, mimeType, browserTranscript);

      setChat1Messages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                audioTranscript: transcript || 'Không nhận dạng được nội dung thoại.',
              }
            : m
        )
      );

      if (!transcript) {
        setChat1Messages((prev) => [
          ...prev,
          {
            id: `c1-ai-retry-${Date.now()}`,
            chatId: 1,
            sender: 'ai',
            senderName: 'AI CSKH',
            content: 'Dạ em chưa nghe rõ nội dung đoạn ghi âm. Anh/chị vui lòng nói lại rõ hơn hoặc nhắn tin giúp em nhé ạ.',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      const updatedHistory = [
        ...chat1Messages,
        { ...audioMsg, content: transcript, audioTranscript: transcript },
      ];
      await processCustomerText(transcript, updatedHistory);
    } catch (err) {
      console.error('Error handling customer audio:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStaffAudio = async (
    staffType: 'DCE' | 'CSDT',
    audioBase64: string,
    mimeType: string,
    audioUrl: string,
    browserTranscript?: string
  ) => {
    if (isProcessing) return;
    const staffChatId = staffType === 'DCE' ? 2 : 3;
    const setStaffMessages = staffType === 'DCE' ? setChat2Messages : setChat3Messages;
    const staffName = staffType === 'DCE' ? 'Nhân viên DCE' : 'Nhân viên CSĐT';
    const staffSender = staffType === 'DCE' ? 'dce' : 'csdt';
    const msgId = `c${staffChatId}-audio-${Date.now()}`;
    const ts = getTimestamp();

    const audioMsg: ChatMessage = {
      id: msgId,
      chatId: staffChatId,
      sender: staffSender,
      senderName: staffName,
      content: '',
      audioUrl,
      timestamp: ts,
      badge: 'Tin nhắn thoại',
    };

    setStaffMessages((prev) => [...prev, audioMsg]);
    setIsProcessing(true);

    try {
      const transcript = await transcribeAudio(audioBase64, mimeType, browserTranscript);

      setStaffMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                audioTranscript: transcript || 'Không nhận dạng được nội dung thoại.',
              }
            : m
        )
      );

      if (!transcript) {
        setStaffMessages((prev) => [
          ...prev,
          {
            id: `c${staffChatId}-ai-retry-${Date.now()}`,
            chatId: staffChatId,
            sender: 'ai',
            senderName: 'AI CSKH',
            content: 'Dạ em chưa nghe rõ đoạn ghi âm của anh/chị. Anh/chị nói lại hoặc nhắn chữ giúp em nhé ạ.',
            timestamp: getTimestamp(),
          },
        ]);
        return;
      }

      await processStaffText(staffType, transcript);
    } catch (err) {
      console.error(`Error handling ${staffType} audio:`, err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Header State Tracker */}
      <StateTracker
        currentState={currentState}
        formData={formData}
        onOpenMermaid={() => setIsMermaidOpen(true)}
        onReset={handleReset}
        onNewOrder={handleNewOrder}
        isProcessing={isProcessing}
        isQuotaLimited={isQuotaLimited}
      />

      {/* Main 3-Column Parallel Live Chat Layout */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 h-full">
          {/* Column 1: Live Chat 1 (Khách hàng & AI CSKH) */}
          <ChatColumn
            chatId={1}
            title="Live Chat 1: Khách hàng & AI CSKH"
            subtitle="Kênh tiếp nhận Form và giao tiếp với khách hàng"
            roleBadge="Khách hàng"
            roleDescription="Nhập vai Khách hàng"
            messages={chat1Messages}
            currentState={currentState}
            isActive={
              currentState === 'COLLECTING_INFO' ||
              currentState === 'CLARIFYING_FOR_DCE' ||
              currentState === 'CLARIFYING_FOR_CSDT' ||
              currentState === 'QUOTED_WAITING_CUSTOMER' ||
              currentState === 'COLLECTING_RECIPIENT_PHONE' ||
              currentState === 'COLLECTING_SENDER_PHONE' ||
              currentState === 'COLLECTING_PAYMENT_PARTY' ||
              currentState === 'COLLECTING_PAYMENT_TIME'
            }
            onSendMessage={handleCustomerSend}
            onSendImage={handleCustomerImage}
            onSendAudio={handleCustomerAudio}
            onTranslateMessage={handleTranslateMessage}
            isProcessing={isProcessing}
          />

          {/* Column 2: Live Chat 2 (AI CSKH & Nhân viên DCE) */}
          <ChatColumn
            chatId={2}
            title="Live Chat 2: AI CSKH & Nhân viên DCE"
            subtitle="Nhận bản copy Form và hỏi báo giá"
            roleBadge="Nhân viên DCE"
            roleDescription="Nhập vai Nhân viên DCE"
            messages={chat2Messages}
            currentState={currentState}
            isActive={
              currentState === 'WAITING_DCE' ||
              currentState === 'WAITING_DRIVER_PHONE_DCE'
            }
            onSendMessage={handleDceSend}
            onSendImage={(url, name, caption) => handleStaffImage('DCE', url, name, caption)}
            onSendAudio={(b64, mime, url, bt) => handleStaffAudio('DCE', b64, mime, url, bt)}
            onTranslateMessage={handleTranslateMessage}
            isProcessing={isProcessing}
          />

          {/* Column 3: Live Chat 3 (AI CSKH & Nhân viên CSĐT) */}
          <ChatColumn
            chatId={3}
            title="Live Chat 3: AI CSKH & Nhân viên CSĐT"
            subtitle="Chỉ kích hoạt khi DCE từ chối"
            roleBadge="Nhân viên CSĐT"
            roleDescription="Nhập vai Nhân viên CSĐT"
            messages={chat3Messages}
            currentState={currentState}
            isLocked={
              currentState === 'COLLECTING_INFO' ||
              currentState === 'WAITING_DCE' ||
              currentState === 'CLARIFYING_FOR_DCE' ||
              (chat3Messages.length === 0 &&
                (currentState === 'QUOTED_WAITING_CUSTOMER' ||
                  currentState === 'COLLECTING_RECIPIENT_PHONE' ||
                  currentState === 'COLLECTING_SENDER_PHONE' ||
                  currentState === 'COLLECTING_PAYMENT_PARTY' ||
                  currentState === 'COLLECTING_PAYMENT_TIME' ||
                  currentState === 'WAITING_DRIVER_PHONE_DCE' ||
                  currentState === 'CUSTOMER_DECLINED' ||
                  currentState === 'COMPLETED'))
            }
            isActive={
              currentState === 'WAITING_CSDT' ||
              currentState === 'WAITING_DRIVER_PHONE_CSDT'
            }
            onSendMessage={handleCsdtSend}
            onSendImage={(url, name, caption) => handleStaffImage('CSDT', url, name, caption)}
            onSendAudio={(b64, mime, url, bt) => handleStaffAudio('CSDT', b64, mime, url, bt)}
            onTranslateMessage={handleTranslateMessage}
            isProcessing={isProcessing}
          />
        </div>
      </main>

      {/* Mermaid State Machine Interactive Modal */}
      <MermaidModal
        isOpen={isMermaidOpen}
        onClose={() => setIsMermaidOpen(false)}
        currentState={currentState}
      />
    </div>
  );
}
