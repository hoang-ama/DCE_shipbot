import type { FieldDefinition } from '../../types';
import { CUSTOMER_FIELDS } from '../../shared/fields';
export const RENTAL_FIELDS: FieldDefinition[] = [
  ...CUSTOMER_FIELDS,
  { key: 'pickupAddress', label: 'Điểm đón', required: true, question: 'Anh/chị muốn đón xe tại đâu ạ?' },
  { key: 'destinationAddress', label: 'Điểm đến chính', required: true, question: 'Điểm đến chính của chuyến đi là đâu ạ?' },
  { key: 'itinerary', label: 'Lịch trình', required: true, question: 'Anh/chị dự kiến đi những địa điểm nào ạ?' },
  { key: 'startsAt', label: 'Thời gian bắt đầu', required: true, question: 'Anh/chị muốn bắt đầu thuê xe lúc nào?' },
  { key: 'endsAt', label: 'Thời gian kết thúc', required: true, question: 'Anh/chị dự kiến kết thúc hoặc trả xe lúc nào?' },
  { key: 'driverOption', label: 'Tùy chọn tài xế', required: true, question: 'Anh/chị muốn thuê xe có tài xế hay tự lái?' },
  { key: 'passengerCount', label: 'Số hành khách', required: true, question: 'Đoàn mình có bao nhiêu người ạ?' },
];
