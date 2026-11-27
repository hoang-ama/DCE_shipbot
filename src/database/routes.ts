import express, { Request, Response } from 'express';
import { Router } from 'express';
import { databaseState } from './connection';
import { inMemoryCustomers, inMemoryMessages } from '../modules/customer/state';
import { zaloUserSessions } from '../modules/conversation/state';
import { inMemoryOrders } from '../modules/booking/state';

export const router = Router();

router.get('/api/db/overview', async (_req: Request, res: Response) => {
  if (!databaseState.dbPool) {
    return res.json({
      connected: false,
      message: 'Chưa cấu hình DATABASE_URL (Chưa kết nối PostgreSQL)',
      inMemoryStats: {
        customersCount: inMemoryCustomers.size,
        messagesCount: inMemoryMessages.length,
        sessionsCount: zaloUserSessions.size,
        ordersCount: inMemoryOrders.length,
      },
    });
  }

  try {
    const [authRes, custRes, msgRes, sessRes, ordRes] = await Promise.all([
      databaseState.dbPool.query(`SELECT id, SUBSTRING(access_token FROM 1 FOR 10) || '...' as access_token_masked, SUBSTRING(refresh_token FROM 1 FOR 10) || '...' as refresh_token_masked, updated_at FROM zalo_auth`),
      databaseState.dbPool.query(`SELECT COUNT(*) as count FROM crm_customers`),
      databaseState.dbPool.query(`SELECT COUNT(*) as count FROM crm_messages`),
      databaseState.dbPool.query(`SELECT COUNT(*) as count FROM zalo_sessions`),
      databaseState.dbPool.query(`SELECT COUNT(*) as count FROM shipping_orders`),
    ]);

    const recentCustomers = await databaseState.dbPool.query(`SELECT user_id, name, phone, last_interaction, last_message FROM crm_customers ORDER BY last_interaction DESC LIMIT 10`);
    const recentOrders = await databaseState.dbPool.query(`
      SELECT id, tracking_code, source, status, created_at, customer_name, customer_phone,
             shipping_info->'cargo'->>'name' as cargo_name,
             shipping_info->'sender'->>'address' as sender_addr,
             shipping_info->'receiver'->>'address' as receiver_addr
      FROM shipping_orders
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return res.json({
      connected: true,
      databaseType: 'Render PostgreSQL (shipbot-db)',
      tables: {
        zalo_auth: {
          description: 'Lưu trữ Access Token và Refresh Token Zalo OA vĩnh viễn',
          rowCount: authRes.rowCount,
          records: authRes.rows,
        },
        shipping_orders: {
          description: 'Lịch sử phiếu vận đơn khách hàng (Web & Zalo OA)',
          totalCount: parseInt(ordRes.rows[0]?.count || '0', 10),
          recentRecords: recentOrders.rows,
        },
        crm_customers: {
          description: 'Hồ sơ danh bạ khách hàng Zalo',
          totalCount: parseInt(custRes.rows[0]?.count || '0', 10),
          recentRecords: recentCustomers.rows,
        },
        crm_messages: {
          description: 'Toàn bộ lịch sử tin nhắn 2 chiều giữa khách và bot',
          totalCount: parseInt(msgRes.rows[0]?.count || '0', 10),
        },
        zalo_sessions: {
          description: 'Bộ nhớ ngữ cảnh phiên hội thoại (chống mất ngữ cảnh khi restart)',
          totalCount: parseInt(sessRes.rows[0]?.count || '0', 10),
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});
