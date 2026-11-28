CREATE TABLE IF NOT EXISTS zalo_auth (
        id VARCHAR(50) PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS zalo_sessions (
        user_id VARCHAR(100) PRIMARY KEY,
        session_data JSONB NOT NULL,
        last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS crm_customers (
        user_id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        avatar TEXT,
        order_count INT DEFAULT 0,
        first_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_message TEXT,
        shipping_info JSONB
      );
      CREATE TABLE IF NOT EXISTS crm_messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        sender VARCHAR(20) NOT NULL,
        sender_name VARCHAR(255),
        message_text TEXT NOT NULL,
        shipping_info_snapshot JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipping_orders (
        id VARCHAR(100) PRIMARY KEY,
        tracking_code VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'created',
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        source VARCHAR(50) DEFAULT 'web',
        shipping_info JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bot_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS standard_price_routes (
        id VARCHAR(100) PRIMARY KEY,
        route_code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        origin_province VARCHAR(100) NOT NULL,
        destination_province VARCHAR(100) NOT NULL,
        service_code VARCHAR(50) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        estimated_transit_time VARCHAR(100) NOT NULL,
        margin_percent NUMERIC DEFAULT 30,
        tiers JSONB NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS ops_notified BOOLEAN DEFAULT FALSE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS ops_notified_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS zalo_user_id VARCHAR(100);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS base_cost_vnd NUMERIC;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS customer_quote_vnd NUMERIC;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS quoted_by VARCHAR(100);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS quote_note TEXT;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid';
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(150);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS negotiation_used BOOLEAN DEFAULT FALSE;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS chat_session_id VARCHAR(50);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS workflow_state VARCHAR(50);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS assigned_partner VARCHAR(20);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS additional_info TEXT;
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_party VARCHAR(80);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS payment_timing VARCHAR(80);
      ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50);
      ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT FALSE;
      ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS current_session_id VARCHAR(50);
      ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS session_id VARCHAR(50);
      ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS ai_trace JSONB;
      CREATE TABLE IF NOT EXISTS order_dispatch_threads (
        id VARCHAR(120) PRIMARY KEY,
        tracking_code VARCHAR(50) NOT NULL,
        partner_role VARCHAR(20) NOT NULL,
        partner_user_id VARCHAR(100) NOT NULL,
        zalo_msg_id VARCHAR(120),
        expected_state VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS asterisk_call_logs (
        id VARCHAR(100) PRIMARY KEY,
        caller_phone VARCHAR(50) NOT NULL,
        normalized_phone VARCHAR(50) NOT NULL,
        unique_id VARCHAR(100),
        zalo_user_id VARCHAR(100),
        channel_used VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_messages_user_id ON crm_messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_crm_messages_session_id ON crm_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_threads_msg ON order_dispatch_threads(zalo_msg_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_threads_tracking ON order_dispatch_threads(tracking_code);
      CREATE INDEX IF NOT EXISTS idx_crm_customers_last_interaction ON crm_customers(last_interaction DESC);
      CREATE INDEX IF NOT EXISTS idx_shipping_orders_created_at ON shipping_orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_asterisk_calls_created_at ON asterisk_call_logs(created_at DESC);
