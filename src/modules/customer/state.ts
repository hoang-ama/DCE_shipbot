

export interface CrmCustomer {
  user_id: string;
  name: string;
  phone: string;
  address: string;
  avatar: string;
  order_count: number;
  first_interaction: string;
  last_interaction: string;
  last_message: string;
  human_takeover?: boolean;
  current_session_id?: string;
  session_started_at?: string;
  shipping_info: any;
}

export interface CrmMessage {
  id: number | string;
  user_id: string;
  session_id?: string;
  sender: 'user' | 'bot' | 'agent';
  sender_name: string;
  message_text: string;
  shipping_info_snapshot?: any;
  created_at: string;
}

export const inMemoryCustomers = new Map<string, CrmCustomer>();

export const inMemoryMessages: CrmMessage[] = [];
