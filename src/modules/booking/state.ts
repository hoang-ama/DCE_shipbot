

export interface OrderRecordDB {
  id: string;
  trackingCode: string;
  createdAt: string;
  status: string;
  workflowState?: string;
  assignedPartner?: 'DCE' | 'CSDT' | null;
  customerName?: string;
  customerPhone?: string;
  zaloUserId?: string;
  chatSessionId?: string;
  estimatedPrice?: number;
  baseCostVnd?: number;
  quotedBy?: string;
  quotedAt?: string;
  quoteNote?: string;
  paymentMethod?: 'vietqr' | 'cod';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'cod_pending';
  paymentParty?: string;
  paymentTiming?: string;
  driverPhone?: string;
  paidAt?: string;
  paymentRef?: string;
  negotiationUsed?: boolean;
  source: 'web' | 'zalo';
  shippingInfo: any;
}

export const inMemoryOrders: OrderRecordDB[] = [];
