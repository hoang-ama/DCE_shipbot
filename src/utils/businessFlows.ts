import type { BusinessFlow } from '../types';

export interface BusinessFlowOption {
  id: BusinessFlow;
  label: string;
  subServices: string[];
}

export const BUSINESS_FLOWS: BusinessFlowOption[] = [
  { id: 'chuyen_nguoi', label: 'Chuyển người', subServices: ['Đặt xe theo chuyến (ride)', 'Thuê xe theo lịch trình/ngày (rent)'] },
  { id: 'chuyen_hang', label: 'Chuyển hàng', subServices: ['Chuyển phát nhanh (express)', 'Thuê xe tải/chuyển hàng (truck)'] },
  { id: 'du_lich', label: 'Du lịch', subServices: ['Đặt tour/phòng khách sạn (tour)'] },
];

export const getBusinessFlowLabel = (id: BusinessFlow | null | undefined): string =>
  BUSINESS_FLOWS.find(flow => flow.id === id)?.label || '';
