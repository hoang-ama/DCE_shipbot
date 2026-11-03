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

export interface ShippingInfo {
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

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  timestamp: string;
  extractedSnippet?: string;
  quickReplies?: string[];
}

export interface OrderRecord {
  id: string;
  trackingCode: string;
  createdAt: string;
  status: 'created' | 'picked_up' | 'delivering' | 'delivered';
  shippingInfo: ShippingInfo;
  estimatedPrice?: number;
  serviceType?: string;
}
