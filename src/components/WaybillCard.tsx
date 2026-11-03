import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  MapPin,
  Package,
  Scale,
  Maximize2,
  Copy,
  FileCheck,
  Check,
  Edit2,
  Save,
  Sparkles,
  ArrowRightLeft,
  Clock,
} from 'lucide-react';
import { ShippingInfo } from '../types';
import {
  calculateVolumetricWeight,
  generateShipmentTextSummary,
  checkHasWardCommune,
  isValidVNPhone,
} from '../utils/logistics';

const COMMON_CARGO_CATEGORIES = [
  'Hoa quả',
  'Tài liệu',
  'Quần áo',
  'Thực phẩm',
  'Hải sản',
  'Linh kiện điện tử',
  'Đồ gia dụng',
  'Mỹ phẩm',
  'Dược phẩm',
];

const COMMON_DELIVERY_TIMES = [
  'Sáng mai',
  'Chiều nay 15h',
  'Trong giờ hành chính',
  'Giao ngay',
  'Ngày mai',
];

interface WaybillCardProps {
  shippingInfo: ShippingInfo;
  onUpdateInfo: (updated: ShippingInfo) => void;
  onConfirmOrder: () => void;
  trackingCode: string;
}

export const WaybillCard: React.FC<WaybillCardProps> = ({
  shippingInfo,
  onUpdateInfo,
  onConfirmOrder,
  trackingCode,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableInfo, setEditableInfo] = useState<ShippingInfo>(shippingInfo);
  const [copied, setCopied] = useState(false);

  // Sync state if external changes occur while not in edit mode
  React.useEffect(() => {
    if (!isEditing) {
      setEditableInfo(shippingInfo);
    }
  }, [shippingInfo, isEditing]);

  const volWeight = calculateVolumetricWeight(
    shippingInfo.cargo.dimensions.length,
    shippingInfo.cargo.dimensions.width,
    shippingInfo.cargo.dimensions.height
  );

  const senderWardOk = Boolean(shippingInfo.sender.hasWardCommune || checkHasWardCommune(shippingInfo.sender.address));
  const receiverWardOk = Boolean(shippingInfo.receiver.hasWardCommune || checkHasWardCommune(shippingInfo.receiver.address));
  const nextKey = shippingInfo.nextMissingKey;

  const handleSaveEdit = () => {
    onUpdateInfo(editableInfo);
    setIsEditing(false);
  };

  const handleCopySummary = () => {
    const text = generateShipmentTextSummary(shippingInfo, trackingCode);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Waybill Header & Progress */}
      <div className="p-4 sm:p-5 bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              <Package className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                Phiếu Vận Đơn Trực Quan
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-mono">
                  {trackingCode}
                </span>
              </h2>
              <p className="text-xs text-slate-500">CSKH Đi Chung bóc tách và chuẩn hóa đến phường/xã</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors shadow-2xs cursor-pointer"
                title="Chỉnh sửa trực tiếp"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sửa nhanh</span>
              </button>
            ) : (
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu thay đổi</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar (4 milestones) */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
            <span className="text-slate-600 flex items-center gap-1">
              Độ hoàn thiện thông tin
              <span className="text-slate-400">({4 - shippingInfo.missingFields.length}/4 thông tin cần thiết)</span>
            </span>
            <span
              className={`font-bold ${
                shippingInfo.completionRate === 100
                  ? 'text-emerald-600'
                  : shippingInfo.completionRate >= 50
                  ? 'text-blue-600'
                  : 'text-amber-600'
              }`}
            >
              {shippingInfo.completionRate}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                shippingInfo.completionRate === 100
                  ? 'bg-emerald-500'
                  : shippingInfo.completionRate >= 50
                  ? 'bg-blue-600'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${shippingInfo.completionRate}%` }}
            />
          </div>
        </div>

        {/* Status banner */}
        <div className="mt-3">
          {shippingInfo.isConfirmed ? (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="flex-1 font-medium">
                <span className="font-bold text-blue-700">Khách đã xác nhận đơn:</span> &ldquo;Anh/ chị đợi chút em báo giá cho mình ạ&rdquo;
              </div>
            </div>
          ) : shippingInfo.isComplete ? (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 font-medium">
                Đã thu thập đủ 4 thông tin và gửi form xác nhận! Chờ khách xác nhận để chốt báo giá.
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-xs">
              <div className="flex items-center justify-between gap-1.5 font-semibold text-amber-800 mb-1">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Cần bổ sung ({shippingInfo.missingFields.length} mục):</span>
                </div>
                {nextKey && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full animate-pulse">
                    Đang hỏi mục #{4 - shippingInfo.missingFields.length + 1}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {shippingInfo.missingFields.map((field, idx) => (
                  <span
                    key={idx}
                    className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      idx === 0
                        ? 'bg-blue-100 text-blue-900 font-bold border border-blue-300 ring-1 ring-blue-300'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {idx === 0 ? '👉 ' : '• '}
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* 1. ĐỊA CHỈ LẤY HÀNG */}
        <div className={`p-4 rounded-xl border transition-all ${
          nextKey === 'sender_address'
            ? 'border-blue-400 bg-blue-50/20 ring-2 ring-blue-100 shadow-xs'
            : 'border-slate-200 bg-white shadow-2xs hover:border-blue-200'
        }`}>
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Địa Chỉ Lấy Hàng
              </h3>
            </div>
            {shippingInfo.sender.address && senderWardOk ? (
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Đầy đủ (có Phường/Xã)
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-600">
                {nextKey === 'sender_address' ? '👉 Đang hỏi Địa chỉ phường/xã' : 'Đang chờ nhập'}
              </span>
            )}
          </div>

          {!isEditing ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="w-24 text-slate-500 font-medium shrink-0">Địa chỉ lấy:</span>
                <div className="space-y-1 flex-1">
                  <span className="text-slate-800 font-medium">
                    {shippingInfo.sender.address || (
                      <span className="italic text-slate-400 font-normal">Chưa có địa chỉ gửi</span>
                    )}
                  </span>
                  {shippingInfo.sender.address && (
                    <div>
                      {senderWardOk ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          ✓ Chi tiết đến Phường/Xã (Tự động dịch ngược)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          ⚠ Cần chi tiết đến Phường/Xã
                        </span>
                      )}
                    </div>
                  )}
                  {nextKey === 'sender_address' && (
                    <div className="text-[10px] text-blue-600 font-semibold">
                      👉 CSKH Đi Chung đang xin địa chỉ chi tiết đến phường/xã
                    </div>
                  )}
                </div>
              </div>

              {shippingInfo.sender.phone && (
                <div className="flex items-start gap-2 text-slate-500 text-[11px]">
                  <span className="w-24 shrink-0">SĐT (tùy chọn):</span>
                  <span className="font-mono text-slate-700">{shippingInfo.sender.phone}</span>
                </div>
              )}

              {shippingInfo.sender.name && (
                <div className="flex items-start gap-2 text-slate-500 text-[11px]">
                  <span className="w-24 shrink-0">Người gửi:</span>
                  <span>{shippingInfo.sender.name}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Địa chỉ lấy hàng (Chi tiết đến Phường/Xã)
                </label>
                <input
                  type="text"
                  value={editableInfo.sender.address}
                  onChange={(e) =>
                    setEditableInfo({
                      ...editableInfo,
                      sender: { ...editableInfo.sender, address: e.target.value },
                    })
                  }
                  placeholder="VD: Keangnam, Tòa Landmark 81, hoặc Số 120 Cầu Giấy, Phường Quan Hoa, Hà Nội"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-blue-500 outline-hidden"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  Hệ thống hỗ trợ tự động dịch ngược địa danh/tòa nhà sang địa chỉ phường/xã.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Tên người gửi (Tùy chọn)</label>
                  <input
                    type="text"
                    value={editableInfo.sender.name || ''}
                    onChange={(e) =>
                      setEditableInfo({
                        ...editableInfo,
                        sender: { ...editableInfo.sender, name: e.target.value },
                      })
                    }
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-blue-500 outline-hidden text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">SĐT người gửi (Tùy chọn)</label>
                  <input
                    type="text"
                    value={editableInfo.sender.phone || ''}
                    onChange={(e) =>
                      setEditableInfo({
                        ...editableInfo,
                        sender: { ...editableInfo.sender, phone: e.target.value },
                      })
                    }
                    placeholder="0912345678"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-hidden text-slate-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. ĐỊA CHỈ GIAO HÀNG */}
        <div className={`p-4 rounded-xl border transition-all ${
          nextKey === 'receiver_address'
            ? 'border-emerald-400 bg-emerald-50/20 ring-2 ring-emerald-100 shadow-xs'
            : 'border-slate-200 bg-white shadow-2xs hover:border-emerald-200'
        }`}>
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                Địa Chỉ Giao Hàng
              </h3>
            </div>
            {shippingInfo.receiver.address && receiverWardOk ? (
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Đầy đủ (có Phường/Xã)
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-600">
                {nextKey === 'receiver_address' ? '👉 Đang hỏi Địa chỉ phường/xã' : 'Đang chờ nhập'}
              </span>
            )}
          </div>

          {!isEditing ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="w-24 text-slate-500 font-medium shrink-0">Địa chỉ giao:</span>
                <div className="space-y-1 flex-1">
                  <span className="text-slate-800 font-medium">
                    {shippingInfo.receiver.address || (
                      <span className="italic text-slate-400 font-normal">Chưa có địa chỉ nhận</span>
                    )}
                  </span>
                  {shippingInfo.receiver.address && (
                    <div>
                      {receiverWardOk ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          ✓ Chi tiết đến Phường/Xã (Tự động dịch ngược)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          ⚠ Cần chi tiết đến Phường/Xã
                        </span>
                      )}
                    </div>
                  )}
                  {nextKey === 'receiver_address' && (
                    <div className="text-[10px] text-emerald-600 font-semibold">
                      👉 CSKH Đi Chung đang xin địa chỉ giao chi tiết đến phường/xã
                    </div>
                  )}
                </div>
              </div>

              {shippingInfo.receiver.phone && (
                <div className="flex items-start gap-2 text-slate-500 text-[11px]">
                  <span className="w-24 shrink-0">SĐT (tùy chọn):</span>
                  <span className="font-mono text-slate-700">{shippingInfo.receiver.phone}</span>
                </div>
              )}

              {shippingInfo.receiver.name && (
                <div className="flex items-start gap-2 text-slate-500 text-[11px]">
                  <span className="w-24 shrink-0">Người nhận:</span>
                  <span>{shippingInfo.receiver.name}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Địa chỉ giao hàng (Chi tiết đến Phường/Xã)
                </label>
                <input
                  type="text"
                  value={editableInfo.receiver.address}
                  onChange={(e) =>
                    setEditableInfo({
                      ...editableInfo,
                      receiver: { ...editableInfo.receiver, address: e.target.value },
                    })
                  }
                  placeholder="VD: Bitexco, Chợ Bến Thành, hoặc 123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 outline-hidden"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  Hệ thống hỗ trợ tự động dịch ngược địa danh/tòa nhà sang địa chỉ phường/xã.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Tên người nhận (Tùy chọn)</label>
                  <input
                    type="text"
                    value={editableInfo.receiver.name || ''}
                    onChange={(e) =>
                      setEditableInfo({
                        ...editableInfo,
                        receiver: { ...editableInfo.receiver, name: e.target.value },
                      })
                    }
                    placeholder="Trần Thị B"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-emerald-500 outline-hidden text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">SĐT người nhận (Tùy chọn)</label>
                  <input
                    type="text"
                    value={editableInfo.receiver.phone || ''}
                    onChange={(e) =>
                      setEditableInfo({
                        ...editableInfo,
                        receiver: { ...editableInfo.receiver, phone: e.target.value },
                      })
                    }
                    placeholder="0987654321"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:ring-1 focus:ring-emerald-500 outline-hidden text-slate-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. THÔNG TIN HÀNG HÓA (CẦN TỐI THIỂU 2 TRONG 3 MỤC LÀ PASS) */}
        {(() => {
          const hasCargoName = !!shippingInfo.cargo?.name?.trim();
          const hasCargoWeight = !!shippingInfo.cargo?.weight?.trim() || !!shippingInfo.cargo?.weightKg;
          const hasCargoDims =
            !!shippingInfo.cargo?.dimensions?.raw?.trim() ||
            (!!shippingInfo.cargo?.dimensions?.length && !!shippingInfo.cargo?.dimensions?.width && !!shippingInfo.cargo?.dimensions?.height);
          const cargoFieldsPresent = (hasCargoName ? 1 : 0) + (hasCargoWeight ? 1 : 0) + (hasCargoDims ? 1 : 0);
          const isCargoComplete = cargoFieldsPresent >= 2;

          return (
            <div className={`p-4 rounded-xl border transition-all ${
              nextKey === 'cargo_info'
                ? 'border-indigo-400 bg-indigo-50/20 ring-2 ring-indigo-100 shadow-xs'
                : 'border-slate-200 bg-white shadow-2xs hover:border-indigo-200'
            }`}>
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-600" />
                      Thông Tin Hàng Hóa
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      (Cần tối thiểu 2 trong 3 mục: Tên hàng, Khối lượng, Kích thước)
                    </p>
                  </div>
                </div>
                {isCargoComplete ? (
                  <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 shrink-0">
                    <Check className="w-3 h-3" /> {cargoFieldsPresent === 3 ? 'Đầy đủ cả 3 mục' : `Đạt chuẩn (${cargoFieldsPresent}/3 mục)`}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-600 shrink-0">
                    {nextKey === 'cargo_info'
                      ? `👉 Cần thêm ${2 - cargoFieldsPresent} mục (đã có ${cargoFieldsPresent}/3)`
                      : `Chưa đủ 2/3 mục (${cargoFieldsPresent}/3)`}
                  </span>
                )}
              </div>

              {!isEditing ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="w-24 text-slate-500 font-medium shrink-0">Tên loại hàng:</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {shippingInfo.cargo.name ? (
                        <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 text-xs">
                          {shippingInfo.cargo.name}
                        </span>
                      ) : (
                        <span className="italic text-slate-400 font-normal">Chưa có tên loại hàng</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-24 text-slate-500 font-medium shrink-0">Khối lượng:</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-2">
                      {shippingInfo.cargo.weight ||
                        (shippingInfo.cargo.weightKg ? `${shippingInfo.cargo.weightKg} kg` : (
                          <span className="italic text-slate-400 font-normal">Chưa có khối lượng</span>
                        ))}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-24 text-slate-500 font-medium shrink-0">Kích thước:</span>
                    <div>
                      <span className="font-semibold text-slate-800 font-mono flex items-center gap-2">
                        {shippingInfo.cargo.dimensions.raw ||
                          (shippingInfo.cargo.dimensions.length &&
                          shippingInfo.cargo.dimensions.width &&
                          shippingInfo.cargo.dimensions.height
                            ? `${shippingInfo.cargo.dimensions.length} x ${shippingInfo.cargo.dimensions.width} x ${shippingInfo.cargo.dimensions.height} cm`
                            : (
                              <span className="italic text-slate-400 font-normal font-sans">
                                Chưa có kích thước (DxRxC)
                              </span>
                            ))}
                      </span>
                      {volWeight > 0 && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Quy đổi thể tích: <span className="font-bold text-indigo-600">{volWeight} kg</span> (Chuẩn (DxRxC)/5000)
                        </div>
                      )}
                    </div>
                  </div>

                  {nextKey === 'cargo_info' && (
                    <div className="p-2 bg-indigo-50/70 border border-indigo-200 rounded-lg text-[11px] text-indigo-900 mt-2 flex items-center gap-1.5">
                      <span className="font-bold">👉 CSKH Đi Chung đang hỏi:</span>
                      <span>Em xin thông tin hàng: Tên hàng, Khối lượng (kg), Kích thước (DxRxC cm).</span>
                    </div>
                  )}

                  {shippingInfo.cargo.specialNotes && (
                    <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                      <span className="w-24 text-slate-500 font-medium shrink-0">Ghi chú:</span>
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                        {shippingInfo.cargo.specialNotes}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tên loại hàng (Tài liệu, Hoa quả, Quần áo...)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {COMMON_CARGO_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() =>
                            setEditableInfo({
                              ...editableInfo,
                              cargo: { ...editableInfo.cargo, name: cat, category: cat },
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                            editableInfo.cargo.name === cat
                              ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={editableInfo.cargo.name}
                      onChange={(e) =>
                        setEditableInfo({
                          ...editableInfo,
                          cargo: { ...editableInfo.cargo, name: e.target.value, category: e.target.value },
                        })
                      }
                      placeholder="Hoặc nhập tên loại hàng khác..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-indigo-500 outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Khối lượng (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editableInfo.cargo.weightKg || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || null;
                          setEditableInfo({
                            ...editableInfo,
                            cargo: {
                              ...editableInfo.cargo,
                              weightKg: val,
                              weight: val ? `${val} kg` : '',
                            },
                          });
                        }}
                        placeholder="VD: 5.5"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:ring-1 focus:ring-indigo-500 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kích thước (DxRxC cm)</label>
                      <input
                        type="text"
                        value={editableInfo.cargo.dimensions.raw}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const match = raw.match(/(\d+)\s*[xX*×]\s*(\d+)\s*[xX*×]\s*(\d+)/);
                          setEditableInfo({
                            ...editableInfo,
                            cargo: {
                              ...editableInfo.cargo,
                              dimensions: {
                                ...editableInfo.cargo.dimensions,
                                raw,
                                length: match ? parseInt(match[1], 10) : editableInfo.cargo.dimensions.length,
                                width: match ? parseInt(match[2], 10) : editableInfo.cargo.dimensions.width,
                                height: match ? parseInt(match[3], 10) : editableInfo.cargo.dimensions.height,
                              },
                            },
                          });
                        }}
                        placeholder="VD: 30x20x15"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:ring-1 focus:ring-indigo-500 outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ghi chú vận chuyển</label>
                    <input
                      type="text"
                      value={editableInfo.cargo.specialNotes}
                      onChange={(e) =>
                        setEditableInfo({
                          ...editableInfo,
                          cargo: { ...editableInfo.cargo, specialNotes: e.target.value },
                        })
                      }
                      placeholder="Hàng dễ vỡ, xin nhẹ tay..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-indigo-500 outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. THỜI GIAN GIAO NHẬN (TEXT) */}
        <div className={`p-4 rounded-xl border transition-all ${
          nextKey === 'delivery_time'
            ? 'border-purple-400 bg-purple-50/20 ring-2 ring-purple-100 shadow-xs'
            : 'border-slate-200 bg-white shadow-2xs hover:border-purple-200'
        }`}>
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">
                4
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                Thời Gian Giao Nhận
              </h3>
            </div>
            {shippingInfo.deliveryTime?.trim() ? (
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Đã có thời gian
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-600">
                {nextKey === 'delivery_time' ? '👉 Đang hỏi thời gian giao nhận' : 'Đang chờ nhập'}
              </span>
            )}
          </div>

          {!isEditing ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="w-24 text-slate-500 font-medium shrink-0">Thời gian:</span>
                <div className="flex-1">
                  {shippingInfo.deliveryTime ? (
                    <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-800 font-semibold border border-purple-200 text-xs inline-block">
                      {shippingInfo.deliveryTime}
                    </span>
                  ) : (
                    <span className="italic text-slate-400 font-normal">Chưa có thông tin thời gian giao nhận</span>
                  )}
                </div>
              </div>

              {nextKey === 'delivery_time' && (
                <div className="p-2 bg-purple-50/70 border border-purple-200 rounded-lg text-[11px] text-purple-900 mt-2 flex items-center gap-1.5">
                  <span className="font-bold">👉 CSKH Đi Chung đang hỏi:</span>
                  <span>Em xin thời gian giao nhận hàng.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Thời gian giao nhận (Văn bản tự do)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_DELIVERY_TIMES.map((timeChip) => (
                    <button
                      key={timeChip}
                      type="button"
                      onClick={() =>
                        setEditableInfo({
                          ...editableInfo,
                          deliveryTime: timeChip,
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        editableInfo.deliveryTime === timeChip
                          ? 'bg-purple-600 text-white font-bold shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {timeChip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editableInfo.deliveryTime || ''}
                  onChange={(e) =>
                    setEditableInfo({
                      ...editableInfo,
                      deliveryTime: e.target.value,
                    })
                  }
                  placeholder="VD: Sáng mai lúc 9h, Chiều nay 15h, Trong giờ hành chính..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-purple-500 outline-hidden"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Sticky Actions */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
        {/* Copy Button */}
        <button
          onClick={handleCopySummary}
          className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          title="Sao chép nội dung đơn hàng để gửi Zalo hoặc tin nhắn"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700 font-bold">Đã chép thông tin đơn vào bộ nhớ!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-slate-600" />
              <span>Sao chép đơn hàng (Gửi Zalo)</span>
            </>
          )}
        </button>

        {/* Primary Confirmation Button */}
        <button
          onClick={onConfirmOrder}
          disabled={!shippingInfo.isComplete}
          className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
            shippingInfo.isConfirmed
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25 active:scale-[0.99]'
              : shippingInfo.isComplete
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 active:scale-[0.99]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          <FileCheck className="w-5 h-5" />
          <span>
            {shippingInfo.isConfirmed
              ? 'Đã Chốt Đơn (Chờ CSKH Báo Giá)'
              : 'Xác Nhận Lên Đơn Vận Chuyển'}
          </span>
        </button>
      </div>
    </div>
  );
};
