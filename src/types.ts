export interface PersonInfo {
  name?: string;
  phone?: string;
  address: string;
  city?: string;
  hasWardCommune?: boolean;
}

export interface Dimensions {
  length: number | null;
  width: number | null;
  height: number | null;
  raw: string;
}

export interface CargoInfo {
  name: string;
  weight: string;
  weightKg: number | null;
  dimensions: Dimensions;
  category: string;
  specialNotes: string;
  declaredValue?: string;
}

export type BusinessFlow = 'chuyen_nguoi' | 'chuyen_hang' | 'du_lich';

export interface ShippingInfo {
  businessFlow?: BusinessFlow;
  sender: PersonInfo;
  receiver: PersonInfo;
  cargo: CargoInfo;
  deliveryTime: string; // Thời gian giao nhận (text)
  missingFields: string[];
  missingKeys: string[];
  nextMissingKey?: string;
  nextQuestion?: string;
  completionRate: number;
  isComplete: boolean;
  isConfirmed?: boolean;
  selectedService?: 'standard' | 'express' | 'economy';
}

export type AITraceStatus = 'ok' | 'skip' | 'error' | 'info';
export type AITraceSource = 'gemini' | 'rule' | 'rule_fallback' | 'error';
export interface AITraceStep {
  node: string;
  status: AITraceStatus;
  reason?: string;
  elapsedMs?: number;
  detail?: Record<string, unknown>;
}
export interface AITrace {
  source: AITraceSource;
  reason: string;
  elapsedMs: number;
  steps: AITraceStep[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  timestamp: string;
  extractedSnippet?: string;
  quickReplies?: string[];
  aiTrace?: AITrace;
  replyToId?: string;
}

export interface RoutingConfig {
  opsPhone: string;
  opsUserId?: string | null;
  isOpsLinked?: boolean;
  supplierName: string;
  supplierPhone: string;
  supplierUserId?: string | null;
  isSupplierLinked?: boolean;
}

export interface PaymentConfig {
  bankId: string;
  accountNo: string;
  accountName: string;
}

export interface OrderRecord {
  id: string;
  trackingCode: string;
  createdAt: string;
  status: 'created' | 'quoting' | 'quoted' | 'confirmed' | 'paid' | 'cod_pending' | 'dispatched' | 'picked_up' | 'delivering' | 'delivered';
  shippingInfo: ShippingInfo;
  estimatedPrice?: number;
  baseCostVnd?: number;
  quotedBy?: string;
  quotedAt?: string;
  quoteNote?: string;
  zaloUserId?: string;
  paymentMethod?: 'vietqr' | 'cod';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'cod_pending';
  paidAt?: string;
  paymentRef?: string;
  negotiationUsed?: boolean;
  serviceType?: string;
  source?: 'web' | 'zalo';
  customerName?: string;
  customerPhone?: string;
  opsNotified?: boolean;
  opsNotifiedAt?: string;
}
