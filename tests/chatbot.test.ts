import './setup';
import { contextHistory, trimSessionHistory } from '../src/chatbot/memory';
import { readFileSync } from 'node:fs';
import { runtime } from '../src/config/runtime';
import { databaseEnabled } from '../src/config/env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processChatPipeline } from '../src/chatbot/workflows/express';
import { processRideMessage } from '../src/chatbot/workflows/dichung';
import { customer, extractPhone } from '../src/chatbot/playground/service';
import { dispatchStep, newDispatch } from '../src/chatbot/workflows/dispatch';
import { parseVietnameseMoney } from '../src/modules/pricing/quotes';
import { calculateDCExpressPriceFromShippingInfo } from '../src/modules/pricing/engine';
import { sendZaloOAReply } from '../src/modules/zalo/sender';
import { refreshZaloAccessToken } from '../src/modules/zalo/token-manager';
import { validateConfiguration } from '../src/shared/access-guard';

test('DCE pipeline works without AI key', async () => {
  const r = await processChatPipeline('Xin chào', [], {});
  assert.ok(r.reply); assert.ok(r.shippingInfo);
});
test('ride extraction does not invent a price', async () => {
  const r = await processRideMessage('Đón: Hà Nội; Đến: Nội Bài; Thời gian: 8h sáng mai; Số khách: 2');
  assert.equal(r.info.passengers, 2); assert.equal(r.action, 'request_quote'); assert.deepEqual(r.missing, []); assert.match(r.reply, /chưa/);
});
test('original chatbot fallback and phone extraction', async () => {
  const r = await customer({message:'Xin chào',currentForm:{}}); assert.ok(r.reply_to_customer);
  const p = await extractPhone({message:'0912345678',phoneRole:'recipient'}); assert.ok(p.is_valid); assert.equal(p.phone_number,'0912345678');
});
test('dispatch engine starts in collection state; rejects wrong partner', async () => {
  const first = await dispatchStep(newDispatch(), 'customer', 'Xin chào'); assert.equal(first.session.state, 'COLLECTING_INFO'); assert.ok(first.messages.length);
  await assert.rejects(() => dispatchStep(first.session,'CSDT','500k'));
});
test('price engine uses source calculator', () => { assert.equal(parseVietnameseMoney('450k'),450000); const result=calculateDCExpressPriceFromShippingInfo({}); assert.equal(result.hasStandardPrice,false); });
test('safe defaults do not send or refresh Zalo', async () => { validateConfiguration(); assert.equal(await sendZaloOAReply('test','hello'),false); assert.equal(await refreshZaloAccessToken(),null); });


test('environment template only uses original DCE variables', () => {
  const content = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const keys = [...content.matchAll(/^([A-Z_]+)=/gm)].map(match => match[1]);
  assert.deepEqual(keys, ['PORT', 'HOST', 'NODE_ENV', 'APP_URL', 'ADMIN_PASSCODE', 'GEMINI_API_KEY', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_PORT', 'DATABASE_URL', 'ZALO_APP_ID', 'ZALO_APP_SECRET', 'ZALO_OA_ACCESS_TOKEN', 'ZALO_REFRESH_TOKEN']);
  assert.equal(databaseEnabled, Boolean(process.env.DATABASE_URL?.trim()));
  assert.equal(runtime.zalo.live, false);
  assert.equal(runtime.zalo.refresh, false);
});


test('memory follows configured context and session limits', () => {
  const history = Array.from({length: 120}, (_, i) => i);
  assert.deepEqual(contextHistory(history), history.slice(-runtime.chatbot.maxContextMessages));
  assert.deepEqual(trimSessionHistory(history), history.slice(-runtime.chatbot.maxSessionHistory));
  assert.equal(history.length, 120);
});
