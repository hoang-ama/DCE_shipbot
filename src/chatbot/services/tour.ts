import { bookingStep,type BookingSetup } from './booking-flow';
export const tourSetup:BookingSetup={service:'tour',flexible:true,fields:[
 {key:'destination',label:'Điểm du lịch',question:'Anh/chị đang quan tâm tour hoặc khách sạn ở đâu ạ?',aliases:['điểm đến','địa điểm'],optional:true},
 {key:'travelDates',label:'Thời gian dự kiến',question:'Anh/chị muốn đi vào thời gian nào?',aliases:['thời gian','ngày đi'],optional:true},
 {key:'guests',label:'Số khách',question:'Đoàn mình có bao nhiêu người?',aliases:['số người','số khách'],kind:'count',optional:true},
 {key:'budget',label:'Ngân sách',question:'Anh/chị có ngân sách dự kiến không?',aliases:['ngân sách'],optional:true},
 {key:'preference',label:'Nhu cầu tour / khách sạn',question:'Anh/chị quan tâm tour trọn gói hay khách sạn?',aliases:['nhu cầu','dịch vụ'],optional:true}],instructions:'Tư vấn du lịch linh hoạt, không ép điền form. Hỏi theo nhu cầu. Chưa có kho tri thức sản phẩm, không invent tour, giá, phòng trống hay lịch trình bán chính thức.',completion:'Anh/chị cho em biết thêm nhu cầu tour hoặc khách sạn nhé. Nhân viên Đi Chung có thể hỗ trợ kiểm tra chương trình và giá thực tế ạ.'};
export const tourStep=(...args:[string, any[], any, import("./gemini-client").ModelCall, (s:import("../../shared/types").AITraceStep)=>void])=>bookingStep(tourSetup,...args);
