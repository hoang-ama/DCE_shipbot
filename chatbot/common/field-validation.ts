const INVALID_NAME_WORDS = new Set([
  'anh', 'chi', 'em', 'minh', 'toi', 'tao', 'ban', 'chu', 'co', 'bac', 'ong', 'ba',
  'anh oi', 'chi oi', 'em oi', 'khach', 'khach hang', 'nguoi dat', 'nguoi gui', 'nguoi nhan',
  'khong ro', 'chua biet', 'unknown', 'null',
]);

const foldVietnamese = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/gu, 'd').replace(/\s+/gu, ' ').trim();

export function cleanCustomerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  const folded = foldVietnamese(name);
  if (!name || name.length > 100 || /\d/u.test(name) || /[^\p{L}\s.'’-]/u.test(name)) return null;
  if (INVALID_NAME_WORDS.has(folded)) return null;
  const words = folded.split(' ');
  if (words.length <= 2 && words.every((word) => INVALID_NAME_WORDS.has(word))) return null;
  if (/^(?:(?:minh|toi|em|anh|chi)\s+)?ten(?:\s+la)?\s/u.test(folded)) return null;
  return name;
}

export function cleanVietnamesePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 40 || !/^[+\d\s().-]+$/u.test(raw)) return null;
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/gu, '');
  if (digits.startsWith('0084')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  if (!/^0\d{9,10}$/u.test(digits)) return null;
  if (hasPlus && !raw.replace(/[\s().-]/gu, '').startsWith('+84')) return null;
  return digits;
}

export function isExplicitFieldClear(message: string, field: string): boolean {
  const text = foldVietnamese(message);
  const fieldWords: Record<string, string[]> = {
    customerName: ['ten', 'ten khach', 'ten nguoi dat', 'ten nguoi gui', 'ten nguoi lien he', 'contactname'],
    customerPhone: ['so dien thoai', 'sdt', 'dien thoai', 'so lien he', 'contactphone'],
    pickupAddress: ['diem don', 'dia chi don'],
    pickup: ['dia chi lay', 'diem lay', 'pickup'],
    destinationAddress: ['diem den', 'dia chi den'],
    destination: ['dia chi giao', 'diem giao', 'destination'],
    itinerary: ['lich trinh'],
    pickupAt: ['thoi gian don', 'gio don', 'thoi gian khoi hanh'],
    startsAt: ['thoi gian bat dau'],
    endsAt: ['thoi gian ket thuc'],
    passengerCount: ['so hanh khach', 'so nguoi', 'so khach'],
    items: ['danh sach hang', 'mat hang', 'hang hoa', 'items'],
    time: ['ngay gio van chuyen', 'thoi gian van chuyen', 'time'],
    vehicle: ['loai xe tai', 'vehicle'],
  };
  const aliases = fieldWords[field] || [foldVietnamese(field)];
  const clearIntent = /\b(xoa|bo|huy|khong dung|de trong|bo trong)\b/u.test(text);
  return clearIntent && aliases.some((alias) => text.includes(alias));
}
