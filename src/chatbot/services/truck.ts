import { bookingStep, type BookingSetup } from './booking-flow';
export const truckSetup: BookingSetup = {
  service: 'truck',
  fields: [
    { key: 'customerName', label: 'Tên người liên hệ', question: 'Anh/chị cho em xin tên người liên hệ ạ?', aliases: ['tên khách', 'tên người gửi', 'người liên hệ'], kind: 'text' },
    { key: 'customerPhone', label: 'Số điện thoại', question: 'Anh/chị cho em xin số điện thoại liên hệ ạ?', aliases: ['số điện thoại', 'sđt', 'số liên hệ'], kind: 'phone' },
    { key: 'pickupAddress', label: 'Địa chỉ lấy hàng', question: 'Anh/chị muốn lấy hàng tại địa chỉ nào ạ?', aliases: ['địa chỉ lấy hàng', 'điểm lấy', 'nơi lấy'] },
    { key: 'destinationAddress', label: 'Địa chỉ giao hàng', question: 'Anh/chị muốn giao hàng đến đâu ạ?', aliases: ['địa chỉ giao hàng', 'điểm giao', 'nơi giao'] },
    { key: 'cargo', label: 'Hàng hóa / số lượng', question: 'Anh/chị cần chuyển những hàng hóa hoặc đồ đạc nào, số lượng bao nhiêu ạ?', aliases: ['hàng hóa', 'đồ cần chuyển', 'mặt hàng', 'hàng gửi'] },
    { key: 'weightDimensions', label: 'Cân nặng / kích thước', question: 'Nếu biết, anh/chị cho em xin cân nặng hoặc kích thước hàng nhé ạ.', aliases: ['cân nặng', 'khối lượng', 'kích thước', 'thể tích'], optional: true },
    { key: 'time', label: 'Ngày và khung giờ', question: 'Anh/chị muốn vận chuyển vào ngày và khung giờ nào ạ?', aliases: ['thời gian', 'ngày chuyển', 'khung giờ'] },
    { key: 'truckType', label: 'Loại xe tải', question: 'Anh/chị cần loại xe tải nào ạ?', aliases: ['loại xe tải', 'xe tải'] },
  ],
  instructions: 'Tiếp nhận yêu cầu thuê xe tải/chuyển đồ. Cần tên và số điện thoại liên hệ, địa chỉ lấy/giao, danh sách hàng và số lượng, ngày/khung giờ, loại xe tải. Cân nặng/kích thước là tùy chọn nếu khách biết. Không tự báo giá.',
  completion: 'Dạ em đã ghi nhận đủ thông tin chuyển đồ. Hệ thống chưa kết nối API báo giá/đặt xe tải, nên nhân viên cần kiểm tra và báo lại mức giá chính thức ạ.',
};
export const truckStep = (...args: [string, any[], any, import('./gemini-client').ModelCall, (step: import('../../shared/types').AITraceStep) => void, number?]) => bookingStep(truckSetup, ...args);
