import { bookingStep, type BookingSetup } from './booking-flow';
export const rideSetup: BookingSetup = {
  service: 'ride',
  fields: [
    { key: 'customerName', label: 'Tên khách', question: 'Anh/chị cho em xin tên người đặt xe ạ?', aliases: ['tên khách', 'tên người đặt', 'người đặt'], kind: 'text' },
    { key: 'customerPhone', label: 'Số điện thoại', question: 'Anh/chị cho em xin số điện thoại liên hệ ạ?', aliases: ['số điện thoại', 'sđt', 'số liên hệ'], kind: 'phone' },
    { key: 'pickupAddress', label: 'Điểm đón', question: 'Anh/chị muốn đón xe ở đâu ạ?', aliases: ['điểm đón', 'đón', 'địa chỉ đón'] },
    { key: 'destinationAddress', label: 'Điểm đến', question: 'Anh/chị muốn đi đến đâu ạ?', aliases: ['điểm đến', 'nơi đến', 'địa chỉ đến'] },
    { key: 'pickupAt', label: 'Thời gian khởi hành', question: 'Anh/chị dự kiến khởi hành lúc nào ạ?', aliases: ['thời gian đi', 'giờ đi', 'ngày giờ đón', 'khởi hành'] },
    { key: 'passengerCount', label: 'Số hành khách', question: 'Chuyến đi có bao nhiêu hành khách ạ?', aliases: ['số khách', 'số người', 'số hành khách'], kind: 'count' },
  ],
  instructions: 'Đặt xe theo chuyến, mặc định một chiều và chỉ đón tại một điểm. Cần tên, số điện thoại, điểm đón, điểm đến, ngày giờ khởi hành và số hành khách. Không hỏi loại xe/hạng xe.',
  completion: 'Dạ em đã ghi nhận đủ thông tin chuyến đi. Hệ thống chưa kết nối API báo giá/đặt xe, nên nhân viên cần kiểm tra giá và xác nhận lại với anh/chị ạ.',
};
export const rideStep = (...args: [string, any[], any, import('./gemini-client').ModelCall, (step: import('../../shared/types').AITraceStep) => void]) => bookingStep(rideSetup, ...args);
