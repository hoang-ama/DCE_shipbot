import { AppState, OrderFormData, StateInfo } from '../../chatbot/playground/types';

export const INITIAL_FORM_DATA: OrderFormData = {
  dia_chi_lay_hang: null,
  dia_chi_giao_hang: null,
  thong_tin_hang: null,
  thoi_gian_giao_nhan: null,
  thong_tin_bo_sung: '',
  sdt_nguoi_nhan: null,
  sdt_nguoi_gui: null,
  ben_thanh_toan: null,
  thoi_diem_thanh_toan: null,
  sdt_tai_xe: null,
  missing_fields: ['Địa chỉ lấy hàng', 'Địa chỉ giao hàng', 'Thông tin hàng', 'Thời gian giao nhận'],
  is_form_complete: false,
};

export const SAMPLE_COMPLETED_FORM: OrderFormData = {
  dia_chi_lay_hang: 'Khu vực Phường 14, Quận Bình Thạnh, TP. Hồ Chí Minh',
  dia_chi_giao_hang: 'Khu vực Phường Quan Hoa, Quận Cầu Giấy, Hà Nội',
  thong_tin_hang: 'Hoa quả, 5 kg',
  thoi_gian_giao_nhan: 'Trong ngày',
  thong_tin_bo_sung: '',
  sdt_nguoi_nhan: null,
  sdt_nguoi_gui: null,
  ben_thanh_toan: null,
  thoi_diem_thanh_toan: null,
  sdt_tai_xe: null,
  missing_fields: [],
  is_form_complete: true,
};

export function formatOrderFormText(form: OrderFormData, includeAskQuote = true): string {
  const lines = [
    `1) Địa chỉ lấy hàng: ${form.dia_chi_lay_hang || ''}`,
    `2) Địa chỉ giao hàng: ${form.dia_chi_giao_hang || ''}`,
    `3) Thông tin hàng: ${form.thong_tin_hang || ''}`,
    `4) Thời gian giao nhận: ${form.thoi_gian_giao_nhan || ''}`,
  ];
  if (form.thong_tin_bo_sung) {
    lines.push(`5) Thông tin bổ sung: ${form.thong_tin_bo_sung}`);
  }
  if (includeAskQuote) {
    lines.push('', 'Anh/chị báo giá giúp em.');
  }
  return lines.join('\n');
}

export const STATE_DETAILS: Record<AppState, StateInfo> = {
  COLLECTING_INFO: {
    state: 'COLLECTING_INFO',
    title: 'COLLECTING_INFO',
    description: 'Tiếp nhận hoặc kiểm tra 4 trường thông tin đơn hàng từ Khách hàng.',
    color: '#3b82f6',
    bgLight: 'bg-blue-50 dark:bg-blue-950/40',
    borderColor: 'border-blue-300 dark:border-blue-700',
    textColor: 'text-blue-700 dark:text-blue-300',
    activeChat: 1,
  },
  WAITING_DCE: {
    state: 'WAITING_DCE',
    title: 'WAITING_DCE',
    description: 'Đã copy Form sang Đội xe DCE kèm câu hỏi "Anh/chị báo giá giúp em." — Chờ DCE phản hồi.',
    color: '#f59e0b',
    bgLight: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-300 dark:border-amber-700',
    textColor: 'text-amber-800 dark:text-amber-300',
    activeChat: 2,
  },
  CLARIFYING_FOR_DCE: {
    state: 'CLARIFYING_FOR_DCE',
    title: 'CLARIFYING_FOR_DCE',
    description: 'DCE cần làm rõ thêm thông tin. AI đã dịch câu hỏi sang ngôn ngữ lịch sự để hỏi Khách hàng.',
    color: '#8b5cf6',
    bgLight: 'bg-purple-50 dark:bg-purple-950/40',
    borderColor: 'border-purple-300 dark:border-purple-700',
    textColor: 'text-purple-700 dark:text-purple-300',
    activeChat: 1,
  },
  WAITING_CSDT: {
    state: 'WAITING_CSDT',
    title: 'WAITING_CSDT',
    description: 'DCE từ chối ("Không"). Đã copy toàn bộ Form sang CSĐT kèm "Anh/chị báo giá giúp em." — Chờ CSĐT phản hồi.',
    color: '#f97316',
    bgLight: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-300 dark:border-orange-700',
    textColor: 'text-orange-800 dark:text-orange-300',
    activeChat: 3,
  },
  CLARIFYING_FOR_CSDT: {
    state: 'CLARIFYING_FOR_CSDT',
    title: 'CLARIFYING_FOR_CSDT',
    description: 'CSĐT cần thêm thông tin. AI đã dịch câu hỏi sang cho Khách hàng. Chờ Khách phản hồi.',
    color: '#ec4899',
    bgLight: 'bg-pink-50 dark:bg-pink-950/40',
    borderColor: 'border-pink-300 dark:border-pink-700',
    textColor: 'text-pink-700 dark:text-pink-300',
    activeChat: 1,
  },
  QUOTED_WAITING_CUSTOMER: {
    state: 'QUOTED_WAITING_CUSTOMER',
    title: 'QUOTED_WAITING_CUSTOMER',
    description: 'Đã gửi báo giá cho Khách hàng. Chờ Khách chốt đơn, từ chối hoặc hỏi thêm thông tin.',
    color: '#0ea5e9',
    bgLight: 'bg-sky-50 dark:bg-sky-950/40',
    borderColor: 'border-sky-300 dark:border-sky-700',
    textColor: 'text-sky-700 dark:text-sky-300',
    activeChat: 1,
  },
  COLLECTING_RECIPIENT_PHONE: {
    state: 'COLLECTING_RECIPIENT_PHONE',
    title: 'COLLECTING_RECIPIENT_PHONE',
    description: 'Khách đã chốt đơn. AI đang hỏi xin số điện thoại người nhận hàng.',
    color: '#06b6d4',
    bgLight: 'bg-cyan-50 dark:bg-cyan-950/40',
    borderColor: 'border-cyan-300 dark:border-cyan-700',
    textColor: 'text-cyan-700 dark:text-cyan-300',
    activeChat: 1,
  },
  COLLECTING_SENDER_PHONE: {
    state: 'COLLECTING_SENDER_PHONE',
    title: 'COLLECTING_SENDER_PHONE',
    description: 'Đã có SĐT người nhận. AI đang hỏi xin số điện thoại người gửi hàng.',
    color: '#14b8a6',
    bgLight: 'bg-teal-50 dark:bg-teal-950/40',
    borderColor: 'border-teal-300 dark:border-teal-700',
    textColor: 'text-teal-700 dark:text-teal-300',
    activeChat: 1,
  },
  COLLECTING_PAYMENT_PARTY: {
    state: 'COLLECTING_PAYMENT_PARTY',
    title: 'COLLECTING_PAYMENT_PARTY',
    description: 'Đã chuyển 2 SĐT sang đối tác. AI đang hỏi bên nào thanh toán tiền cước (người gửi hay người nhận).',
    color: '#6366f1',
    bgLight: 'bg-indigo-50 dark:bg-indigo-950/40',
    borderColor: 'border-indigo-300 dark:border-indigo-700',
    textColor: 'text-indigo-700 dark:text-indigo-300',
    activeChat: 1,
  },
  COLLECTING_PAYMENT_TIME: {
    state: 'COLLECTING_PAYMENT_TIME',
    title: 'COLLECTING_PAYMENT_TIME',
    description: 'Đã chuyển bên thanh toán cước sang đối tác. AI đang hỏi thời điểm thanh toán (lúc gửi hàng hay sau khi nhận hàng).',
    color: '#8b5cf6',
    bgLight: 'bg-violet-50 dark:bg-violet-950/40',
    borderColor: 'border-violet-300 dark:border-violet-700',
    textColor: 'text-violet-700 dark:text-violet-300',
    activeChat: 1,
  },
  WAITING_DRIVER_PHONE_DCE: {
    state: 'WAITING_DRIVER_PHONE_DCE',
    title: 'WAITING_DRIVER_PHONE_DCE',
    description: 'Đã chuyển đủ 3 thông tin (SĐT, bên thanh toán, thời điểm thanh toán) sang DCE. Đang chờ DCE cung cấp SĐT tài xế.',
    color: '#f59e0b',
    bgLight: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-300 dark:border-amber-700',
    textColor: 'text-amber-800 dark:text-amber-300',
    activeChat: 2,
  },
  WAITING_DRIVER_PHONE_CSDT: {
    state: 'WAITING_DRIVER_PHONE_CSDT',
    title: 'WAITING_DRIVER_PHONE_CSDT',
    description: 'Đã chuyển đủ 3 thông tin (SĐT, bên thanh toán, thời điểm thanh toán) sang CSĐT. Đang chờ CSĐT cung cấp SĐT tài xế.',
    color: '#f97316',
    bgLight: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-300 dark:border-orange-700',
    textColor: 'text-orange-800 dark:text-orange-300',
    activeChat: 3,
  },
  CUSTOMER_DECLINED: {
    state: 'CUSTOMER_DECLINED',
    title: 'CUSTOMER_DECLINED',
    description: 'Khách hàng từ chối báo giá. AI đã phản hồi: "Dạ anh/chị cần em hỗ trợ gì thêm thì cứ nhắn em ạ."',
    color: '#64748b',
    bgLight: 'bg-slate-100 dark:bg-slate-900/60',
    borderColor: 'border-slate-300 dark:border-slate-700',
    textColor: 'text-slate-700 dark:text-slate-300',
    activeChat: null,
  },
  COMPLETED: {
    state: 'COMPLETED',
    title: 'COMPLETED',
    description: 'Đã chuyển đủ SĐT, bên & thời điểm thanh toán sang đối tác và gửi SĐT tài xế cho Khách hàng!',
    color: '#10b981',
    bgLight: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    activeChat: null,
  },
  REJECTED: {
    state: 'REJECTED',
    title: 'REJECTED',
    description: 'Cả DCE và CSĐT đều từ chối nhận vận chuyển. AI đã báo Khách: "Tuyến này bên em không hỗ trợ".',
    color: '#ef4444',
    bgLight: 'bg-rose-50 dark:bg-rose-950/40',
    borderColor: 'border-rose-300 dark:border-rose-700',
    textColor: 'text-rose-700 dark:text-rose-300',
    activeChat: null,
  },
};

export const RAW_MERMAID_DIAGRAM = `stateDiagram-v2
    [*] --> COLLECTING_INFO: Form được tiếp nhận

    state COLLECTING_INFO {
        [*] --> AI1_AskCustomer: Thiếu trường trong Form
        AI1_AskCustomer --> AI1_ValidateForm: Khách trả lời
        AI1_ValidateForm --> AI1_AskCustomer: is_form_complete == false
    }

    COLLECTING_INFO --> WAITING_DCE: is_form_complete == true\\n[Copy Form + "Anh/chị báo giá giúp em" sang Chat 2 (DCE)]

    state WAITING_DCE {
        [*] --> DCE_Reply: Chờ nhân viên DCE phản hồi
        DCE_Reply --> AI2_AnalyzeDCE: Phân tích Intent của DCE
    }

    AI2_AnalyzeDCE --> QUOTED_WAITING_CUSTOMER: intent == "QUOTE"\\n[AI dịch báo giá -> Gửi Khách]
    AI2_AnalyzeDCE --> CLARIFYING_FOR_DCE: intent == "NEED_MORE_INFO"\\n[AI dịch câu hỏi -> Hỏi Khách]

    state CLARIFYING_FOR_DCE {
        [*] --> Customer_Reply_DCE: Chờ Khách trả lời bổ sung
        Customer_Reply_DCE --> AI1_TranslateToDCE: AI dịch & chuyển sang Chat 2
    }
    CLARIFYING_FOR_DCE --> WAITING_DCE: Chờ DCE phản hồi

    AI2_AnalyzeDCE --> WAITING_CSDT: intent == "REJECT" (DCE trả lời "Không")\\n[Copy Form & info bổ sung sang Chat 3 (CSĐT)]

    state WAITING_CSDT {
        [*] --> CSDT_Reply: Chờ nhân viên CSĐT phản hồi
        CSDT_Reply --> AI2_AnalyzeCSDT: Phân tích Intent của CSĐT
    }

    AI2_AnalyzeCSDT --> QUOTED_WAITING_CUSTOMER: intent == "QUOTE"\\n[AI dịch báo giá -> Gửi Khách]
    AI2_AnalyzeCSDT --> CLARIFYING_FOR_CSDT: intent == "NEED_MORE_INFO"\\n[AI dịch câu hỏi -> Hỏi Khách]

    state CLARIFYING_FOR_CSDT {
        [*] --> Customer_Reply_CSDT: Chờ Khách trả lời bổ sung
        Customer_Reply_CSDT --> AI1_TranslateToCSDT: AI dịch & chuyển sang Chat 3
    }
    CLARIFYING_FOR_CSDT --> WAITING_CSDT: Chờ CSĐT phản hồi

    AI2_AnalyzeCSDT --> REJECTED: intent == "REJECT" (CSĐT trả lời "Không")\\n[AI báo Khách: "Tuyến này bên em không hỗ trợ"]

    state QUOTED_WAITING_CUSTOMER {
        [*] --> Customer_Decision: Chờ Khách phản hồi báo giá
    }

    QUOTED_WAITING_CUSTOMER --> COLLECTING_RECIPIENT_PHONE: Khách đồng ý\\n[Báo đối tác chốt & hỏi SĐT người nhận]
    COLLECTING_RECIPIENT_PHONE --> COLLECTING_SENDER_PHONE: Khách cung cấp SĐT người nhận\\n[Hỏi SĐT người gửi]
    COLLECTING_SENDER_PHONE --> COLLECTING_PAYMENT_PARTY: Khách cung cấp SĐT người gửi\\n[Forward 2 SĐT & hỏi bên thanh toán cước]
    COLLECTING_PAYMENT_PARTY --> COLLECTING_PAYMENT_TIME: Khách chọn người gửi / người nhận\\n[Forward bên thanh toán & hỏi thời điểm TT]
    COLLECTING_PAYMENT_TIME --> WAITING_DRIVER_PHONE_DCE: Đơn DCE - Khách chọn thời điểm TT\\n[Forward thời điểm TT & hỏi SĐT tài xế DCE]
    COLLECTING_PAYMENT_TIME --> WAITING_DRIVER_PHONE_CSDT: Đơn CSĐT - Khách chọn thời điểm TT\\n[Forward thời điểm TT & hỏi SĐT tài xế CSĐT]
    WAITING_DRIVER_PHONE_DCE --> COMPLETED: DCE cung cấp SĐT tài xế\\n[Forward SĐT tài xế sang Khách]
    WAITING_DRIVER_PHONE_CSDT --> COMPLETED: CSĐT cung cấp SĐT tài xế\\n[Forward SĐT tài xế sang Khách]

    QUOTED_WAITING_CUSTOMER --> CUSTOMER_DECLINED: Khách từ chối\\n[Rep Khách: "Dạ anh/chị cần em hỗ trợ gì thêm thì cứ nhắn em ạ."]
    QUOTED_WAITING_CUSTOMER --> WAITING_DCE: Khách hỏi thêm (đơn DCE)\\n[Forward câu hỏi sang Chat 2]
    QUOTED_WAITING_CUSTOMER --> WAITING_CSDT: Khách hỏi thêm (đơn CSĐT)\\n[Forward câu hỏi sang Chat 3]

    COMPLETED --> [*]
    CUSTOMER_DECLINED --> [*]
    REJECTED --> [*]`;
