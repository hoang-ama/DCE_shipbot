import type { FieldDefinition } from '../types';

export const CUSTOMER_FIELDS: FieldDefinition[] = [
  { key: 'customer.name', label: 'Customer name', required: true, question: 'May I have your name for the booking?' },
  { key: 'customer.phone', label: 'Contact phone', required: true, question: 'What phone number should we use to contact you?' },
];
