import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../config/paths';
import { liveZalo, tokenMode } from "../config/env";
import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from '../modules/pricing/engine';
import { databaseState } from './connection';
import { tokenState } from '../modules/zalo/state';
import { zaloUserSessions } from '../modules/conversation/state';
import { inMemoryCustomers, inMemoryMessages } from '../modules/customer/state';
import { inMemoryOrders } from '../modules/booking/state';
import { supplierState } from '../modules/supplier/state';
import { paymentState } from '../modules/payment/state';
import { asteriskState, inMemoryCallLogs } from '../modules/asterisk/state';
import { pricingState } from '../modules/pricing/state';

export async function initDatabaseAndRestore() {
  if (!databaseState.dbPool) return;
  try {
    await databaseState.dbPool.query(fs.readFileSync(path.join(ROOT_DIR, 'src/database/migrations/001_express.sql'), 'utf8'));
    console.log('[Database] PostgreSQL tables (auth, sessions, CRM, shipping_orders) initialized successfully.');

    // 1. Restore tokens from PostgreSQL
    if (liveZalo && tokenMode === "local_owner") {
    const tokenRes = await databaseState.dbPool.query(`SELECT access_token, refresh_token, updated_at FROM zalo_auth WHERE id = 'default' LIMIT 1`);
    if (tokenRes.rows.length > 0) {
      const row = tokenRes.rows[0];
      if (row.access_token) tokenState.currentZaloAccessToken = row.access_token;
      if (row.refresh_token) tokenState.currentZaloRefreshToken = row.refresh_token;
      if (row.updated_at) tokenState.lastTokenRefreshTimestamp = new Date(row.updated_at).getTime();
      console.log('[Database] Successfully restored active Zalo tokens from PostgreSQL!');
    } else if (tokenState.currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN) {
      // First boot with new DB: Seed DB with the current active token!
      const initialAccess = tokenState.currentZaloAccessToken || process.env.ZALO_OA_ACCESS_TOKEN || '';
      const initialRefresh = tokenState.currentZaloRefreshToken || process.env.ZALO_REFRESH_TOKEN || '';
      await databaseState.dbPool.query(`
        INSERT INTO zalo_auth (id, access_token, refresh_token, updated_at)
        VALUES ('default', $1, $2, NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [initialAccess, initialRefresh]);
      console.log('[Database] Seeded initial Zalo tokens into PostgreSQL from environment.');
    }

    }

    // 2. Restore active sessions from PostgreSQL (skip sessions expired past 24h fixed window)
    const { CHAT_SESSION_TTL_MS } = await import('../modules/conversation/state');
    const { isSessionExpired24h } = await import('../modules/conversation/service');
    const nowRestore = Date.now();
    const sessRes = await databaseState.dbPool.query(`SELECT user_id, session_data FROM zalo_sessions`);
    for (const r of sessRes.rows) {
      const sd = r.session_data || {};
      if (!isSessionExpired24h(sd, nowRestore)) {
        zaloUserSessions.set(r.user_id, sd);
      }
    }
    if (sessRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${zaloUserSessions.size}/${sessRes.rows.length} active (<24h) sessions from PostgreSQL!`);
    }

    // 3. Restore CRM Customers from PostgreSQL
    const custRes = await databaseState.dbPool.query(`SELECT * FROM crm_customers ORDER BY last_interaction DESC LIMIT 100`);
    for (const r of custRes.rows) {
      const sessionStartedIso = r.session_started_at ? new Date(r.session_started_at).toISOString() : undefined;
      const sessionStillValid = sessionStartedIso ? (nowRestore - new Date(sessionStartedIso).getTime() < CHAT_SESSION_TTL_MS) : true;
      inMemoryCustomers.set(r.user_id, {
        user_id: r.user_id,
        name: r.name || `Khách Zalo (${r.user_id.slice(-4)})`,
        phone: r.phone || '',
        address: r.address || '',
        avatar: r.avatar || '',
        order_count: r.order_count || 0,
        first_interaction: r.first_interaction ? new Date(r.first_interaction).toISOString() : new Date().toISOString(),
        last_interaction: r.last_interaction ? new Date(r.last_interaction).toISOString() : new Date().toISOString(),
        last_message: r.last_message || '',
        human_takeover: sessionStillValid ? Boolean(r.human_takeover) : false,
        current_session_id: r.current_session_id || undefined,
        session_started_at: sessionStartedIso,
        shipping_info: r.shipping_info || {},
      });
    }
    if (custRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${custRes.rows.length} CRM customers from PostgreSQL!`);
    }

    // 4. Restore recent CRM Messages from PostgreSQL
    const msgRes = await databaseState.dbPool.query(`SELECT * FROM crm_messages ORDER BY created_at DESC LIMIT 500`);
    for (const r of msgRes.rows.reverse()) {
      inMemoryMessages.push({
        id: r.id,
        user_id: r.user_id,
        session_id: r.session_id || undefined,
        sender: r.sender,
        sender_name: r.sender_name,
        message_text: r.message_text,
        shipping_info_snapshot: r.shipping_info_snapshot,
        ai_trace: r.ai_trace || undefined,
        created_at: new Date(r.created_at).toISOString(),
      });
    }
    if (msgRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${msgRes.rows.length} CRM messages from PostgreSQL!`);
    }

    // 5. Restore Shipping Orders from PostgreSQL
    const ordRes = await databaseState.dbPool.query(`SELECT * FROM shipping_orders ORDER BY created_at DESC LIMIT 100`);
    inMemoryOrders.length = 0;
    for (const r of ordRes.rows) {
      inMemoryOrders.push({
        id: r.id,
        trackingCode: r.tracking_code,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN'),
        status: r.status || 'created',
        workflowState: r.workflow_state || undefined,
        assignedPartner: r.assigned_partner || undefined,
        customerName: r.customer_name || '',
        customerPhone: r.customer_phone || '',
        zaloUserId: r.zalo_user_id || undefined,
        chatSessionId: r.chat_session_id || undefined,
        baseCostVnd: r.base_cost_vnd != null ? Number(r.base_cost_vnd) : undefined,
        estimatedPrice: r.customer_quote_vnd != null ? Number(r.customer_quote_vnd) : undefined,
        quotedBy: r.quoted_by || undefined,
        quotedAt: r.quoted_at ? new Date(r.quoted_at).toISOString() : undefined,
        quoteNote: r.quote_note || undefined,
        paymentMethod: r.payment_method || undefined,
        paymentStatus: r.payment_status || 'unpaid',
        paymentParty: r.payment_party || undefined,
        paymentTiming: r.payment_timing || undefined,
        driverPhone: r.driver_phone || undefined,
        paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : undefined,
        paymentRef: r.payment_ref || undefined,
        negotiationUsed: Boolean(r.negotiation_used),
        source: (r.source as 'web' | 'zalo') || 'web',
        shippingInfo: r.shipping_info,
      });
    }
    if (ordRes.rows.length > 0) {
      console.log(`[Database] Successfully restored ${ordRes.rows.length} shipping orders from PostgreSQL!`);
    }

    // 6. Restore DCE Ops, Default Supplier, Payment Bank & Asterisk ZNS Configuration from PostgreSQL
    try {
      const settingsRes = await databaseState.dbPool.query(`SELECT key, value FROM bot_settings WHERE key IN ('dce_ops_phone', 'dce_ops_user_id', 'default_supplier_name', 'default_supplier_phone', 'default_supplier_user_id', 'payment_bank_id', 'payment_account_no', 'payment_account_name', 'zalo_zns_template_id')`);
      const settingsMap = new Map<string, string>();
      for (const row of settingsRes.rows) {
        if (row.value) settingsMap.set(row.key, row.value);
      }

      if (settingsMap.get('dce_ops_phone')) supplierState.dceOpsPhone = settingsMap.get('dce_ops_phone')!;
      if (settingsMap.get('dce_ops_user_id')) supplierState.dceOpsUserId = settingsMap.get('dce_ops_user_id')!;
      if (settingsMap.get('default_supplier_name')) supplierState.defaultSupplierName = settingsMap.get('default_supplier_name')!;
      if (settingsMap.get('default_supplier_phone')) supplierState.defaultSupplierPhone = settingsMap.get('default_supplier_phone')!;
      if (settingsMap.get('default_supplier_user_id')) supplierState.defaultSupplierUserId = settingsMap.get('default_supplier_user_id')!;
      if (settingsMap.get('payment_bank_id')) paymentState.paymentBankId = settingsMap.get('payment_bank_id')!;
      if (settingsMap.get('payment_account_no')) paymentState.paymentAccountNo = settingsMap.get('payment_account_no')!;
      if (settingsMap.get('payment_account_name')) paymentState.paymentAccountName = settingsMap.get('payment_account_name')!;
      if (settingsMap.get('zalo_zns_template_id')) asteriskState.zaloZnsTemplateId = settingsMap.get('zalo_zns_template_id')!;

      const callRes = await databaseState.dbPool.query(`SELECT * FROM asterisk_call_logs ORDER BY created_at DESC LIMIT 50`);
      inMemoryCallLogs.length = 0;
      for (const r of callRes.rows) {
        inMemoryCallLogs.push({
          id: r.id,
          callerPhone: r.caller_phone,
          normalizedPhone: r.normalized_phone,
          uniqueId: r.unique_id || undefined,
          zaloUserId: r.zalo_user_id || undefined,
          channelUsed: r.channel_used,
          status: r.status,
          createdAt: r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '',
        });
      }

      if (!supplierState.dceOpsUserId && supplierState.dceOpsPhone) {
        const tailOps = supplierState.dceOpsPhone.replace(/\D/g, '').slice(-9);
        const phoneMatch = await databaseState.dbPool.query(`SELECT user_id FROM crm_customers WHERE phone LIKE $1 ORDER BY last_interaction DESC LIMIT 1`, [`%${tailOps}%`]);
        if (phoneMatch.rows.length > 0 && phoneMatch.rows[0].user_id) {
          supplierState.dceOpsUserId = phoneMatch.rows[0].user_id;
          console.log(`[Database] Auto-linked DCE Ops Zalo User ID from customer phone match: ${supplierState.dceOpsUserId}`);
        }
      }

      if (!supplierState.defaultSupplierUserId && supplierState.defaultSupplierPhone) {
        const tailSup = supplierState.defaultSupplierPhone.replace(/\D/g, '').slice(-9);
        const supMatch = await databaseState.dbPool.query(`SELECT user_id FROM crm_customers WHERE phone LIKE $1 ORDER BY last_interaction DESC LIMIT 1`, [`%${tailSup}%`]);
        if (supMatch.rows.length > 0 && supMatch.rows[0].user_id) {
          supplierState.defaultSupplierUserId = supMatch.rows[0].user_id;
          console.log(`[Database] Auto-linked Default Supplier Zalo User ID from customer phone match: ${supplierState.defaultSupplierUserId}`);
        }
      }

      console.log(`[Database] Routing Config: Ops=${supplierState.dceOpsPhone} (linked=${!!supplierState.dceOpsUserId}), Supplier=${supplierState.defaultSupplierName} (${supplierState.defaultSupplierPhone}, linked=${!!supplierState.defaultSupplierUserId})`);
    } catch (e: any) {
      console.warn('[Database] Could not restore DCE Ops & Supplier settings:', e?.message);
    }

    // 7. Seed & Restore Standard Price Routes (Pricing Engine)
    try {
      const routeRes = await databaseState.dbPool.query(`SELECT * FROM standard_price_routes ORDER BY route_code ASC`);
      if (routeRes.rows.length === 0) {
        for (const r of DEFAULT_STANDARD_ROUTES) {
          await databaseState.dbPool.query(
            `INSERT INTO standard_price_routes (id, route_code, name, origin_province, destination_province, service_code, service_name, estimated_transit_time, margin_percent, tiers, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (route_code) DO NOTHING;`,
            [r.id, r.routeCode, r.name, r.originProvince, r.destinationProvince, r.serviceCode, r.serviceName, r.estimatedTransitTime, r.marginPercent, JSON.stringify(r.tiers), r.isActive]
          );
        }
        pricingState.activeStandardRoutes = [...DEFAULT_STANDARD_ROUTES];
        console.log(`[Database] Seeded ${DEFAULT_STANDARD_ROUTES.length} default standard price routes into PostgreSQL.`);
      } else {
        pricingState.activeStandardRoutes = routeRes.rows.map((row: any) => ({
          id: row.id,
          routeCode: row.route_code,
          name: row.name,
          originProvince: row.origin_province,
          destinationProvince: row.destination_province,
          serviceCode: row.service_code,
          serviceName: row.service_name,
          estimatedTransitTime: row.estimated_transit_time,
          marginPercent: Number(row.margin_percent || 30),
          tiers: row.tiers,
          isActive: Boolean(row.is_active),
        }));
        console.log(`[Database] Loaded ${pricingState.activeStandardRoutes.length} standard price routes from PostgreSQL.`);
      }
    } catch (e: any) {
      console.warn('[Database] Could not restore standard price routes:', e?.message);
    }
  } catch (e: any) {
    throw new Error('Database initialization failed: ' + e?.message);
  }
}
