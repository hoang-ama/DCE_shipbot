import { bookingStep,type BookingSetup } from './booking-flow';
export const truckSetup:BookingSetup={service:'truck',fields:[
 {key:'pickup',label:'Điểm lấy đồ',question:'Anh/chị muốn lấy đồ tại đâu ạ?',aliases:['điểm lấy','địa chỉ lấy']},
 {key:'destination',label:'Điểm giao đồ',question:'Đồ cần chuyển đến địa chỉ nào?',aliases:['điểm giao','địa chỉ giao']},
 {key:'cargo',label:'Đồ cần chuyển / số lượng',question:'Anh/chị cần chuyển những đồ gì, số lượng hoặc kích thước ra sao ạ?',aliases:['hàng hóa','đồ','mặt hàng']},
 {key:'time',label:'Thời gian chuyển',question:'Anh/chị muốn chuyển đồ khi nào?',aliases:['thời gian','ngày chuyển']},
 {key:'handling',label:'Yêu cầu bốc xếp / tải trọng',question:'Mình có cần hỗ trợ bốc xếp hoặc xe tải loại cụ thể không?',aliases:['bốc xếp','tải trọng','loại xe'],optional:true}],instructions:'Thuê xe tải, chuyển đồ. Cần địa chỉ, danh sách đồ, thời gian; có thể hỏi bốc xếp. Chưa kết nối bảng giá/đối tác Truck.',completion:'Em đã ghi nhận nhu cầu chuyển đồ. Anh/chị vui lòng liên hệ nhân viên để khảo sát và nhận báo giá xe tải phù hợp ạ.'};
export const truckStep=(...args:[string, any[], any, import("./gemini-client").ModelCall, (s:import("../../shared/types").AITraceStep)=>void])=>bookingStep(truckSetup,...args);
