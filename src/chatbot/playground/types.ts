export type AppState =
  | 'COLLECTING_INFO'
  | 'WAITING_DCE'
  | 'CLARIFYING_FOR_DCE'
  | 'WAITING_CSDT'
  | 'CLARIFYING_FOR_CSDT'
  | 'QUOTED_WAITING_CUSTOMER'
  | 'COLLECTING_RECIPIENT_PHONE'
  | 'COLLECTING_SENDER_PHONE'
  | 'COLLECTING_PAYMENT_PARTY'
  | 'COLLECTING_PAYMENT_TIME'
  | 'WAITING_DRIVER_PHONE_DCE'
  | 'WAITING_DRIVER_PHONE_CSDT'
  | 'CUSTOMER_DECLINED'
  | 'COMPLETED'
  | 'REJECTED';

export interface OrderFormData {
  dia_chi_lay_hang: string | null;
  dia_chi_giao_hang: string | null;
  thong_tin_hang: string | null;
  thoi_gian_giao_nhan: string | null;
  thong_tin_bo_sung: string;
  sdt_nguoi_nhan?: string | null;
  sdt_nguoi_gui?: string | null;
  ben_thanh_toan?: string | null;
  thoi_diem_thanh_toan?: string | null;
  sdt_tai_xe?: string | null;
  missing_fields: string[];
  is_form_complete: boolean;
}

export type SenderRole = 'customer' | 'ai' | 'dce' | 'csdt' | 'system';

export interface ChatMessage {
  id: string;
  chatId: 1 | 2 | 3;
  sender: SenderRole;
  senderName: string;
  content: string;
  originalContent?: string;
  translatedContent?: string;
  imageUrl?: string;
  imageName?: string;
  audioUrl?: string;
  audioTranscript?: string;
  timestamp: string;
  badge?: string;
  isStructuredCard?: boolean;
  cardData?: {
    title: string;
    fields?: { label: string; value: string }[];
    actionPrompt?: string;
    intentBadge?: 'QUOTE' | 'NEED_MORE_INFO' | 'REJECT';
  };
}

export interface StateInfo {
  state: AppState;
  title: string;
  description: string;
  color: string;
  bgLight: string;
  borderColor: string;
  textColor: string;
  activeChat: 1 | 2 | 3 | null;
}
