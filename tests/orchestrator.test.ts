import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { routeConversation } from '../src/chatbot/services/router';
import { analyzeStaffReply, applyMargin30Percent } from '../src/chatbot/agents/dispatchAgent';
import {
  CHAT_SESSION_TTL_MS,
  zaloUserSessions,
} from '../src/modules/conversation/state';
import {
  ensureActiveChatSession,
  isSessionExpired24h,
} from '../src/modules/conversation/service';
import { linkZaloIds, getLinkedZaloIds } from '../src/modules/zalo/outbound-tracking';
import { handleOAIntervention } from '../src/modules/handover/service';
import { inMemoryCustomers } from '../src/modules/customer/state';
import { inMemoryOrders } from '../src/modules/booking/state';
import { supplierState } from '../src/modules/supplier/state';
import {
  inMemoryDispatchThreads,
  recordDispatchThread,
} from '../src/orchestrator/stateMachine';
import {
  handleCustomerZaloWorkflow,
  handlePartnerZaloMessage,
} from '../src/orchestrator/coordinator';
import { accessGuard, constantTimeEquals, extractAdminPasscodeFromRequest } from '../src/shared/access-guard';

test('Zalo OA defaults straight to express; Web keeps GROUP_MENU', async () => {
  const webRes = await routeConversation('Xin chào', [], {}, { channel: 'web' });
  assert.ok(webRes.reply.includes('Chọn nhóm dịch vụ') || webRes.quickReplies?.length >= 3);

  const zaloRes = await routeConversation('Xin chào', [], {}, { channel: 'zalo' });
  assert.equal(zaloRes.shippingInfo.subVertical, 'express');
  assert.equal(zaloRes.reply.includes('Chọn nhóm dịch vụ'), false);

  const zaloReset = await routeConversation('menu', [], { subVertical: 'express' }, { channel: 'zalo' });
  assert.equal(zaloReset.shippingInfo.subVertical, 'express');
  assert.equal(zaloReset.reply.includes('Chọn nhóm dịch vụ'), false);
});

test('24h fixed chat session & Zalo ID alias handover', async () => {
  const uidApp = 'app-cust-101';
  const uidOa = 'oa-cust-101';
  linkZaloIds(uidApp, uidOa);
  assert.ok(getLinkedZaloIds(uidApp).includes(uidOa));

  const { session, isNewSession } = ensureActiveChatSession(uidApp, {
    linkedIds: [uidOa],
    initialInfo: { mainVertical: 'chuyen_hang', subVertical: 'express' },
  });
  assert.equal(isNewSession, true);
  assert.ok(session.sessionId?.startsWith('CHAT-'));

  // Human replies from OA app using OA recipient ID -> stops AI for both linked IDs
  await handleOAIntervention('oa_send_text', { id: uidOa }, undefined, { text: 'Chào anh, em tư vấn trực tiếp nhé' });
  assert.equal(zaloUserSessions.get(uidApp)?.humanTakeover, true);
  assert.equal(inMemoryCustomers.get(uidApp)?.human_takeover, true);
  assert.equal(ensureActiveChatSession(uidOa).session.humanTakeover, true);

  // Expire fixed 24h window -> rotates to brand new session ID and resets humanTakeover
  session.sessionStartedAt = Date.now() - (CHAT_SESSION_TTL_MS + 60_000);
  assert.equal(isSessionExpired24h(session), true);

  const rotated = ensureActiveChatSession(uidApp, { linkedIds: [uidOa] });
  assert.equal(rotated.isNewSession, true);
  assert.notEqual(rotated.session.sessionId, session.sessionId);
  assert.equal(rotated.session.humanTakeover, false);
});

test('Dispatch +30% margin & DCE -> CSDT waterfall fallback + multi-order disambiguation', async () => {
  assert.equal(applyMargin30Percent(1_200_000), 1_560_000);
  const staffAnalysis = await analyzeStaffReply({ staffType: 'DCE', message: '1tr2 nhé em' });
  assert.equal(staffAnalysis.intent, 'QUOTE');
  assert.equal(staffAnalysis.base_quote_vnd, 1_200_000);
  assert.equal(staffAnalysis.customer_quote_vnd, 1_560_000);

  inMemoryOrders.length = 0;
  inMemoryDispatchThreads.length = 0;
  supplierState.dceOpsUserId = 'dce-ops-1';
  supplierState.defaultSupplierUserId = 'csdt-sup-1';

  inMemoryOrders.push(
    {
      id: 'ord-a',
      trackingCode: 'DCE-2711-1111',
      createdAt: new Date().toISOString(),
      status: 'quoting',
      workflowState: 'WAITING_DCE',
      assignedPartner: 'DCE',
      zaloUserId: 'cust-a',
      chatSessionId: 'CHAT-2711-AAAA',
      source: 'zalo',
      shippingInfo: {
        sender: { address: 'Quận 1, TP HCM' },
        receiver: { address: 'Cầu Giấy, Hà Nội' },
        cargo: { name: 'Hoa quả', weightKg: 10 },
        deliveryTime: 'Trong ngày',
      },
    },
    {
      id: 'ord-b',
      trackingCode: 'DCE-2711-2222',
      createdAt: new Date().toISOString(),
      status: 'quoting',
      workflowState: 'WAITING_DCE',
      assignedPartner: 'DCE',
      zaloUserId: 'cust-b',
      chatSessionId: 'CHAT-2711-BBBB',
      source: 'zalo',
      shippingInfo: {
        sender: { address: 'Hải Châu, Đà Nẵng' },
        receiver: { address: 'Hoàn Kiếm, Hà Nội' },
        cargo: { name: 'Tài liệu', weightKg: 2 },
        deliveryTime: 'Sáng mai',
      },
    }
  );

  // Ambiguous reply when 2 orders pending -> asks partner which order
  const ambig = await handlePartnerZaloMessage({
    userIds: ['dce-ops-1'],
    primaryUserId: 'dce-ops-1',
    messageText: '1tr2',
    skipZaloSend: true,
  });
  assert.equal(ambig.handled, true);
  assert.equal(ambig.status, 'AMBIGUOUS');

  // Quote-Reply via saved Zalo message_id resolves exact order
  await recordDispatchThread({
    trackingCode: 'DCE-2711-2222',
    partnerRole: 'DCE',
    partnerUserId: 'dce-ops-1',
    zaloMsgId: 'zalo-msg-2222',
    expectedState: 'WAITING_DCE',
  });

  // DCE rejects #2222 via Quote-Reply -> falls back to CSDT (Tier 2)
  const rejectRes = await handlePartnerZaloMessage({
    userIds: ['dce-ops-1'],
    primaryUserId: 'dce-ops-1',
    messageText: 'Không nhận',
    replyToMsgId: 'zalo-msg-2222',
    skipZaloSend: true,
  });
  assert.equal(rejectRes.escalatedToCsdt, true);
  assert.equal(inMemoryOrders[1].workflowState, 'WAITING_CSDT');

  // CSDT quotes 1tr -> customer gets 1.300.000 VNĐ (+30%) automatically!
  const csdtQuote = await handlePartnerZaloMessage({
    userIds: ['csdt-sup-1'],
    primaryUserId: 'csdt-sup-1',
    messageText: '1tr',
    skipZaloSend: true,
  });
  assert.equal(csdtQuote.status, 'QUOTED_WAITING_CUSTOMER');
  assert.equal(inMemoryOrders[1].baseCostVnd, 1_000_000);
  assert.equal(inMemoryOrders[1].estimatedPrice, 1_300_000);
  assert.ok(csdtQuote.customerMessage?.includes('1.300.000'));
});

test('Post-quote 4-step phone/payment + parallel VietQR + driver phone completion', async () => {
  inMemoryOrders.length = 0;
  supplierState.dceOpsUserId = 'dce-ops-2';
  inMemoryOrders.push({
    id: 'ord-flow',
    trackingCode: 'DCE-2711-8888',
    createdAt: new Date().toISOString(),
    status: 'quoted',
    workflowState: 'QUOTED_WAITING_CUSTOMER',
    assignedPartner: 'DCE',
    baseCostVnd: 1_000_000,
    estimatedPrice: 1_300_000,
    zaloUserId: 'cust-flow',
    chatSessionId: 'CHAT-2711-8888',
    source: 'zalo',
    shippingInfo: {
      sender: { address: 'Hà Nội' },
      receiver: { address: 'Sài Gòn' },
      cargo: { name: 'Linh kiện', weightKg: 5 },
      deliveryTime: 'Trong ngày',
    },
  });

  const accept = await handleCustomerZaloWorkflow({
    userIds: ['cust-flow'],
    primaryUserId: 'cust-flow',
    chatSessionId: 'CHAT-2711-8888',
    messageText: 'Ok chốt đơn đi em',
    skipZaloSend: true,
  });
  assert.equal(accept.status, 'COLLECTING_RECIPIENT_PHONE');

  const recv = await handleCustomerZaloWorkflow({
    userIds: ['cust-flow'],
    primaryUserId: 'cust-flow',
    chatSessionId: 'CHAT-2711-8888',
    messageText: 'SĐT nhận 0912345678',
    skipZaloSend: true,
  });
  assert.equal(recv.status, 'COLLECTING_SENDER_PHONE');

  const snd = await handleCustomerZaloWorkflow({
    userIds: ['cust-flow'],
    primaryUserId: 'cust-flow',
    chatSessionId: 'CHAT-2711-8888',
    messageText: '0987654321',
    skipZaloSend: true,
  });
  assert.equal(snd.status, 'COLLECTING_PAYMENT_PARTY');

  const party = await handleCustomerZaloWorkflow({
    userIds: ['cust-flow'],
    primaryUserId: 'cust-flow',
    chatSessionId: 'CHAT-2711-8888',
    messageText: 'Người gửi thanh toán',
    skipZaloSend: true,
  });
  assert.equal(party.status, 'COLLECTING_PAYMENT_TIME');

  const timing = await handleCustomerZaloWorkflow({
    userIds: ['cust-flow'],
    primaryUserId: 'cust-flow',
    chatSessionId: 'CHAT-2711-8888',
    messageText: 'Thanh toán lúc gửi hàng',
    skipZaloSend: true,
  });
  assert.equal(timing.status, 'WAITING_DRIVER_PHONE_DCE');
  assert.ok(timing.customerMessage?.includes('/pay/DCE-2711-8888'));
  assert.ok(timing.partnerMessage?.includes('Khách chốt, anh/chị đi đơn cho em nhé'));

  // DCE sends driver phone (auto-matched single pending order) -> COMPLETED!
  const driver = await handlePartnerZaloMessage({
    userIds: ['dce-ops-2'],
    primaryUserId: 'dce-ops-2',
    messageText: 'Tài xế 0909888777',
    skipZaloSend: true,
  });
  assert.equal(driver.status, 'COMPLETED');
  assert.equal(inMemoryOrders[0].driverPhone, '0909888777');
  assert.ok(driver.customerMessage?.includes('0909888777'));
});

test('AccessGuard passcode extraction & timing-safe check', () => {
  assert.equal(typeof accessGuard, 'function');
  assert.equal(constantTimeEquals('secret-123', 'secret-123'), true);
  assert.equal(constantTimeEquals('secret-123', 'wrong-pass'), false);

  const mockReq1 = {
    get: (h: string) => (h.toLowerCase() === 'x-admin-passcode' ? 'my-pass' : ''),
    query: {},
  } as any;
  assert.equal(extractAdminPasscodeFromRequest(mockReq1), 'my-pass');

  const mockReq2 = {
    get: (h: string) => (h.toLowerCase() === 'authorization' ? 'Bearer token-abc' : ''),
    query: {},
  } as any;
  assert.equal(extractAdminPasscodeFromRequest(mockReq2), 'token-abc');

  const app = express();
  assert.ok(app);
});
