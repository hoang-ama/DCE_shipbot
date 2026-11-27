export type MainVertical = 'chuyen_nguoi' | 'chuyen_hang' | 'du_lich';
export type SubVertical = 'ride' | 'rent' | 'express' | 'truck' | 'tour';
export const GROUP_LABELS:Record<MainVertical,string>={chuyen_nguoi:'Chuyển người',chuyen_hang:'Chuyển hàng',du_lich:'Du lịch'};
export const SERVICE_LABELS:Record<SubVertical,string>={ride:'Đặt xe theo chuyến',rent:'Thuê xe theo lịch trình / ngày',express:'Chuyển phát nhanh',truck:'Thuê xe tải / chuyển đồ',tour:'Tour / khách sạn'};
export const GROUP_MENU='Em chào anh/chị! Đi Chung có 3 nhóm dịch vụ. Anh/chị muốn sử dụng dịch vụ nào ạ?\n1. Chuyển người\n2. Chuyển hàng\n3. Du lịch';
export const GROUP_CHOICES=['Chuyển người','Chuyển hàng','Du lịch'];
export const SUBS:Record<MainVertical,SubVertical[]>={chuyen_nguoi:['ride','rent'],chuyen_hang:['express','truck'],du_lich:['tour']};
export const subMenu=(g:MainVertical)=>`Anh/chị muốn sử dụng dịch vụ nào trong nhóm ${GROUP_LABELS[g]} ạ?\n${SUBS[g].map((s,i)=>`${i+1}. ${SERVICE_LABELS[s]}`).join('\n')}`;
export type ServiceDraft={fields:Record<string,string>;ready:boolean;missing:string[];needsStaff?:boolean};
