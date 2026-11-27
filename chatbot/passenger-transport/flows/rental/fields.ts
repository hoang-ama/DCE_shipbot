import type { FieldDefinition } from '../../types';
import { CUSTOMER_FIELDS } from '../../shared/fields';

export const RENTAL_FIELDS: FieldDefinition[] = [
  ...CUSTOMER_FIELDS,
  { key: 'pickupAddress', label: 'Pickup address', required: true, question: 'Where should the vehicle pick you up?' },
  { key: 'destinationAddress', label: 'Main destination', required: true, question: 'Where will the trip end?' },
  { key: 'itinerary', label: 'Itinerary', required: true, question: 'What destinations or route should the rental cover?' },
  { key: 'startsAt', label: 'Rental start', required: true, question: 'When should the rental start?' },
  { key: 'endsAt', label: 'Rental end', required: true, question: 'When should the rental end?' },
  { key: 'driverOption', label: 'Driver option', required: true, question: 'Would you like to drive yourself or have a driver?' },
  { key: 'passengerCount', label: 'Passenger count', required: true, question: 'How many passengers will travel?' },
  { key: 'notes', label: 'Additional requests', required: false, question: 'Do you have any other requirements?' },
];
