import React from 'react';
import { X, Lightbulb, ArrowRight, Sparkles, Package, Zap, Laptop, FileText } from 'lucide-react';

interface SamplePromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const SamplePromptsModal: React.FC<SamplePromptsModalProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
}) => {
  if (!isOpen) return null;

  const scenarios = [
    {
      title: 'Dịch ngược địa chỉ tự động + Đủ 4 mục 100% -> Hiện Form Xác Nhận',
      icon: Package,
      badge: 'Đầy đủ 4/4',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      description: 'Chỉ cần nói tên tòa nhà (Keangnam) và điểm giao (Landmark 81), Đi Chung tự động dịch ngược thành phường/xã chi tiết, nhận diện hàng (hoa quả 5kg đạt 2/3 mục) và thời gian giao nhận -> Xuất form xác nhận 1, 2, 3, 4.',
      prompt:
        'Lấy hàng ở Keangnam Hà Nội, chuyển vào Landmark 81 TP.HCM. Kiện hàng là 5kg hoa quả, giao sáng mai giúp mình nhé.',
    },
    {
      title: 'Tên hàng + Khối lượng (Đạt chuẩn 2/3 mục hàng hóa)',
      icon: Sparkles,
      badge: 'Đạt chuẩn 2/3 hàng',
      badgeColor: 'bg-indigo-100 text-indigo-800',
      description: 'Khách cung cấp địa chỉ và 2/3 mục hàng (tên hàng + khối lượng 1kg). Hàng hóa đạt chuẩn, bot Đi Chung hỏi tiếp Thời gian giao nhận.',
      prompt:
        'Mình cần gửi tập tài liệu hợp đồng nặng 1kg, lấy ở 120 Cầu Giấy, Phường Quan Hoa, Hà Nội chuyển đến 45 Lê Duẩn, Phường Hải Châu 1, Đà Nẵng.',
    },
    {
      title: 'Chỉ có 1 mục hàng (Chưa đủ 2/3 -> Bot sẽ hỏi lại khối lượng/kích thước)',
      icon: Lightbulb,
      badge: 'Chưa đủ 2/3 mục',
      badgeColor: 'bg-amber-100 text-amber-800',
      description: 'Khách chỉ cung cấp tên hàng ("thùng quần áo" - 1/3 mục). Đúng theo quy định, bot Đi Chung sẽ hỏi bổ sung khối lượng (kg) hoặc kích thước.',
      prompt:
        'Lấy hàng ở Keangnam Hà Nội chuyển đến Landmark 81 TP.HCM, hàng là thùng quần áo nhé em.',
    },
    {
      title: 'Định vị Google Maps / Tọa độ -> Tự dịch ngược thành Text địa chỉ chi tiết',
      icon: Laptop,
      badge: 'Google Maps định vị',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      description: 'Khách gửi link Google Maps hoặc tọa độ GPS, Đi Chung tự động trích xuất và dịch ngược thành địa chỉ text đầy đủ gồm Phường/Xã, Quận/Huyện, Tỉnh/TP.',
      prompt:
        'Lấy hàng ở https://www.google.com/maps/place/Khu+đô+thị+PG+An+Đồng giao về Bãi Cháy Quảng Ninh, kiện hoa quả 10kg giao chiều nay nhé.',
    },
    {
      title: 'Liên tỉnh Hải Phòng - Quảng Ninh (Thủy Nguyên đi Bãi Cháy)',
      icon: Zap,
      badge: 'Dữ liệu hành chính VN',
      badgeColor: 'bg-sky-100 text-sky-800',
      description: 'Khách yêu cầu gửi từ Thủy Nguyên Hải Phòng đi Bãi Cháy Quảng Ninh, bot nhận diện xã/phường chuẩn xác và hướng dẫn hoàn tất 4 thông tin.',
      prompt:
        'Tôi muốn giao hàng từ Thủy Nguyên Hải Phòng đi Bãi Cháy Quảng Ninh, hàng là tài liệu 2kg giao trong ngày.',
    },
    {
      title: 'Khách yêu cầu hỏa tốc trong ngày (Phân biệt thời gian với địa chỉ)',
      icon: Zap,
      badge: 'Thời gian giao nhận',
      badgeColor: 'bg-amber-100 text-amber-800',
      description: 'Khách nói "anh cần giao nhận hỏa tốc trong ngày luôn", AI nhận diện chính xác là thời gian giao nhận (Hỏa tốc trong ngày) mà KHÔNG nhầm thành địa chỉ lấy/giao.',
      prompt:
        'Anh cần giao nhận hỏa tốc trong ngày luôn.',
    },
    {
      title: 'Hỏi lần lượt từ tin nhắn chào',
      icon: Zap,
      badge: 'Hỏi theo thứ tự',
      badgeColor: 'bg-blue-100 text-blue-800',
      description: 'Khách hỏi chung chung, CSKH Đi Chung sẽ bắt đầu hỏi cung cấp địa chỉ giao nhận để tư vấn.',
      prompt:
        'Em ơi bên mình có nhận chuyển phát hỏa tốc trong ngày không?',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Kịch Bản Đơn Vận Chuyển Mẫu</h3>
              <p className="text-xs text-slate-300">Chọn kịch bản để trải nghiệm AI tự động bóc tách</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto space-y-3.5 bg-slate-50/50">
          {scenarios.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Icon className="w-4 h-4" />
                    </span>
                    <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mb-2.5">{item.description}</p>

                <div className="p-2.5 bg-slate-50 rounded-lg text-xs text-slate-700 italic border border-slate-200 font-sans leading-relaxed">
                  "{item.prompt}"
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      onSelectPrompt(item.prompt);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <span>Gửi tin nhắn mẫu này</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
