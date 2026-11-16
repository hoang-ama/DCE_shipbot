import { ShippingInfo } from '../types';

export interface StandardPriceTier {
  maxWeightKg: number | null; // null = không giới hạn (mức vượt)
  baseCostVnd: number; // Giá gốc chưa có margin
  extraPerKgCostVnd?: number; // Giá gốc cho mỗi kg vượt ngưỡng trước đó
  thresholdWeightKg?: number; // Ngưỡng bắt đầu tính vượt kg
}

export interface StandardPriceRoute {
  id: string;
  routeCode: string;
  name: string;
  originProvince: string;
  destinationProvince: string;
  serviceCode: 'road_economy' | 'air_express' | 'inner_city';
  serviceName: string;
  estimatedTransitTime: string;
  marginPercent: number;
  tiers: StandardPriceTier[];
  isActive: boolean;
}

export interface SurchargeItem {
  code: string;
  label: string;
  amountVnd: number;
}

export interface ServiceQuote {
  routeCode: string;
  serviceCode: 'road_economy' | 'air_express' | 'inner_city';
  serviceName: string;
  estimatedTransitTime: string;
  baseCostVnd: number;
  marginPercent: number;
  marginAmountVnd: number;
  surchargesTotalVnd: number;
  customerQuoteVnd: number;
  negotiatedQuote10PercentOffVnd: number;
  chargeableWeightKg: number;
}

export interface PricingCalculationResult {
  hasStandardPrice: boolean;
  senderProvince: string;
  receiverProvince: string;
  actualWeightKg: number;
  volumetricWeightRoadKg: number;
  volumetricWeightAirKg: number;
  surcharges: SurchargeItem[];
  recommendedServices: ServiceQuote[];
  reason?: string;
}

export const DEFAULT_STANDARD_ROUTES: StandardPriceRoute[] = [
  {
    id: 'route-hn-qn-road',
    routeCode: 'HN-QN-ROAD',
    name: 'Hà Nội ↔ Quảng Ninh (Đường bộ Siêu tốc)',
    originProvince: 'Hà Nội',
    destinationProvince: 'Quảng Ninh',
    serviceCode: 'road_economy',
    serviceName: 'Chuyển phát Siêu tốc Đường bộ',
    estimatedTransitTime: '4 - 6 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 5, baseCostVnd: 150000 },
      { maxWeightKg: 15, baseCostVnd: 200000 },
      { maxWeightKg: 30, baseCostVnd: 250000 },
      { maxWeightKg: null, baseCostVnd: 250000, thresholdWeightKg: 30, extraPerKgCostVnd: 8000 },
    ],
  },
  {
    id: 'route-hn-hp-road',
    routeCode: 'HN-HP-ROAD',
    name: 'Hà Nội ↔ Hải Phòng (Cao tốc 5B)',
    originProvince: 'Hà Nội',
    destinationProvince: 'Hải Phòng',
    serviceCode: 'road_economy',
    serviceName: 'Siêu tốc Cao tốc 5B',
    estimatedTransitTime: '2 - 4 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 5, baseCostVnd: 120000 },
      { maxWeightKg: 15, baseCostVnd: 160000 },
      { maxWeightKg: 30, baseCostVnd: 200000 },
      { maxWeightKg: null, baseCostVnd: 200000, thresholdWeightKg: 30, extraPerKgCostVnd: 7000 },
    ],
  },
  {
    id: 'route-hn-nb-road',
    routeCode: 'HN-NB-ROAD',
    name: 'Hà Nội ↔ Ninh Bình',
    originProvince: 'Hà Nội',
    destinationProvince: 'Ninh Bình',
    serviceCode: 'road_economy',
    serviceName: 'Chuyển phát Nhanh Đường bộ',
    estimatedTransitTime: '2 - 4 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 5, baseCostVnd: 100000 },
      { maxWeightKg: 15, baseCostVnd: 150000 },
      { maxWeightKg: 30, baseCostVnd: 220000 },
      { maxWeightKg: null, baseCostVnd: 220000, thresholdWeightKg: 30, extraPerKgCostVnd: 6000 },
    ],
  },
  {
    id: 'route-hn-nd-road',
    routeCode: 'HN-ND-ROAD',
    name: 'Hà Nội ↔ Nam Định',
    originProvince: 'Hà Nội',
    destinationProvince: 'Nam Định',
    serviceCode: 'road_economy',
    serviceName: 'Chuyển phát Nhanh Đường bộ',
    estimatedTransitTime: '2 - 4 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 5, baseCostVnd: 100000 },
      { maxWeightKg: 15, baseCostVnd: 150000 },
      { maxWeightKg: 30, baseCostVnd: 220000 },
      { maxWeightKg: null, baseCostVnd: 220000, thresholdWeightKg: 30, extraPerKgCostVnd: 6000 },
    ],
  },
  {
    id: 'route-hn-hna-road',
    routeCode: 'HN-HNA-ROAD',
    name: 'Hà Nội ↔ Hà Nam',
    originProvince: 'Hà Nội',
    destinationProvince: 'Hà Nam',
    serviceCode: 'road_economy',
    serviceName: 'Chuyển phát Nhanh Đường bộ',
    estimatedTransitTime: '2 - 4 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 5, baseCostVnd: 100000 },
      { maxWeightKg: 15, baseCostVnd: 150000 },
      { maxWeightKg: 30, baseCostVnd: 220000 },
      { maxWeightKg: null, baseCostVnd: 220000, thresholdWeightKg: 30, extraPerKgCostVnd: 6000 },
    ],
  },
  {
    id: 'route-hn-hcm-air',
    routeCode: 'HN-HCM-AIR',
    name: 'Hà Nội ↔ TP. Hồ Chí Minh (Hỏa tốc Hàng không)',
    originProvince: 'Hà Nội',
    destinationProvince: 'TP. Hồ Chí Minh',
    serviceCode: 'air_express',
    serviceName: 'Hỏa tốc Hàng không (Air Express)',
    estimatedTransitTime: '6 - 12 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 2, baseCostVnd: 350000 },
      { maxWeightKg: 10, baseCostVnd: 550000 },
      { maxWeightKg: null, baseCostVnd: 0, thresholdWeightKg: 0, extraPerKgCostVnd: 45000 },
    ],
  },
  {
    id: 'route-hn-hcm-road',
    routeCode: 'HN-HCM-ROAD',
    name: 'Hà Nội ↔ TP. Hồ Chí Minh (Đường bộ Tiết kiệm)',
    originProvince: 'Hà Nội',
    destinationProvince: 'TP. Hồ Chí Minh',
    serviceCode: 'road_economy',
    serviceName: 'Đường bộ Tiết kiệm (Road Cargo)',
    estimatedTransitTime: '48 - 60 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 5, baseCostVnd: 150000 },
      { maxWeightKg: 20, baseCostVnd: 280000 },
      { maxWeightKg: null, baseCostVnd: 280000, thresholdWeightKg: 20, extraPerKgCostVnd: 12000 },
    ],
  },
  {
    id: 'route-inner-hn',
    routeCode: 'INNER-HN',
    name: 'Nội thành Hà Nội (Giao trong ngày)',
    originProvince: 'Hà Nội',
    destinationProvince: 'Hà Nội',
    serviceCode: 'inner_city',
    serviceName: 'Nội thành Siêu tốc (4 - 6 giờ)',
    estimatedTransitTime: '4 - 6 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 10, baseCostVnd: 35000 },
      { maxWeightKg: 20, baseCostVnd: 55000 },
      { maxWeightKg: null, baseCostVnd: 55000, thresholdWeightKg: 20, extraPerKgCostVnd: 3000 },
    ],
  },
  {
    id: 'route-inner-hcm',
    routeCode: 'INNER-HCM',
    name: 'Nội thành TP. Hồ Chí Minh (Giao trong ngày)',
    originProvince: 'TP. Hồ Chí Minh',
    destinationProvince: 'TP. Hồ Chí Minh',
    serviceCode: 'inner_city',
    serviceName: 'Nội thành Siêu tốc (4 - 6 giờ)',
    estimatedTransitTime: '4 - 6 giờ',
    marginPercent: 30,
    isActive: true,
    tiers: [
      { maxWeightKg: 10, baseCostVnd: 35000 },
      { maxWeightKg: 20, baseCostVnd: 55000 },
      { maxWeightKg: null, baseCostVnd: 55000, thresholdWeightKg: 20, extraPerKgCostVnd: 3000 },
    ],
  },
];

const PROVINCE_ALIASES: Array<{ canonical: string; patterns: RegExp[] }> = [
  {
    canonical: 'Hà Nội',
    patterns: [
      /\b(?:hà\s*nội|ha\s*noi|hn)\b/i,
      /\b(?:hoàn\s*kiếm|ba\s*đình|đống\s*đa|hai\s*bà\s*trưng|cầu\s*giấy|thanh\s*xuân|tây\s*hồ|long\s*biên|hoàng\s*mai|hà\s*đông|nam\s*từ\s*liêm|bắc\s*từ\s*liêm|gia\s*lâm|đông\s*anh|sóc\s*sơn|thanh\s*trì|hoài\s*đức|thường\s*tín)\b/i,
    ],
  },
  {
    canonical: 'TP. Hồ Chí Minh',
    patterns: [
      /\b(?:hồ\s*chí\s*minh|ho\s*chi\s*minh|tp\.?\s*hcm|hcm|sài\s*gòn|sai\s*gon|sg)\b/i,
      /\b(?:quận\s*1|quận\s*3|quận\s*4|quận\s*5|quận\s*7|quận\s*10|bình\s*thạnh|tân\s*bình|phú\s*nhuận|gò\s*vấp|thủ\s*đức|bình\s*tân|tân\s*phú)\b/i,
    ],
  },
  {
    canonical: 'Quảng Ninh',
    patterns: [
      /\b(?:quảng\s*ninh|quang\s*ninh|qn|hạ\s*long|ha\s*long|cẩm\s*phả|cam\s*pha|uông\s*bí|uong\s*bi|đông\s*triều|móng\s*cái|đông\s*mai|vân\s*đồn)\b/i,
    ],
  },
  {
    canonical: 'Hải Phòng',
    patterns: [/\b(?:hải\s*phòng|hai\s*phong|hp|đồ\s*sơn|cát\s*bà|thủy\s*nguyên|an\s*dương|hồng\s*bàng|ngô\s*quyền|lê\s*chân)\b/i],
  },
  {
    canonical: 'Ninh Bình',
    patterns: [/\b(?:ninh\s*bình|ninh\s*binh|tam\s*điệp|tam\s*diep|hoa\s*lư|gia\s*viễn|kim\s*sơn)\b/i],
  },
  {
    canonical: 'Nam Định',
    patterns: [/\b(?:nam\s*định|nam\s*dinh)\b/i],
  },
  {
    canonical: 'Hà Nam',
    patterns: [/\b(?:hà\s*nam|ha\s*nam|phủ\s*lý|phu\s*ly|duy\s*tiên)\b/i],
  },
  {
    canonical: 'Đà Nẵng',
    patterns: [/\b(?:đà\s*nẵng|da\s*nang|đn|hải\s*châu|sơn\s*trà|ngũ\s*hành\s*sơn|liên\s*chiểu)\b/i],
  },
  {
    canonical: 'Bắc Ninh',
    patterns: [/\b(?:bắc\s*ninh|bac\s*ninh|từ\s*sơn|yên\s*phong|quế\s*võ)\b/i],
  },
  {
    canonical: 'Hải Dương',
    patterns: [/\b(?:hải\s*dương|hai\s*duong|chí\s*linh)\b/i],
  },
  {
    canonical: 'Thái Nguyên',
    patterns: [/\b(?:thái\s*nguyên|thai\s*nguyen|phổ\s*yên|sông\s*công)\b/i],
  },
  {
    canonical: 'Bình Dương',
    patterns: [/\b(?:bình\s*dương|binh\s*duong|thủ\s*dầu\s*một|dĩ\s*an|thuận\s*an)\b/i],
  },
  {
    canonical: 'Đồng Nai',
    patterns: [/\b(?:đồng\s*nai|dong\s*nai|biên\s*hòa|long\s*thành|nhơn\s*trạch)\b/i],
  },
];

export function extractProvinceFromAddress(address?: string | null): string {
  if (!address) return '';
  const clean = address.trim();
  for (const item of PROVINCE_ALIASES) {
    if (item.patterns.some((p) => p.test(clean))) {
      return item.canonical;
    }
  }
  // Fallback: lấy phần sau dấu phẩy cuối cùng nếu có dạng "... , Tỉnh X"
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 1].replace(/^(?:tỉnh|thành\s*phố|tp\.?)\s+/i, '').trim();
  }
  return '';
}

export function parseWeightKg(shippingInfo: Partial<ShippingInfo> | any): number {
  if (typeof shippingInfo?.cargo?.weightKg === 'number' && shippingInfo.cargo.weightKg > 0) {
    return shippingInfo.cargo.weightKg;
  }
  const weightStr = String(shippingInfo?.cargo?.weight || '').trim().toLowerCase();
  if (!weightStr) return 0;
  const match = weightStr.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gam|tấn|tan|tạ|yến)?/i);
  if (!match) return 0;
  const val = parseFloat(match[1].replace(',', '.'));
  const unit = match[2] || 'kg';
  if (unit === 'g' || unit === 'gam') return Math.max(0.1, val / 1000);
  if (unit === 'tấn' || unit === 'tan') return val * 1000;
  if (unit === 'tạ') return val * 100;
  if (unit === 'yến') return val * 10;
  return val;
}

export function parseDimensionsCm(shippingInfo: Partial<ShippingInfo> | any): { l: number; w: number; h: number } {
  const dims = shippingInfo?.cargo?.dimensions;
  if (dims?.length && dims?.width && dims?.height) {
    return { l: Number(dims.length), w: Number(dims.width), h: Number(dims.height) };
  }
  const raw = String(dims?.raw || '').trim();
  if (raw) {
    const nums = raw.match(/\d+(?:[.,]\d+)?/g);
    if (nums && nums.length >= 3) {
      return {
        l: parseFloat(nums[0].replace(',', '.')),
        w: parseFloat(nums[1].replace(',', '.')),
        h: parseFloat(nums[2].replace(',', '.')),
      };
    }
    if (nums && nums.length === 2) {
      // Nếu chỉ có 2 số (VD: 90x60 cm), tạm ước lượng chiều còn lại tối thiểu hoặc không quy đổi 3D
      return { l: 0, w: 0, h: 0 };
    }
  }
  return { l: 0, w: 0, h: 0 };
}

function roundToThousand(amount: number): number {
  return Math.round(amount / 1000) * 1000;
}

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}

function computeBaseCostFromTiers(tiers: StandardPriceTier[], chargeableWeightKg: number): number {
  const w = Math.max(0.5, chargeableWeightKg);
  const sorted = [...tiers].sort((a, b) => {
    if (a.maxWeightKg === null) return 1;
    if (b.maxWeightKg === null) return -1;
    return a.maxWeightKg - b.maxWeightKg;
  });

  for (const tier of sorted) {
    if (tier.maxWeightKg !== null && w <= tier.maxWeightKg) {
      return tier.baseCostVnd;
    }
  }

  // Fallback vào tier vượt ngưỡng (maxWeightKg === null)
  const overflowTier = sorted.find((t) => t.maxWeightKg === null);
  if (overflowTier) {
    const threshold = overflowTier.thresholdWeightKg || 0;
    const extraKg = Math.max(0, Math.ceil(w - threshold));
    return overflowTier.baseCostVnd + extraKg * (overflowTier.extraPerKgCostVnd || 0);
  }

  return sorted[sorted.length - 1]?.baseCostVnd || 0;
}

export function calculateDCExpressPriceFromShippingInfo(
  shippingInfo: Partial<ShippingInfo> | any,
  customRoutes?: StandardPriceRoute[]
): PricingCalculationResult {
  const routes = (customRoutes && customRoutes.length > 0 ? customRoutes : DEFAULT_STANDARD_ROUTES).filter(
    (r) => r.isActive
  );

  const senderProvince = extractProvinceFromAddress(shippingInfo?.sender?.address);
  const receiverProvince = extractProvinceFromAddress(shippingInfo?.receiver?.address);

  const actualWeightKg = parseWeightKg(shippingInfo);
  const { l, w, h } = parseDimensionsCm(shippingInfo);

  const volumetricWeightRoadKg = l > 0 && w > 0 && h > 0 ? Math.round(((l * w * h) / 5000) * 10) / 10 : 0;
  const volumetricWeightAirKg = l > 0 && w > 0 && h > 0 ? Math.round(((l * w * h) / 6000) * 10) / 10 : 0;

  // Nhận diện phụ phí từ ghi chú hoặc thời gian
  const surcharges: SurchargeItem[] = [];
  const notesText = `${shippingInfo?.cargo?.specialNotes || ''} ${shippingInfo?.deliveryTime || ''}`.toLowerCase();

  if (/(?:ngõ\s*hẹp|hẻm|ngách|xe\s*không\s*vào|trung\s*chuyển)/i.test(notesText)) {
    surcharges.push({ code: 'narrow_alley', label: 'Phụ phí ngõ hẹp / trung chuyển (>200m)', amountVnd: 30000 });
  }
  if (actualWeightKg > 30 || /(?:bốc\s*xếp|bê\s*vác|lên\s*tầng|khiêng)/i.test(notesText)) {
    surcharges.push({ code: 'heavy_handling', label: 'Phụ phí bốc xếp hàng nặng (>30kg)', amountVnd: 50000 });
  }
  if (/(?:đúng\s*giờ|hẹn\s*giờ\s*chính\s*xác|\+\/-\s*15)/i.test(notesText)) {
    surcharges.push({ code: 'exact_time', label: 'Phụ phí hẹn giờ chính xác (+/- 15 phút)', amountVnd: 30000 });
  }

  const surchargesTotalVnd = surcharges.reduce((sum, s) => sum + s.amountVnd, 0);

  if (!senderProvince || !receiverProvince) {
    return {
      hasStandardPrice: false,
      senderProvince,
      receiverProvince,
      actualWeightKg,
      volumetricWeightRoadKg,
      volumetricWeightAirKg,
      surcharges,
      recommendedServices: [],
      reason: 'Chưa xác định được Tỉnh/Thành phố của điểm lấy hoặc điểm giao hàng.',
    };
  }

  // Tìm các tuyến khớp 2 chiều (A -> B hoặc B -> A)
  const matchedRoutes = routes.filter((r) => {
    const o = r.originProvince.toLowerCase();
    const d = r.destinationProvince.toLowerCase();
    const s = senderProvince.toLowerCase();
    const rv = receiverProvince.toLowerCase();
    return (o === s && d === rv) || (o === rv && d === s);
  });

  if (matchedRoutes.length === 0) {
    return {
      hasStandardPrice: false,
      senderProvince,
      receiverProvince,
      actualWeightKg,
      volumetricWeightRoadKg,
      volumetricWeightAirKg,
      surcharges,
      recommendedServices: [],
      reason: `Tuyến ${senderProvince} ↔ ${receiverProvince} chưa có trong Bảng giá chuẩn. Cần chuyển DCE Ops & Nhà cung cấp mặc định báo giá.`,
    };
  }

  if (actualWeightKg <= 0 && volumetricWeightRoadKg <= 0) {
    return {
      hasStandardPrice: false,
      senderProvince,
      receiverProvince,
      actualWeightKg,
      volumetricWeightRoadKg,
      volumetricWeightAirKg,
      surcharges,
      recommendedServices: [],
      reason: `Đã nhận diện tuyến ${senderProvince} ↔ ${receiverProvince}, cần bổ sung Khối lượng (kg) hoặc Kích thước 3 chiều để tính giá chuẩn.`,
    };
  }

  const recommendedServices: ServiceQuote[] = matchedRoutes.map((route) => {
    const isAir = route.serviceCode === 'air_express';
    const chargeableWeightKg = Math.max(
      actualWeightKg,
      isAir ? volumetricWeightAirKg : volumetricWeightRoadKg
    );

    const baseCostVnd = computeBaseCostFromTiers(route.tiers, chargeableWeightKg);
    const marginPercent = route.marginPercent ?? 30;
    const rawCustomerPrice = baseCostVnd * (1 + marginPercent / 100);
    const roundedBaseWithMargin = roundToThousand(rawCustomerPrice);
    const marginAmountVnd = roundedBaseWithMargin - baseCostVnd;
    const customerQuoteVnd = roundedBaseWithMargin + surchargesTotalVnd;
    const negotiatedQuote10PercentOffVnd = roundToThousand(customerQuoteVnd * 0.9);

    return {
      routeCode: route.routeCode,
      serviceCode: route.serviceCode,
      serviceName: route.serviceName,
      estimatedTransitTime: route.estimatedTransitTime,
      baseCostVnd,
      marginPercent,
      marginAmountVnd,
      surchargesTotalVnd,
      customerQuoteVnd,
      negotiatedQuote10PercentOffVnd,
      chargeableWeightKg,
    };
  });

  return {
    hasStandardPrice: true,
    senderProvince,
    receiverProvince,
    actualWeightKg,
    volumetricWeightRoadKg,
    volumetricWeightAirKg,
    surcharges,
    recommendedServices,
  };
}
