import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PassengerBooking } from './types';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export interface PassengerPartner {
  id: string;
  serviceType: 'ride' | 'rental';
  firstName: string;
  lastName: string;
  displayName: string;
  vehicle: { make: string; model: string; year: number; category: string; seatCapacity: number };
  maxPassengers: number;
  driverOptions?: Array<'with_driver' | 'self_drive'>;
  serviceAreas: string[];
  capabilities: string[];
  availability: string;
  contact: string;
  notes: string;
}

export interface PartnerMatchResult {
  partner: PassengerPartner | null;
  retrieval: {
    mode: 'mock-rag';
    query: string;
    candidateCount: number;
    selectedBy: string;
  };
}

async function readPartnerCorpus(flow: 'ride' | 'rental'): Promise<PassengerPartner[]> {
  const directory = path.join(moduleDirectory, 'partners', flow);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const contents = await Promise.all(names.map((name) => readFile(path.join(directory, name), 'utf8')));
  return contents.map((content) => JSON.parse(content) as PassengerPartner);
}

export async function matchPassengerPartner(booking: PassengerBooking): Promise<PartnerMatchResult> {
  const corpus = await readPartnerCorpus(booking.flow);
  const passengerCount = Number(booking.passengerCount || 0);
  const requestedDriver = booking.flow === 'rental' ? booking.driverOption : undefined;
  const eligible = corpus.filter((partner) =>
    partner.maxPassengers >= passengerCount &&
    (!requestedDriver || partner.driverOptions?.includes(requestedDriver))
  );

  const route = booking.flow === 'ride'
    ? `${booking.pickupAddress} → ${booking.destinationAddress}`
    : `${booking.pickupAddress} → ${booking.destinationAddress}; ${booking.itinerary.join(' → ')}`;
  const query = `${booking.flow}; ${route}; passengers=${passengerCount}; driver=${requestedDriver || 'with_driver'}`;

  return {
    partner: eligible[0] || null,
    retrieval: {
      mode: 'mock-rag',
      query,
      candidateCount: eligible.length,
      selectedBy: 'First eligible profile in the JSON partner corpus (mock retrieval; no vector database yet)',
    },
  };
}

export async function readMockOpsProfile(): Promise<Record<string, unknown>> {
  const file = path.join(moduleDirectory, 'ops', 'ops-01.json');
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}
