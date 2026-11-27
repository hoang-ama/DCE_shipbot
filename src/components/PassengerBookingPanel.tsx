import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, UserRound } from 'lucide-react';

type BookingType = 'ride' | 'rental';

interface PassengerBookingPanelProps {
  onBookingReady: (type: BookingType, booking: Record<string, unknown>) => void;
  isMatching: boolean;
  matchedPartner?: {
    flow: BookingType;
    displayName: string;
    vehicle: { make: string; model: string; category: string; seatCapacity: number };
    maxPassengers: number;
  } | null;
}

interface RideForm {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupAt: string;
  passengerCount: string;
}

interface RentalForm {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  destination: string;
  itinerary: string;
  startsAt: string;
  endsAt: string;
  passengerCount: string;
  driverOption: 'with_driver' | 'self_drive';
}

const emptyRide: RideForm = {
  customerName: '', customerPhone: '', pickupAddress: '', destinationAddress: '', pickupAt: '', passengerCount: '',
};
const emptyRental: RentalForm = {
  customerName: '', customerPhone: '', pickupAddress: '', destination: '', itinerary: '', startsAt: '', endsAt: '', passengerCount: '', driverOption: 'with_driver',
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-hidden placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input className={inputClass} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export const PassengerBookingPanel: React.FC<PassengerBookingPanelProps> = ({ onBookingReady, isMatching, matchedPartner }) => {
  const [activeType, setActiveType] = useState<BookingType>('ride');
  const [ride, setRide] = useState<RideForm>(emptyRide);
  const [rental, setRental] = useState<RentalForm>(emptyRental);
  const submittedSignatures = useRef<Record<BookingType, string>>({ ride: '', rental: '' });
  const bookingMatchStarted = useRef(false);

  const rideMissing = useMemo(() => [
    ['Tên khách', ride.customerName],
    ['Số điện thoại', ride.customerPhone],
    ['Điểm đón', ride.pickupAddress],
    ['Điểm đến', ride.destinationAddress],
    ['Thời gian đón', ride.pickupAt],
    ['Số hành khách', Number(ride.passengerCount) > 0 ? ride.passengerCount : ''],
  ].filter(([, value]) => !String(value).trim()).map(([label]) => label), [ride]);

  const rentalMissing = useMemo(() => [
    ['Tên khách', rental.customerName],
    ['Số điện thoại', rental.customerPhone],
    ['Điểm đón', rental.pickupAddress],
    ['Điểm đến', rental.destination],
    ['Thời gian bắt đầu', rental.startsAt],
    ['Thời gian kết thúc', rental.endsAt],
    ['Số hành khách', Number(rental.passengerCount) > 0 ? rental.passengerCount : ''],
  ].filter(([, value]) => !String(value).trim()).map(([label]) => label), [rental]);

  const rentalTimeOrderInvalid = Boolean(
    rental.startsAt && rental.endsAt && new Date(rental.endsAt).getTime() <= new Date(rental.startsAt).getTime()
  );

  const missing = activeType === 'ride'
    ? rideMissing
    : rentalTimeOrderInvalid ? [...rentalMissing, 'Thời gian kết thúc phải sau thời gian bắt đầu'] : rentalMissing;
  const rideComplete = rideMissing.length === 0;
  const rentalComplete = rentalMissing.length === 0 && !rentalTimeOrderInvalid;
  const readyType = activeType === 'ride'
    ? (rideComplete ? 'Ride' : rentalComplete ? 'Rental' : null)
    : (rentalComplete ? 'Rental' : rideComplete ? 'Ride' : null);
  const complete = Boolean(readyType);

  useEffect(() => {
    if (!rideComplete || bookingMatchStarted.current) {
      submittedSignatures.current.ride = '';
      return;
    }
    const booking = {
      flow: 'ride',
      customer: { name: ride.customerName.trim(), phone: ride.customerPhone.trim() },
      pickupAddress: ride.pickupAddress.trim(),
      destinationAddress: ride.destinationAddress.trim(),
      pickupAt: ride.pickupAt,
      vehicleType: '',
      passengerCount: Number(ride.passengerCount),
      isRoundTrip: false,
      notes: '',
    };
    const signature = JSON.stringify(booking);
    if (submittedSignatures.current.ride === signature) return;
    submittedSignatures.current.ride = signature;
    bookingMatchStarted.current = true;
    onBookingReady('ride', booking);
  }, [ride, rideComplete, onBookingReady]);

  useEffect(() => {
    if (!rentalComplete || bookingMatchStarted.current) {
      submittedSignatures.current.rental = '';
      return;
    }
    const stops = rental.itinerary.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    const booking = {
      flow: 'rental',
      customer: { name: rental.customerName.trim(), phone: rental.customerPhone.trim() },
      pickupAddress: rental.pickupAddress.trim(),
      destinationAddress: rental.destination.trim(),
      itinerary: [rental.destination.trim(), ...stops.filter((item) => item !== rental.destination.trim())],
      startsAt: rental.startsAt,
      endsAt: rental.endsAt,
      vehicleType: '',
      driverOption: rental.driverOption,
      passengerCount: Number(rental.passengerCount),
      notes: '',
    };
    const signature = JSON.stringify(booking);
    if (submittedSignatures.current.rental === signature) return;
    submittedSignatures.current.rental = signature;
    bookingMatchStarted.current = true;
    onBookingReady('rental', booking);
  }, [rental, rentalComplete, onBookingReady]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <UserRound className="h-5 w-5 text-violet-700" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Thông tin đặt xe</h2>
            <p className="mt-0.5 text-xs text-slate-500">Bot sẽ tự gọi bộ ghép đối tác khi một booking đủ trường.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Chọn loại booking">
          <button type="button" role="tab" aria-selected={activeType === 'ride'} onClick={() => setActiveType('ride')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeType === 'ride' ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            Ride · Theo chuyến
          </button>
          <button type="button" role="tab" aria-selected={activeType === 'rental'} onClick={() => setActiveType('rental')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeType === 'rental' ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            Rental · Theo lịch trình
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {activeType === 'ride' ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tên khách" value={ride.customerName} placeholder="Tên người đặt" onChange={(value) => setRide((old) => ({ ...old, customerName: value }))} />
              <Field label="Số điện thoại" type="tel" value={ride.customerPhone} placeholder="Số liên hệ" onChange={(value) => setRide((old) => ({ ...old, customerPhone: value }))} />
            </div>
            <Field label="Điểm đón" value={ride.pickupAddress} placeholder="Địa chỉ đón khách" onChange={(value) => setRide((old) => ({ ...old, pickupAddress: value }))} />
            <Field label="Điểm đến" value={ride.destinationAddress} placeholder="Địa chỉ cần đến" onChange={(value) => setRide((old) => ({ ...old, destinationAddress: value }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Thời gian đón" type="datetime-local" value={ride.pickupAt} onChange={(value) => setRide((old) => ({ ...old, pickupAt: value }))} />
              <Field label="Số hành khách" type="number" value={ride.passengerCount} placeholder="Ví dụ: 2" onChange={(value) => setRide((old) => ({ ...old, passengerCount: value }))} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
              Hình thức mặc định: <span className="font-semibold text-slate-800">Một chiều · chỉ đón</span>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tên khách" value={rental.customerName} placeholder="Tên người đặt" onChange={(value) => setRental((old) => ({ ...old, customerName: value }))} />
              <Field label="Số điện thoại" type="tel" value={rental.customerPhone} placeholder="Số liên hệ" onChange={(value) => setRental((old) => ({ ...old, customerPhone: value }))} />
            </div>
            <Field label="Điểm đón" value={rental.pickupAddress} placeholder="Địa chỉ đón khách" onChange={(value) => setRental((old) => ({ ...old, pickupAddress: value }))} />
            <Field label="Điểm đến" value={rental.destination} placeholder="Điểm kết thúc chính" onChange={(value) => setRental((old) => ({ ...old, destination: value }))} />
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Lịch trình / điểm dừng thêm</span>
              <textarea className={`${inputClass} min-h-20 resize-y`} value={rental.itinerary} placeholder="Mỗi điểm đến hoặc điểm dừng trên một dòng" onChange={(event) => setRental((old) => ({ ...old, itinerary: event.target.value }))} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Thời gian bắt đầu" type="datetime-local" value={rental.startsAt} onChange={(value) => setRental((old) => ({ ...old, startsAt: value }))} />
              <Field label="Thời gian kết thúc" type="datetime-local" value={rental.endsAt} onChange={(value) => setRental((old) => ({ ...old, endsAt: value }))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Số hành khách" type="number" value={rental.passengerCount} placeholder="Ví dụ: 4" onChange={(value) => setRental((old) => ({ ...old, passengerCount: value }))} />
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Hình thức thuê</span>
                <select className={inputClass} value={rental.driverOption} onChange={(event) => setRental((old) => ({ ...old, driverOption: event.target.value as RentalForm['driverOption'] }))}>
                  <option value="with_driver">Có tài xế (mặc định)</option>
                  <option value="self_drive">Tự lái</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-slate-50/70 p-4">
        {isMatching && <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-xs font-medium text-violet-800">Bot đang chạy hàm ghép đối tác trên dữ liệu local…</div>}
        {matchedPartner && matchedPartner.flow === activeType && <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-900">
          <p className="font-semibold">Đối tác được bot ghép: {matchedPartner.displayName}</p>
          <p className="mt-1 text-xs">{matchedPartner.vehicle.make} {matchedPartner.vehicle.model} · {matchedPartner.vehicle.category} · tối đa {matchedPartner.maxPassengers} khách</p>
        </div>}
        <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{complete ? `Đã đủ thông tin ${readyType}` : `Còn thiếu ${missing.length} mục`}</p>
            {!complete && <p className="mt-1 text-xs leading-relaxed">{missing.join(' · ')}</p>}
            {complete && <p className="mt-1 text-xs">Sẵn sàng gửi đối tác khi chức năng được kết nối.</p>}
          </div>
        </div>
        <button type="button" disabled className="mt-3 w-full cursor-not-allowed rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white opacity-45" title="Chưa kết nối chức năng gửi đối tác">
          {isMatching ? 'Bot đang tìm đối tác…' : matchedPartner && matchedPartner.flow === readyType ? `Đã ghép ${readyType} · Chưa gửi yêu cầu thật` : complete ? `Đủ thông tin ${readyType} · Đang chờ API` : 'Chờ đủ thông tin booking'}
        </button>
      </footer>
    </section>
  );
};
