import React from 'react';
import type { ShippingInfo } from '../../shared/types';
import { GROUP_LABELS,SERVICE_LABELS,SUBS } from '../../shared/service-menu';
const labels:Record<string,string>={customerName:'Tên khách / người liên hệ',customerPhone:'Số điện thoại',pickup:'Điểm đón / lấy',pickupAddress:'Điểm đón / địa chỉ lấy hàng',destination:'Điểm đến',destinationAddress:'Điểm đến / địa chỉ giao hàng',departure:'Thời gian đi',pickupAt:'Thời gian khởi hành',passengers:'Số khách',passengerCount:'Số hành khách',vehicle:'Loại xe',itinerary:'Lịch trình',start:'Bắt đầu thuê',startsAt:'Thời gian bắt đầu',duration:'Thời gian thuê',endsAt:'Thời gian kết thúc',driverOption:'Tùy chọn tài xế',cargo:'Hàng hóa / số lượng',weightDimensions:'Cân nặng / kích thước',time:'Thời gian chuyển',handling:'Yêu cầu bốc xếp',truckType:'Loại xe tải',travelDates:'Ngày du lịch',guests:'Số khách',budget:'Ngân sách',preference:'Nhu cầu'};
export function ServiceDraftCard({info,onReset}:{info:ShippingInfo;onReset:()=>void}){
 const draft=info.serviceDraft;
 return <section className="h-full min-h-0 flex flex-col overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
 <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Đi Chung · Dịch vụ</p>
 <h2 className="mt-2 text-lg font-bold text-slate-900">{info.subVertical?SERVICE_LABELS[info.subVertical]:info.mainVertical?GROUP_LABELS[info.mainVertical]:'Chọn nhóm dịch vụ'}</h2>
 {!info.subVertical?<div className="mt-6 space-y-4">{(info.mainVertical?[info.mainVertical]:Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]).map(group=><div key={group} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold">{GROUP_LABELS[group]}</h3><p className="mt-1 text-sm text-slate-500">{SUBS[group].map(s=>SERVICE_LABELS[s]).join(' · ')}</p></div>)}<p className="text-sm text-slate-500">Chọn dịch vụ trong khung trò chuyện bên trái.</p></div>:<>
 <p className="mt-2 text-sm text-slate-500">Phiếu tư vấn — chưa phải đơn đã đặt hoặc báo giá chính thức.</p>
 {draft?.confirmationStatus==='awaiting_confirmation'&&<p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Đã thu thập đủ thông tin. Đang chờ khách kiểm tra và xác nhận.</p>}
 {draft?.confirmationStatus==='quote_pending'&&<p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Khách đã xác nhận thông tin. Báo giá chưa có API; bot đã dừng phản hồi tự động.</p>}
 {draft?.ready&&!draft.confirmationStatus&&<p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Đã thu thập đủ thông tin. Cần nhân viên kiểm tra giá và xác nhận.</p>}
 <div className="mt-5 space-y-3">{Object.entries(draft?.fields||{}).map(([key,value])=><div key={key} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-medium text-slate-500">{labels[key]||key}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}{!Object.keys(draft?.fields||{}).length&&<p className="text-sm text-slate-500">Chưa có thông tin. Bot sẽ thu thập theo nhu cầu của khách.</p>}</div>
 {!!draft?.missing.length&&<div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Còn thiếu: {draft.missing.join(', ')}</div>}
 </>}
 <button type="button" onClick={onReset} className="mt-auto rounded-xl border border-slate-200 p-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">Chọn lại dịch vụ / tạo phiên mới</button>
 </section>;
}
