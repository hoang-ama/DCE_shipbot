import type { RentalBooking, ValidationResult } from '../../types';
import { RENTAL_FIELDS } from './fields';

export function validateRentalBooking(value: RentalBooking): ValidationResult<RentalBooking> {
  const missingFields = RENTAL_FIELDS.filter((field) => {
    if (!field.required) return false;
    const fieldValue = field.key.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
    if (field.key === 'itinerary') return !Array.isArray(fieldValue) || fieldValue.length === 0;
    if (field.key === 'passengerCount') return !(Number(fieldValue) > 0);
    return fieldValue === undefined || fieldValue === null || fieldValue === '';
  }).map((field) => field.key);

  return { value, missingFields, isComplete: missingFields.length === 0 };
}
