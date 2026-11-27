import type {MainVertical,SubVertical,ServiceDraft} from './service-menu';
export interface PersonInfo {
  name?: string;
  phone?: string;
  address: string;
  city?: string;
  hasWardCommune?: boolean;
  addressReady?: boolean; // specific enough to collect/quote, not a verified geocode
  rawAddress?: string;
  resolvedAddress?: string; // lookup or AI candidate, not authoritative
  addressResolution?: 'explicit' | 'legacy_lookup' | 'gemini_inferred' | 'specific' | 'incomplete';
}

export interface Dimensions {
  length: number | null;
  width: number | null;
  height: number | null;
  raw: string;
}

export interface CargoItem { name: string; weight: string; weightKg: number; category?: string }
export interface CargoInfo {
  items?: CargoItem[]; // multiple types in one shipment; aggregate fields stay compatible
  name: string;
  weight: string;
  weightKg: number | null;
  dimensions: Dimensions;
  category: string;
  specialNotes: string;
  declaredValue?: string;
}

export interface ShippingInfo {
  mainVertical?: MainVertical;
  subVertical?: SubVertical;
  serviceDraft?: ServiceDraft;
  sender: PersonInfo;
  receiver: PersonInfo;
  cargo: CargoInfo;
  deliveryTime: string; // Thời gian giao nhận (text)
  deliveryTimeDate?: string; // derived date for explicit relative-day expressions
  missingFields: string[];
  missingKeys: string[];
  nextMissingKey?: string;
  nextQuestion?: string;
  nextAction?: string;
  nextField?: string;
  completionRate: number;
  isComplete: boolean;
  isConfirmed?: boolean;
  pendingOperation?: 'ADD'; // draft change requiring clarification; not an additional shipment
  selectedService?: 'standard' | 'express' | 'economy';
}

export type AITraceSource = 'rule' | 'qwen' | 'gemini' | 'rule_fallback' | 'unknown' | 'error';
export type AITraceStep = {
  node: string;
  status: 'ok' | 'skip' | 'error' | 'info';
  reason?: string;
  elapsedMs?: number;
  detail?: Record<string, unknown>;
};
export interface AITrace {
  source: AITraceSource;
  reason: string;
  elapsedMs: number;
  steps: AITraceStep[];
}
export interface LegacyAITrace {
  source: AITraceSource;
  reason: string;
  steps: AITraceStep[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  timestamp: string;
  extractedSnippet?: string;
  aiTrace?: AITrace;
  replyToId?: string;
  quickReplies?: string[];
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
