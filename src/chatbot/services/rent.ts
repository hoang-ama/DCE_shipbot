import { bookingStep,type BookingSetup } from './booking-flow';
export const rentSetup:BookingSetup={service:'rent',fields:[
 {key:'pickup',label:'Điểm đón',question:'Anh/chị muốn đón xe tại đâu?',aliases:['điểm đón','đón']},
 {key:'itinerary',label:'Lịch trình',question:'Anh/chị dự kiến đi những địa điểm nào ạ?',aliases:['lịch trình','tuyến']},
 {key:'start',label:'Thời gian bắt đầu',question:'Anh/chị muốn bắt đầu thuê xe lúc nào?',aliases:['bắt đầu','ngày đi']},
 {key:'duration',label:'Thời gian thuê / trả xe',question:'Anh/chị thuê trong bao lâu hoặc trả xe lúc nào ạ?',aliases:['thời gian thuê','trả xe']},
 {key:'passengers',label:'Số khách',question:'Đoàn mình có bao nhiêu người ạ?',aliases:['số khách','số người'],kind:'count'},
 {key:'vehicle',label:'Loại xe',question:'Anh/chị cần xe loại nào?',aliases:['loại xe'],optional:true}],instructions:'Thuê xe theo ngày hoặc lịch trình; không tự tính giá khi chưa có bảng giá.',completion:'Em đã ghi nhận lịch trình thuê xe. Anh/chị vui lòng liên hệ nhân viên để kiểm tra xe và báo giá theo lịch trình ạ.'};
export const rentStep=(...args:[string, any[], any, import("./gemini-client").ModelCall, (s:import("../../shared/types").AITraceStep)=>void])=>bookingStep(rentSetup,...args);
