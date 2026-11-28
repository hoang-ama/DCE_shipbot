import { runtime } from '../config/runtime';
import { OrderRecordDB } from '../modules/booking/state';
import { supplierState } from '../modules/supplier/state';
import { sendZaloOAReplyWithMeta } from '../modules/zalo/sender';
import { recordCrmInteraction } from '../modules/customer/service';
import { zaloUserSessions } from '../modules/conversation/state';
import {
  analyzeStaffReply,
  applyMargin30Percent,
  buildDispatchFormMessage,
  formatVnd,
  type PartnerTier,
} from '../chatbot/agents/dispatchAgent';
import {
  extractPaymentParty,
  extractPaymentTime,
  extractPhoneNumber,
  translateClarification,
} from '../chatbot/agents/intakeAgent';
import {
  analyzeCustomerQuoteResponse,
  buildPaymentLinkMessage,
  evaluateNegotiationOffer,
} from '../chatbot/agents/closingAgent';
import {
  OrderWorkflowState,
  findActiveCustomerOrder,
  orderToFormData,
  recordDispatchThread,
  resolvePartnerOrderForReply,
  updateOrderWorkflow,
} from './stateMachine';

export interface OrchestrationResult {
  handled: boolean;
  status?: string;
  order?: OrderRecordDB;
  customerMessage?: string;
  partnerMessage?: string;
  escalatedToCsdt?: boolean;
}

const ambiguousPromptCooldowns = new Map<string, number>();
const AMBIGUOUS_PROMPT_COOLDOWN_MS = 2 * 60 * 1000;

function shouldSendAmbiguousPrompt(targetUserId: string, trackingCodes: string[]): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of ambiguousPromptCooldowns) {
    if (expiresAt <= now) ambiguousPromptCooldowns.delete(key);
  }
  const signature = trackingCodes.slice().sort().join('|');
  const key = `${targetUserId}:${signature}`;
  if ((ambiguousPromptCooldowns.get(key) || 0) > now) return false;
  ambiguousPromptCooldowns.set(key, now + AMBIGUOUS_PROMPT_COOLDOWN_MS);
  return true;
}

export function detectPartnerRoleFromIds(userIds: string[]): PartnerTier | null {
  // Compare only this sender's explicitly linked IDs with the configured partner IDs.
  // Do not expand the configured IDs through a shared OA alias.
  const candidateSet = new Set(userIds.map((id) => id.trim()).filter(Boolean));
  const isDceOps = Boolean(supplierState.dceOpsUserId && candidateSet.has(supplierState.dceOpsUserId.trim()));
  const isSupplier = Boolean(supplierState.defaultSupplierUserId && candidateSet.has(supplierState.defaultSupplierUserId.trim()));

  // If an account is configured as both roles, fail closed instead of guessing.
  if (isDceOps === isSupplier) return null;
  return isDceOps ? 'DCE' : 'CSDT';
}

export async function dispatchMessageToPartner(opts: {
  tier: PartnerTier;
  trackingCode: string;
  text: string;
  expectedState: OrderWorkflowState;
  skipZaloSend?: boolean;
}): Promise<{ sent: boolean; targetUserId: string; messageId?: string }> {
  const targetUserId =
    opts.tier === 'DCE' ? supplierState.dceOpsUserId : supplierState.defaultSupplierUserId;

  if (!targetUserId) {
    return { sent: false, targetUserId: '' };
  }

  let sent = false;
  let messageId: string | undefined;

  if (!opts.skipZaloSend) {
    const res = await sendZaloOAReplyWithMeta(targetUserId, opts.text);
    sent = res.success;
    messageId = res.messageId;
  }

  await recordDispatchThread({
    trackingCode: opts.trackingCode,
    partnerRole: opts.tier,
    partnerUserId: targetUserId,
    zaloMsgId: messageId,
    expectedState: opts.expectedState,
  });

  await recordCrmInteraction(
    targetUserId,
    'bot',
    opts.text,
    undefined,
    opts.tier === 'DCE' ? 'Điều Phối -> DCE (Cấp 1)' : 'Điều Phối -> CSĐT (Cấp 2)'
  );

  return { sent, targetUserId, messageId };
}

async function sendToOrderCustomer(
  order: OrderRecordDB,
  text: string,
  skipZaloSend?: boolean
): Promise<boolean> {
  if (!order.zaloUserId || !text) return false;
  let ok = false;
  if (!skipZaloSend) {
    const res = await sendZaloOAReplyWithMeta(order.zaloUserId, text);
    ok = res.success;
  }
  const sess = zaloUserSessions.get(order.zaloUserId);
  if (sess && Array.isArray(sess.history)) {
    sess.history.push({ role: 'model', content: text });
  }
  await recordCrmInteraction(
    order.zaloUserId,
    'bot',
    text,
    order.shippingInfo,
    'ShipBot AI CSKH',
    order.chatSessionId
  );
  return ok;
}

export async function handlePartnerZaloMessage(input: {
  userIds: string[];
  primaryUserId: string;
  messageText: string;
  replyToMsgId?: string;
  explicitTrackingCode?: string;
  forcedRole?: PartnerTier;
  skipZaloSend?: boolean;
}): Promise<OrchestrationResult> {
  const partnerRole = input.forcedRole || detectPartnerRoleFromIds(input.userIds);
  if (!partnerRole) return { handled: false };

  const textWithCode = input.explicitTrackingCode
    ? `#${input.explicitTrackingCode} ${input.messageText}`
    : input.messageText;

  const resolved = await resolvePartnerOrderForReply({
    partnerRole,
    messageText: textWithCode,
    replyToMsgId: input.replyToMsgId,
  });

  if (resolved.status === 'NONE') {
    return { handled: false };
  }

  if (resolved.status === 'AMBIGUOUS') {
    const exampleCode = resolved.candidates[0]?.trackingCode.split('-').pop();
    const clarifyPartnerMsg =
      `⚠️ Hiện có ${resolved.candidates.length} đơn đang chờ phản hồi. ` +
      `Nhờ anh/chị Quote đúng tin nhắn của đơn hoặc gửi mã đơn/4 số cuối (VD: "#${exampleCode || '2319'} 1tr2") để em xác định đơn cần xử lý ạ.`;
    const partnerTargetUserId =
      partnerRole === 'DCE' ? supplierState.dceOpsUserId : supplierState.defaultSupplierUserId;

    // Never expose the pending-order list or send this prompt to an unverified inbound sender.
    if (partnerTargetUserId && !input.skipZaloSend && shouldSendAmbiguousPrompt(partnerTargetUserId, resolved.candidates.map((order) => order.trackingCode))) {
      await sendZaloOAReplyWithMeta(partnerTargetUserId, clarifyPartnerMsg);
    }
    if (partnerTargetUserId) {
      await recordCrmInteraction(partnerTargetUserId, 'bot', clarifyPartnerMsg);
    }
    return { handled: true, status: 'AMBIGUOUS', partnerMessage: clarifyPartnerMsg };
  }

  const order = resolved.order;
  const currentState = (order.workflowState as OrderWorkflowState) || 'WAITING_DCE';

  // Case 1: Collecting Driver Phone after Customer confirmed & paid
  if (currentState === 'WAITING_DRIVER_PHONE_DCE' || currentState === 'WAITING_DRIVER_PHONE_CSDT') {
    const phoneRes = await extractPhoneNumber({ message: input.messageText, phoneRole: 'driver' });
    if (phoneRes.is_valid && phoneRes.phone_number) {
      const driverPhone = phoneRes.phone_number as string;
      await updateOrderWorkflow(order, {
        driverPhone,
        workflowState: 'COMPLETED',
        status: 'dispatched',
      });

      const customerMessage =
        `Dạ tài xế phụ trách đơn #${order.trackingCode} của anh/chị là ${driverPhone} ạ. ` +
        `Tài xế sẽ chủ động liên hệ anh/chị trước khi qua lấy hàng nhé!`;
      const partnerMessage = `✅ Đã ghi nhận SĐT tài xế ${driverPhone} và gửi tới khách hàng đơn #${order.trackingCode}. Hoàn tất điều phối!`;

      await sendToOrderCustomer(order, customerMessage, input.skipZaloSend);
      if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
      return { handled: true, status: 'COMPLETED', order, customerMessage, partnerMessage };
    }

    const partnerMessage =
      `⚠️ Hệ thống đang chờ SĐT tài xế nhận đơn #${order.trackingCode}. ` +
      `Anh/chị vui lòng nhắn rõ SĐT tài xế (VD: 0912345678) nhé ạ.`;
    if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
    return { handled: true, status: currentState, order, partnerMessage };
  }

  // Case 2: Analyzing Quote / Need More Info / Reject / Post-Quote Q&A
  const isPostQuoteFollowUp = currentState === 'QUOTED_WAITING_CUSTOMER';
  const analysis = await analyzeStaffReply({
    staffType: partnerRole,
    message: input.messageText,
    form: orderToFormData(order),
    additionalInfo: order.quoteNote || '',
    isPostQuoteFollowUp,
  });

  if (analysis.intent === 'REJECT') {
    if (partnerRole === 'DCE') {
      await updateOrderWorkflow(order, {
        workflowState: 'WAITING_CSDT',
        assignedPartner: 'CSDT',
        status: 'quoting',
      });

      const form = orderToFormData(order);
      const csdtPrompt = buildDispatchFormMessage({
        trackingCode: order.trackingCode,
        tier: 'CSDT',
        form,
        additionalInfo: order.quoteNote,
        baseUrl: process.env.APP_URL || 'http://localhost:2700',
        isWaterfallFallback: true,
      });

      await dispatchMessageToPartner({
        tier: 'CSDT',
        trackingCode: order.trackingCode,
        text: csdtPrompt,
        expectedState: 'WAITING_CSDT',
        skipZaloSend: input.skipZaloSend,
      });

      const partnerMessage = `🤖 Đã ghi nhận Đội xe DCE từ chối đơn #${order.trackingCode}. Hệ thống đã tự động chuyển đơn sang Đội xe CSĐT (Cấp 2) ạ.`;
      if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
      return {
        handled: true,
        status: 'WAITING_CSDT',
        order,
        partnerMessage,
        escalatedToCsdt: true,
      };
    }

    await updateOrderWorkflow(order, {
      workflowState: 'REJECTED',
      assignedPartner: 'CSDT',
      status: 'rejected',
    });
    const customerMessage = `Dạ rất tiếc tuyến này hiện bên em chưa bố trí được xe phù hợp cho đơn #${order.trackingCode} ạ. Anh/chị cần hỗ trợ tuyến khác cứ nhắn em nhé!`;
    const partnerMessage = `🤖 Đã ghi nhận CSĐT không nhận đơn #${order.trackingCode} và thông báo tới khách hàng.`;

    await sendToOrderCustomer(order, customerMessage, input.skipZaloSend);
    if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
    return { handled: true, status: 'REJECTED', order, customerMessage, partnerMessage };
  }

  if (analysis.intent === 'NEED_MORE_INFO') {
    const clarifyState: OrderWorkflowState =
      partnerRole === 'DCE' ? 'CLARIFYING_FOR_DCE' : 'CLARIFYING_FOR_CSDT';
    await updateOrderWorkflow(order, {
      workflowState: clarifyState,
      assignedPartner: partnerRole,
      status: 'clarifying',
    });

    const customerMessage = analysis.translated_message_for_customer;
    const partnerMessage = `🤖 Em đã chuyển câu hỏi tới khách hàng đơn #${order.trackingCode}: "${analysis.clarification_question || input.messageText}"`;

    await sendToOrderCustomer(order, customerMessage, input.skipZaloSend);
    if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
    return { handled: true, status: clarifyState, order, customerMessage, partnerMessage };
  }

  // Intent === 'QUOTE' (either initial base quote +30% OR post-quote Q&A reply)
  if (analysis.base_quote_vnd) {
    const baseCostVnd = Number(analysis.base_quote_vnd);
    const customerQuoteVnd = Number(
      analysis.customer_quote_vnd || applyMargin30Percent(baseCostVnd)
    );
    await updateOrderWorkflow(order, {
      baseCostVnd,
      estimatedPrice: customerQuoteVnd,
      assignedPartner: partnerRole,
      quotedBy: partnerRole === 'DCE' ? 'DCE Ops (Cấp 1)' : 'CSĐT (Cấp 2)',
      quotedAt: new Date().toISOString(),
      workflowState: 'QUOTED_WAITING_CUSTOMER',
      status: 'quoted',
    });

    const customerMessage =
      analysis.customer_quote_message_with_margin ||
      `Dạ báo giá cước vận chuyển cho đơn #${order.trackingCode} của anh/chị là ${formatVnd(customerQuoteVnd)} ạ. Anh/chị xác nhận chốt đơn giúp em nhé!`;
    const partnerMessage = `🤖 Đã nhận giá gốc ${formatVnd(baseCostVnd)} từ ${partnerRole} -> Báo giá khách (+30%): ${formatVnd(customerQuoteVnd)} cho đơn #${order.trackingCode}.`;

    await sendToOrderCustomer(order, customerMessage, input.skipZaloSend);
    if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
    return {
      handled: true,
      status: 'QUOTED_WAITING_CUSTOMER',
      order,
      customerMessage,
      partnerMessage,
    };
  }

  // Post-quote answer without changing quoted price
  const customerMessage = analysis.translated_message_for_customer;
  const partnerMessage = `🤖 Em đã chuyển thông tin giải đáp của ${partnerRole} tới khách hàng đơn #${order.trackingCode}.`;
  await sendToOrderCustomer(order, customerMessage, input.skipZaloSend);
  if (!input.skipZaloSend) await sendZaloOAReplyWithMeta(input.primaryUserId, partnerMessage);
  return { handled: true, status: currentState, order, customerMessage, partnerMessage };
}

export async function handleCustomerZaloWorkflow(input: {
  userIds: string[];
  primaryUserId: string;
  chatSessionId?: string;
  messageText: string;
  skipZaloSend?: boolean;
}): Promise<OrchestrationResult> {
  if (/^(?:đổi dịch vụ|chọn lại dịch vụ|menu|tạo đơn mới|đơn mới|reset)$/iu.test(input.messageText.trim())) {
    return { handled: false };
  }

  const order = findActiveCustomerOrder(input.userIds, input.chatSessionId);
  if (!order || !order.workflowState) {
    return { handled: false };
  }

  const state = order.workflowState as OrderWorkflowState;

  if (state === 'COLLECTING_INFO') {
    return { handled: false };
  }

  if (state === 'WAITING_DCE' || state === 'WAITING_CSDT') {
    const customerMessage = `Dạ bộ phận điều phối đang kiểm tra báo giá tốt nhất cho đơn #${order.trackingCode} của anh/chị, em sẽ báo lại ngay khi có phản hồi nhé ạ.`;
    return { handled: true, status: state, order, customerMessage };
  }

  if (state === 'WAITING_DRIVER_PHONE_DCE' || state === 'WAITING_DRIVER_PHONE_CSDT') {
    const customerMessage = `Dạ đơn #${order.trackingCode} đã chuyển sang đội xe điều phối tài xế rồi ạ. Em sẽ gửi SĐT tài xế tới anh/chị ngay khi nhận được nhé!`;
    return { handled: true, status: state, order, customerMessage };
  }

  // Clarification reply from customer -> translate & send back to requesting partner
  if (state === 'CLARIFYING_FOR_DCE' || state === 'CLARIFYING_FOR_CSDT') {
    const targetTier: PartnerTier = state === 'CLARIFYING_FOR_CSDT' ? 'CSDT' : 'DCE';
    const nextState: OrderWorkflowState = targetTier === 'CSDT' ? 'WAITING_CSDT' : 'WAITING_DCE';
    const res = await translateClarification({
      message: input.messageText,
      staffType: targetTier,
      form: orderToFormData(order),
      existingAdditionalInfo: order.quoteNote || '',
    });

    await updateOrderWorkflow(order, {
      workflowState: nextState,
      assignedPartner: targetTier,
      quoteNote: res.updated_additional_info || input.messageText,
      additionalInfo: res.updated_additional_info || input.messageText,
      status: 'quoting',
    });

    const partnerMsg = `📝 [THÔNG TIN BỔ SUNG ĐƠN #${order.trackingCode}]\nKhách phản hồi: ${res.translated_to_staff || input.messageText}\nNhờ anh/chị xem và báo giá giúp em ạ!`;
    await dispatchMessageToPartner({
      tier: targetTier,
      trackingCode: order.trackingCode,
      text: partnerMsg,
      expectedState: nextState,
      skipZaloSend: input.skipZaloSend,
    });

    const customerMessage =
      res.reply_to_customer ||
      `Dạ em cảm ơn anh/chị đã bổ sung thông tin cho đơn #${order.trackingCode}. Em đã chuyển ngay cho đội xe để báo giá lại cho mình ạ!`;
    return { handled: true, status: nextState, order, customerMessage, partnerMessage: partnerMsg };
  }

  // Customer responds after receiving a quote
  if (state === 'QUOTED_WAITING_CUSTOMER') {
    const targetTier: PartnerTier = order.assignedPartner === 'CSDT' ? 'CSDT' : 'DCE';

    if (!order.negotiationUsed) {
      const neg = evaluateNegotiationOffer(
        input.messageText,
        order.estimatedPrice,
        order.baseCostVnd
      );
      if (neg.canAutoAcceptDiscount && neg.discountedVnd && neg.replyToCustomer) {
        await updateOrderWorkflow(order, {
          estimatedPrice: neg.discountedVnd,
          negotiationUsed: true,
        });
        return {
          handled: true,
          status: 'QUOTED_WAITING_CUSTOMER',
          order,
          customerMessage: neg.replyToCustomer,
        };
      }
    }

    const quoteRes = await analyzeCustomerQuoteResponse({
      message: input.messageText,
      quotePartner: targetTier,
      form: orderToFormData(order),
    });

    if (quoteRes.decision === 'ACCEPT') {
      await updateOrderWorkflow(order, {
        workflowState: 'COLLECTING_RECIPIENT_PHONE',
        status: 'accepted',
      });
      const customerMessage =
        `Dạ em cảm ơn anh/chị đã xác nhận chốt đơn #${order.trackingCode}! ` +
        `Để điều xe ngay, anh/chị cho em xin **Số điện thoại người nhận hàng** trước nhé ạ.`;
      return {
        handled: true,
        status: 'COLLECTING_RECIPIENT_PHONE',
        order,
        customerMessage,
      };
    }

    if (quoteRes.decision === 'DECLINE') {
      await updateOrderWorkflow(order, {
        workflowState: 'CUSTOMER_DECLINED',
        status: 'cancelled',
      });
      return {
        handled: true,
        status: 'CUSTOMER_DECLINED',
        order,
        customerMessage: quoteRes.reply_to_customer,
      };
    }

    // ASK_INFO -> forward question to Partner while keeping QUOTED_WAITING_CUSTOMER
    const partnerMsg = `❓ [KHÁCH HỎI THÊM ĐƠN #${order.trackingCode}]\nKhách hỏi: ${quoteRes.translated_to_staff || input.messageText}\nNhờ anh/chị giải đáp giúp em để khách chốt đơn ạ!`;
    await dispatchMessageToPartner({
      tier: targetTier,
      trackingCode: order.trackingCode,
      text: partnerMsg,
      expectedState: 'QUOTED_WAITING_CUSTOMER',
      skipZaloSend: input.skipZaloSend,
    });

    const customerMessage = `Dạ để em kiểm tra lại thông tin này với đội xe phụ trách đơn #${order.trackingCode} và báo lại anh/chị ngay nhé ạ!`;
    return {
      handled: true,
      status: 'QUOTED_WAITING_CUSTOMER',
      order,
      customerMessage,
      partnerMessage: partnerMsg,
    };
  }

  // Post-Quote 4-Step Collection
  if (state === 'COLLECTING_RECIPIENT_PHONE') {
    const phoneRes = await extractPhoneNumber({ message: input.messageText, phoneRole: 'recipient' });
    if (!phoneRes.is_valid || !phoneRes.phone_number) {
      return {
        handled: true,
        status: state,
        order,
        customerMessage: phoneRes.reply_if_invalid,
      };
    }

    const updatedInfo = {
      ...(order.shippingInfo || {}),
      receiver: { ...(order.shippingInfo?.receiver || {}), phone: phoneRes.phone_number },
    };
    await updateOrderWorkflow(order, {
      shippingInfo: updatedInfo,
      workflowState: 'COLLECTING_SENDER_PHONE',
    });

    return {
      handled: true,
      status: 'COLLECTING_SENDER_PHONE',
      order,
      customerMessage: `Dạ em đã ghi nhận SĐT người nhận: ${phoneRes.phone_number}. Anh/chị cho em xin **Số điện thoại người gửi hàng** tiếp theo nhé ạ.`,
    };
  }

  if (state === 'COLLECTING_SENDER_PHONE') {
    const phoneRes = await extractPhoneNumber({ message: input.messageText, phoneRole: 'sender' });
    if (!phoneRes.is_valid || !phoneRes.phone_number) {
      return {
        handled: true,
        status: state,
        order,
        customerMessage: phoneRes.reply_if_invalid,
      };
    }

    const updatedInfo = {
      ...(order.shippingInfo || {}),
      sender: { ...(order.shippingInfo?.sender || {}), phone: phoneRes.phone_number },
    };
    await updateOrderWorkflow(order, {
      customerPhone: phoneRes.phone_number,
      shippingInfo: updatedInfo,
      workflowState: 'COLLECTING_PAYMENT_PARTY',
    });

    return {
      handled: true,
      status: 'COLLECTING_PAYMENT_PARTY',
      order,
      customerMessage: `Dạ em đã ghi nhận SĐT người gửi: ${phoneRes.phone_number}. Cho em hỏi **bên nào sẽ thanh toán tiền cước** (Người gửi hay Người nhận) ạ?`,
    };
  }

  if (state === 'COLLECTING_PAYMENT_PARTY') {
    const partyRes = await extractPaymentParty({ message: input.messageText });
    if (!partyRes.is_valid || !partyRes.payment_party) {
      return {
        handled: true,
        status: state,
        order,
        customerMessage: partyRes.reply_if_invalid,
      };
    }

    await updateOrderWorkflow(order, {
      paymentParty: partyRes.payment_party,
      workflowState: 'COLLECTING_PAYMENT_TIME',
    });

    return {
      handled: true,
      status: 'COLLECTING_PAYMENT_TIME',
      order,
      customerMessage: `Dạ em đã ghi nhận: ${partyRes.payment_party}. Anh/chị muốn thanh toán tiền cước **lúc gửi hàng** hay **sau khi nhận hàng** ạ?`,
    };
  }

  if (state === 'COLLECTING_PAYMENT_TIME') {
    const timeRes = await extractPaymentTime({ message: input.messageText });
    if (!timeRes.is_valid || !timeRes.payment_time) {
      return {
        handled: true,
        status: state,
        order,
        customerMessage: timeRes.reply_if_invalid,
      };
    }

    const targetTier: PartnerTier = order.assignedPartner === 'CSDT' ? 'CSDT' : 'DCE';
    const nextState: OrderWorkflowState =
      targetTier === 'CSDT' ? 'WAITING_DRIVER_PHONE_CSDT' : 'WAITING_DRIVER_PHONE_DCE';

    await updateOrderWorkflow(order, {
      paymentTiming: timeRes.payment_time,
      workflowState: nextState,
      status: 'awaiting_driver',
    });

    const recvPhone = order.shippingInfo?.receiver?.phone || 'Chưa rõ';
    const sendPhone = order.customerPhone || order.shippingInfo?.sender?.phone || 'Chưa rõ';
    const form = orderToFormData(order);

    const partnerMsg =
      `🚚 [KHÁCH CHỐT ĐI ĐƠN - #${order.trackingCode}]\n` +
      `Khách chốt, anh/chị đi đơn cho em nhé.\n` +
      `• Tuyến: ${form.dia_chi_lay_hang} -> ${form.dia_chi_giao_hang}\n` +
      `• Hàng: ${form.thong_tin_hang} | Thời gian: ${form.thoi_gian_giao_nhan}\n` +
      `• SĐT Người gửi: ${sendPhone} | SĐT Người nhận: ${recvPhone}\n` +
      `• Thanh toán: ${order.paymentParty || 'Chưa rõ'} (${timeRes.payment_time})\n` +
      `👉 Anh/chị nhắn lại giúp em **SĐT Tài xế** nhận đơn này nhé!`;

    await dispatchMessageToPartner({
      tier: targetTier,
      trackingCode: order.trackingCode,
      text: partnerMsg,
      expectedState: nextState,
      skipZaloSend: input.skipZaloSend,
    });

    let customerMessage =
      `Dạ em đã chốt đủ thông tin đơn #${order.trackingCode} (${order.paymentParty} — ${timeRes.payment_time}) và báo đội xe điều tài xế ngay cho mình ạ. ` +
      `Em sẽ gửi SĐT tài xế tới anh/chị ngay khi nhận được nhé!`;

    if (timeRes.payment_time === 'Thanh toán lúc gửi hàng') {
      customerMessage += `\n\n${buildPaymentLinkMessage(order.trackingCode, process.env.APP_URL || 'http://localhost:2700', order.estimatedPrice)}`;
    }

    return {
      handled: true,
      status: nextState,
      order,
      customerMessage,
      partnerMessage: partnerMsg,
    };
  }

  return { handled: false };
}
