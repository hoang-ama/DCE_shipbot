import { bookingStep, type BookingSetup } from './booking-flow';
export const rentSetup: BookingSetup = {
  service: 'rent',
  fields: [
    { key: 'customerName', label: 'Tên khách', question: 'Anh/chị cho em xin tên người thuê xe ạ?', aliases: ['tên khách', 'tên người đặt', 'người đặt'], kind: 'text' },
    { key: 'customerPhone', label: 'Số điện thoại', question: 'Anh/chị cho em xin số điện thoại liên hệ ạ?', aliases: ['số điện thoại', 'sđt', 'số liên hệ'], kind: 'phone' },
    { key: 'pickupAddress', label: 'Điểm đón', question: 'Anh/chị muốn đón xe tại đâu ạ?', aliases: ['điểm đón', 'đón', 'địa chỉ đón'] },
    { key: 'destinationAddress', label: 'Điểm đến', question: 'Anh/chị muốn đi đến đâu ạ?', aliases: ['điểm đến', 'nơi đến', 'địa chỉ đến'] },
    { key: 'itinerary', label: 'Lịch trình', question: 'Anh/chị dự kiến đi những địa điểm nào ạ?', aliases: ['lịch trình', 'tuyến', 'các điểm đi'] },
    { key: 'startsAt', label: 'Thời gian bắt đầu', question: 'Anh/chị muốn bắt đầu thuê xe lúc nào?', aliases: ['bắt đầu', 'ngày đi', 'thời gian bắt đầu'] },
    { key: 'endsAt', label: 'Thời gian kết thúc', question: 'Anh/chị dự kiến kết thúc hoặc trả xe lúc nào ạ?', aliases: ['thời gian thuê', 'trả xe', 'kết thúc'] },
    { key: 'passengerCount', label: 'Số hành khách', question: 'Đoàn mình có bao nhiêu người ạ?', aliases: ['số khách', 'số người', 'số hành khách'], kind: 'count' },
    { key: 'driverOption', label: 'Tài xế', question: 'Mặc định xe có tài xế đi cùng ạ.', aliases: ['tài xế'], optional: true },
  ],
  instructions: 'Thuê xe theo lịch trình/ngày, mặc định có tài xế. Cần tên, số điện thoại, điểm đón, điểm đến, lịch trình, thời gian bắt đầu/kết thúc và số hành khách. Không hỏi loại xe/hạng xe.',
  completion: 'Dạ em đã ghi nhận đủ lịch trình thuê xe có tài xế. Hệ thống chưa kết nối API báo giá/đặt xe, nên nhân viên cần kiểm tra giá và xác nhận lại với anh/chị ạ.',
};
export const rentStep = (...args: [string, any[], any, import('./gemini-client').ModelCall, (step: import('../../shared/types').AITraceStep) => void, number?]) => bookingStep(rentSetup, ...args);
