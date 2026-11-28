import type { FieldDefinition } from '../types';
export const CUSTOMER_FIELDS: FieldDefinition[] = [
  { key: 'customer.name', label: 'Tên khách', required: true, question: 'Anh/chị cho em xin tên người đặt xe ạ?' },
  { key: 'customer.phone', label: 'Số điện thoại', required: true, question: 'Cho em xin số điện thoại liên hệ ạ?' },
];
