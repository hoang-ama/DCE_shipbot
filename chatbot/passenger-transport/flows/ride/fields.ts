import type { FieldDefinition } from '../../types';
import { CUSTOMER_FIELDS } from '../../shared/fields';
export const RIDE_FIELDS: FieldDefinition[] = [
  ...CUSTOMER_FIELDS,
  { key: 'pickupAddress', label: 'Điểm đón', required: true, question: 'Tài xế đón anh/chị ở đâu ạ?' },
  { key: 'destinationAddress', label: 'Điểm đến', required: true, question: 'Anh/chị muốn đi đến đâu ạ?' },
  { key: 'pickupAt', label: 'Ngày giờ đón', required: true, question: 'Anh/chị cần xe vào ngày giờ nào ạ?' },
  { key: 'passengerCount', label: 'Số hành khách', required: true, question: 'Chuyến đi có bao nhiêu hành khách ạ?' },
  { key: 'isRoundTrip', label: 'Khứ hồi', required: false, question: 'Anh/chị có cần xe chiều về không ạ?' },
  { key: 'notes', label: 'Yêu cầu khác', required: false, question: 'Anh/chị có yêu cầu nào khác không ạ?' },
];
