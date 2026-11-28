import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Plus, Trash2, Truck } from 'lucide-react';

interface CargoItem {
  id: number;
  name: string;
  quantity: string;
  weight: string;
  dimensions: string;
}

type CargoType = 'express' | 'truck';
interface CargoExperimentInfo {
  subVertical?: string;
  serviceDraft?: { fields?: Record<string, unknown> };
  sender?: { name?: string; phone?: string; address?: string };
  receiver?: { name?: string; phone?: string; address?: string };
  cargo?: { name?: string; weight?: string; items?: Array<{ name?: string; weight?: string; dimensions?: string; quantity?: string | number }> };
  deliveryTime?: string;
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

export const CargoBookingPanel: React.FC<{ info: CargoExperimentInfo }> = ({ info }) => {
  const [activeType, setActiveType] = useState<CargoType>('express');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [truckType, setTruckType] = useState('');
  const [nextItemId, setNextItemId] = useState(2);
  const [items, setItems] = useState<CargoItem[]>([{ id: 1, name: '', quantity: '1', weight: '', dimensions: '' }]);

  useEffect(() => {
    const fields = info.serviceDraft?.fields || {};
    const text = (...values: unknown[]) => {
      const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
      return value === undefined ? '' : String(value);
    };
    const fromDraft = (key: string, ...fallback: unknown[]) => Object.prototype.hasOwnProperty.call(fields, key)
      ? (fields[key] === null || fields[key] === undefined ? '' : String(fields[key]))
      : text(...fallback);
    if (info.subVertical === 'truck') setActiveType('truck');
    else if (info.subVertical === 'express') setActiveType('express');
    setContactName((current) => fromDraft('contactName', info.sender?.name, info.receiver?.name) || (Object.prototype.hasOwnProperty.call(fields, 'contactName') ? '' : current));
    setContactPhone((current) => fromDraft('contactPhone', info.sender?.phone, info.receiver?.phone) || (Object.prototype.hasOwnProperty.call(fields, 'contactPhone') ? '' : current));
    setPickupAddress((current) => fromDraft('pickup', info.sender?.address) || (Object.prototype.hasOwnProperty.call(fields, 'pickup') ? '' : current));
    setDeliveryAddress((current) => fromDraft('destination', info.receiver?.address) || (Object.prototype.hasOwnProperty.call(fields, 'destination') ? '' : current));
    setRequestedAt((current) => fromDraft('time', info.deliveryTime) || (Object.prototype.hasOwnProperty.call(fields, 'time') ? '' : current));
    setTruckType((current) => fromDraft('vehicle', fields.handling, fields.vehicle) || (Object.prototype.hasOwnProperty.call(fields, 'vehicle') ? '' : current));

    const extractedItems = Array.isArray(fields.items)
      ? fields.items.filter((item: any) => item && item.name).map((item: any, index: number) => ({
        id: index + 1, name: String(item.name), quantity: item.quantity === undefined ? '1' : String(item.quantity),
        weight: String(item.weight || ''), dimensions: String(item.dimensions || ''),
      }))
      : Array.isArray(info.cargo?.items)
      ? info.cargo.items.filter((item) => item && item.name).map((item, index) => ({
        id: index + 1,
        name: String(item.name),
        quantity: item.quantity === undefined ? '1' : String(item.quantity),
        weight: String(item.weight || ''),
        dimensions: String(item.dimensions || ''),
      }))
      : [];
    const extractedCargo = text(fields.cargo, info.cargo?.name);
    if (Object.prototype.hasOwnProperty.call(fields, 'items')) {
      const nextItems = extractedItems.length ? extractedItems : [{ id: 1, name: '', quantity: '1', weight: '', dimensions: '' }];
      setItems(nextItems);
      setNextItemId(nextItems.length + 1);
    } else if (extractedItems.length) {
      setItems(extractedItems);
      setNextItemId(extractedItems.length + 1);
    } else if (extractedCargo) {
      setItems((current) => [{ ...current[0], name: extractedCargo }, ...current.slice(1)]);
    }
  }, [info]);

  const missing = useMemo(() => {
    const fields: string[] = [];
    if (!contactName.trim()) fields.push('Tên người liên hệ');
    if (!contactPhone.trim()) fields.push('Số điện thoại');
    if (!pickupAddress.trim()) fields.push('Địa chỉ lấy hàng');
    if (!deliveryAddress.trim()) fields.push('Địa chỉ giao hàng');
    if (!items.some((item) => item.name.trim() && Number(item.quantity) > 0)) fields.push('Ít nhất một mặt hàng có tên và số lượng');
    if (!requestedAt) fields.push('Ngày và khung giờ vận chuyển');
    if (activeType === 'truck' && !truckType.trim()) fields.push('Loại xe tải');
    return fields;
  }, [activeType, contactName, contactPhone, pickupAddress, deliveryAddress, items, requestedAt, truckType]);

  const updateItem = (id: number, patch: Partial<CargoItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addItem = () => {
    const id = nextItemId;
    setNextItemId((current) => current + 1);
    setItems((current) => [...current, { id, name: '', quantity: '1', weight: '', dimensions: '' }]);
  };

  const complete = missing.length === 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-violet-700" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Thông tin chuyển hàng</h2>
            <p className="mt-0.5 text-xs text-slate-500">Điền hồ sơ vận chuyển để theo dõi các trường đã đủ và còn thiếu.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Chọn loại chuyển hàng">
          <button type="button" role="tab" aria-selected={activeType === 'express'} onClick={() => setActiveType('express')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeType === 'express' ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            Express · Giao nhanh
          </button>
          <button type="button" role="tab" aria-selected={activeType === 'truck'} onClick={() => setActiveType('truck')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeType === 'truck' ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            Xe tải · Chở hàng
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tên người liên hệ" value={contactName} placeholder="Tên người gửi hoặc nhận" onChange={setContactName} />
          <Field label="Số điện thoại" type="tel" value={contactPhone} placeholder="Số liên hệ" onChange={setContactPhone} />
        </div>
        <Field label="Địa chỉ lấy hàng" value={pickupAddress} placeholder="Địa chỉ lấy hàng" onChange={setPickupAddress} />
        <Field label="Địa chỉ giao hàng" value={deliveryAddress} placeholder="Địa chỉ giao hàng" onChange={setDeliveryAddress} />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-700">Danh sách hàng</h3>
              <p className="mt-0.5 text-xs text-slate-500">Cân nặng và kích thước/thể tích là thông tin tùy chọn.</p>
            </div>
            <button type="button" onClick={addItem} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
              <Plus className="h-3.5 w-3.5" /> Thêm hàng
            </button>
          </div>

          {items.map((item, index) => (
            <div key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Mặt hàng {index + 1}</span>
                {items.length > 1 && <button type="button" aria-label={`Xóa mặt hàng ${index + 1}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
                <Field label="Tên hàng" value={item.name} placeholder="Ví dụ: thùng hồ sơ" onChange={(value) => updateItem(item.id, { name: value })} />
                <Field label="Số lượng" type="number" value={item.quantity} onChange={(value) => updateItem(item.id, { quantity: value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Cân nặng (nếu biết)" value={item.weight} placeholder="Ví dụ: 25 kg" onChange={(value) => updateItem(item.id, { weight: value })} />
                <Field label="Kích thước / thể tích (nếu biết)" value={item.dimensions} placeholder="Ví dụ: 60×40×40 cm" onChange={(value) => updateItem(item.id, { dimensions: value })} />
              </div>
            </div>
          ))}
        </div>

        <div className={`grid grid-cols-1 gap-3 ${activeType === 'truck' ? 'sm:grid-cols-2' : ''}`}>
          <Field label="Ngày và giờ mong muốn vận chuyển" value={requestedAt} placeholder="Ví dụ: ngày mai lúc 15:00" onChange={setRequestedAt} />
          {activeType === 'truck' && <Field label="Loại xe tải" value={truckType} placeholder="Ví dụ: xe tải 1,5 tấn" onChange={setTruckType} />}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-slate-50/70 p-4">
        <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{complete ? `Đã đủ thông tin ${activeType === 'express' ? 'Express' : 'Xe tải'}` : `Còn thiếu ${missing.length} mục`}</p>
            {!complete && <p className="mt-1 text-xs leading-relaxed">{missing.join(' · ')}</p>}
            {complete && <p className="mt-1 text-xs">Hồ sơ đã đầy đủ. Chưa kết nối gửi yêu cầu cho đối tác.</p>}
          </div>
        </div>
        <button type="button" disabled className="mt-3 w-full cursor-not-allowed rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white opacity-45" title="Chưa kết nối chức năng gửi đối tác">
          {complete ? `Đủ thông tin ${activeType === 'express' ? 'Express' : 'Xe tải'} · Chưa gửi đối tác` : 'Chờ đủ thông tin chuyển hàng'}
        </button>
      </footer>
    </section>
  );
};
