import type { RideBooking, ValidationResult } from '../../types';
import { RIDE_FIELDS } from './fields';

export function validateRideBooking(value: RideBooking): ValidationResult<RideBooking> {
  const missingFields = RIDE_FIELDS.filter((field) => {
    if (!field.required) return false;
    const fieldValue = field.key.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
    if (field.key === 'passengerCount') return !(Number(fieldValue) > 0);
    return fieldValue === undefined || fieldValue === null || fieldValue === '';
  }).map((field) => field.key);

  return { value, missingFields, isComplete: missingFields.length === 0 };
}
