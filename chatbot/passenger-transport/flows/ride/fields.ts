import type { FieldDefinition } from '../../types';
import { CUSTOMER_FIELDS } from '../../shared/fields';

export const RIDE_FIELDS: FieldDefinition[] = [
  ...CUSTOMER_FIELDS,
  { key: 'pickupAddress', label: 'Pickup address', required: true, question: 'Where should the driver pick you up?' },
  { key: 'destinationAddress', label: 'Destination', required: true, question: 'Where are you going?' },
  { key: 'pickupAt', label: 'Pickup date and time', required: true, question: 'What date and time do you need the ride?' },
  { key: 'passengerCount', label: 'Passenger count', required: true, question: 'How many passengers will travel?' },
  { key: 'isRoundTrip', label: 'Round trip', required: false, question: 'Do you need a return trip as well?' },
  { key: 'notes', label: 'Additional requests', required: false, question: 'Do you have any other requests for the driver?' },
];
