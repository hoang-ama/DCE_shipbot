import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, MapPin } from 'lucide-react';

interface TravelDetails {
  destination: string;
  departurePoint: string;
  travelDate: string;
  duration: string;
  adults: string;
  children: string;
  childrenAges: string;
  budget: string;
  activities: string;
  transportation: string;
  contactName: string;
  contactPhone: string;
  notes: string;
}

const initialDetails: TravelDetails = {
  destination: '', departurePoint: '', travelDate: '', duration: '', adults: '', children: '', childrenAges: '', budget: '',
  activities: '', transportation: '',
  contactName: '', contactPhone: '', notes: '',
};

interface TourExperimentInfo {
  subVertical?: string;
  serviceDraft?: { fields?: Record<string, unknown> };
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-hidden placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input className={inputClass} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <textarea className={`${inputClass} min-h-20 resize-y`} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export const TourBookingPanel: React.FC<{ info: TourExperimentInfo }> = ({ info }) => {
  const [details, setDetails] = useState<TravelDetails>(initialDetails);
  const set = <K extends keyof TravelDetails,>(key: K, value: TravelDetails[K]) => setDetails((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const fields = info.serviceDraft?.fields || {};
    const extracted = (key: string) => {
      const value = fields[key];
      return value === undefined || value === null || value === '' ? undefined : String(value);
    };
    setDetails((current) => ({
      ...current,
      destination: extracted('destination') ?? current.destination,
      travelDate: extracted('travelDates') ?? current.travelDate,
      adults: extracted('guests') ?? current.adults,
      budget: extracted('budget') ?? current.budget,
      activities: extracted('preference') ?? current.activities,
    }));
  }, [info]);

  const trackedValues = useMemo(() => {
    const common = [details.destination, details.adults, details.children, details.childrenAges, details.budget, details.contactName, details.contactPhone, details.notes];
    const specific = [details.departurePoint, details.travelDate, details.duration, details.activities, details.transportation];
    return [...common, ...specific];
  }, [details]);
  const capturedCount = trackedValues.filter((value) => value.trim()).length;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-violet-700" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Thông tin tour</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ghi nhận nhu cầu để bot tư vấn linh hoạt, không bắt buộc điền đủ form.</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Điểm đến / khu vực" value={details.destination} placeholder="Thành phố, tỉnh hoặc khu vực" onChange={(value) => set('destination', value)} />
          <Field label="Điểm khởi hành / đón khách" value={details.departurePoint} placeholder="Ví dụ: Hà Nội" onChange={(value) => set('departurePoint', value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ngày dự kiến khởi hành" value={details.travelDate} placeholder="Ví dụ: 20/12 hoặc cuối tuần sau" onChange={(value) => set('travelDate', value)} />
          <Field label="Thời lượng chuyến đi" value={details.duration} placeholder="Ví dụ: 3 ngày 2 đêm" onChange={(value) => set('duration', value)} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Người lớn / số khách" value={details.adults} placeholder="Ví dụ: 2 người lớn, 1 trẻ em" onChange={(value) => set('adults', value)} />
          <Field label="Trẻ em" type="number" value={details.children} placeholder="Số trẻ" onChange={(value) => set('children', value)} />
          <Field label="Độ tuổi trẻ em" value={details.childrenAges} placeholder="Ví dụ: 4, 8 tuổi" onChange={(value) => set('childrenAges', value)} />
        </div>

        <Field label="Ngân sách dự kiến" value={details.budget} placeholder="Ví dụ: khoảng 5 triệu/người" onChange={(value) => set('budget', value)} />

        <TextArea label="Điểm tham quan / hoạt động mong muốn" value={details.activities} placeholder="Ví dụ: nghỉ dưỡng, tham quan, vui chơi cho trẻ em" onChange={(value) => set('activities', value)} />
        <Field label="Phương tiện mong muốn" value={details.transportation} placeholder="Ví dụ: máy bay, xe du lịch" onChange={(value) => set('transportation', value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tên liên hệ" value={details.contactName} placeholder="Tên người đặt" onChange={(value) => set('contactName', value)} />
          <Field label="Số điện thoại" type="tel" value={details.contactPhone} placeholder="Số để nhân viên liên hệ" onChange={(value) => set('contactPhone', value)} />
        </div>
        <TextArea label="Ghi chú / yêu cầu đặc biệt" value={details.notes} placeholder="Yêu cầu ăn uống, hỗ trợ di chuyển hoặc thông tin khác" onChange={(value) => set('notes', value)} />
      </div>

      <footer className="border-t border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-sky-900">
          {capturedCount > 0 ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">Đã ghi nhận {capturedCount} thông tin</p>
            <p className="mt-1 text-xs leading-relaxed">Các mục còn trống không cản trở hội thoại. Giá và lịch trình cần được xác nhận từ kho tri thức hoặc nhân viên.</p>
          </div>
        </div>
        <button type="button" disabled className="mt-3 w-full cursor-not-allowed rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white opacity-45" title="Chưa kết nối API tạo yêu cầu tour">
          Chưa kết nối gửi yêu cầu cho sale
        </button>
      </footer>
    </section>
  );
};
