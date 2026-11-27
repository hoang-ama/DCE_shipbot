export type BookingFlow = 'ride' | 'rental';

export interface CustomerContact {
  name: string;
  phone: string;
}

export interface RideBooking {
  flow: 'ride';
  customer: CustomerContact;
  pickupAddress: string;
  destinationAddress: string;
  pickupAt: string;
  vehicleType: string;
  passengerCount: number | null;
  isRoundTrip: boolean | null;
  notes: string;
}

export interface RentalBooking {
  flow: 'rental';
  customer: CustomerContact;
  pickupAddress: string;
  destinationAddress: string;
  itinerary: string[];
  startsAt: string;
  endsAt: string;
  vehicleType: string;
  driverOption: 'self_drive' | 'with_driver' | null;
  passengerCount: number | null;
  notes: string;
}

export type PassengerBooking = RideBooking | RentalBooking;

export interface FieldDefinition {
  key: string;
  label: string;
  required: boolean;
  question: string;
}

export interface ValidationResult<T> {
  value: T;
  missingFields: string[];
  isComplete: boolean;
}
