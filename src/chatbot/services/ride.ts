import { bookingStep,type BookingSetup } from './booking-flow';
export const rideSetup:BookingSetup={service:'ride',fields:[
 {key:'pickup',label:'Điểm đón',question:'Anh/chị muốn đón ở đâu ạ?',aliases:['điểm đón','đón']},
 {key:'destination',label:'Điểm đến',question:'Anh/chị muốn đi đến đâu ạ?',aliases:['điểm đến','đến']},
 {key:'departure',label:'Thời gian đi',question:'Anh/chị dự kiến đi lúc nào ạ?',aliases:['thời gian','giờ đi']},
 {key:'passengers',label:'Số hành khách',question:'Chuyến đi có bao nhiêu hành khách ạ?',aliases:['số người','số khách'],kind:'count'},
 {key:'vehicle',label:'Loại xe',question:'Anh/chị muốn loại xe nào?',aliases:['loại xe'],optional:true}],instructions:'Đặt xe theo chuyến; lấy điểm đón, điểm đến, thời gian, số khách. Chưa có API giá Ride kết nối.',completion:'Em đã ghi nhận thông tin chuyến đi. Anh/chị vui lòng liên hệ nhân viên Đi Chung để kiểm tra giá và đặt xe chính thức ạ.'};
export const rideStep=(...args:[string, any[], any, import("./gemini-client").ModelCall, (s:import("../../shared/types").AITraceStep)=>void])=>bookingStep(rideSetup,...args);
