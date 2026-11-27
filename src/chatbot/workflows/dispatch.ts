import type { AppState, OrderFormData } from '../playground/types';
import * as nlp from '../playground/service';
export type Role = 'customer' | 'DCE' | 'CSDT';
export interface DispatchState { state: AppState; form: OrderFormData; partner?: 'DCE' | 'CSDT'; followUp?: boolean; }
export interface DispatchMessage { to: Role; text: string; }
export function newDispatch(): DispatchState {
  return { state: 'COLLECTING_INFO', form: { dia_chi_lay_hang:null, dia_chi_giao_hang:null, thong_tin_hang:null, thoi_gian_giao_nhan:null, thong_tin_bo_sung:'', missing_fields:[], is_form_complete:false } };
}
// Server-side simulation of the original 15-state workflow. Emits effects; does not send real messages.
export async function dispatchStep(previous: DispatchState, from: Role, text: string): Promise<{ session: DispatchState; messages: DispatchMessage[] }> {
  const session: DispatchState = structuredClone(previous); const messages: DispatchMessage[] = [];
  const emit = (to: Role, value: string) => { if (value) messages.push({to, text:value}); };
  const partner = session.partner || 'DCE';
  const form = session.form;
  const wait = (p:'DCE'|'CSDT') => { session.state = p === 'DCE' ? 'WAITING_DCE' : 'WAITING_CSDT'; };
  const clarify = (p:'DCE'|'CSDT') => { session.state = p === 'DCE' ? 'CLARIFYING_FOR_DCE' : 'CLARIFYING_FOR_CSDT'; };
  const formText = () => `Địa chỉ lấy: ${form.dia_chi_lay_hang}\nĐịa chỉ giao: ${form.dia_chi_giao_hang}\nHàng: ${form.thong_tin_hang}\nThời gian: ${form.thoi_gian_giao_nhan}\nBổ sung: ${form.thong_tin_bo_sung}`;
  if (from === 'customer') {
    switch (session.state) {
      case 'COLLECTING_INFO': {
        const r = await nlp.customer({message:text,currentForm:form});
        for (const key of ['dia_chi_lay_hang','dia_chi_giao_hang','thong_tin_hang','thoi_gian_giao_nhan'] as const) if (typeof r.form_data?.[key] === 'string' && r.form_data[key].trim()) form[key]=r.form_data[key];
        form.is_form_complete = Boolean(form.dia_chi_lay_hang && form.dia_chi_giao_hang && form.thong_tin_hang && form.thoi_gian_giao_nhan && r.is_form_complete);
        form.missing_fields=r.missing_fields || []; emit('customer',r.reply_to_customer);
        if (form.is_form_complete) {session.partner='DCE';wait('DCE');emit('DCE',formText());} break;
      }
      case 'CLARIFYING_FOR_DCE': case 'CLARIFYING_FOR_CSDT': {
        const r=await nlp.customerClarification({message:text,staffType:partner,form,existingAdditionalInfo:form.thong_tin_bo_sung}); form.thong_tin_bo_sung=r.updated_additional_info || form.thong_tin_bo_sung; emit(partner,r.translated_to_staff || text); wait(partner); break;
      }
      case 'QUOTED_WAITING_CUSTOMER': {
        const r=await nlp.customerQuoteResponse({message:text,quotePartner:partner,form});
        if(r.decision==='ACCEPT'){emit(partner,r.message_to_partner || 'Khách xác nhận báo giá.');emit('customer','Anh/chị cho em xin số điện thoại người nhận hàng ạ.');session.state='COLLECTING_RECIPIENT_PHONE';session.followUp=false;}
        else if(r.decision==='DECLINE'){emit('customer',r.reply_to_customer);session.state='CUSTOMER_DECLINED';session.followUp=false;}
        else {emit(partner,r.translated_to_staff || text);session.followUp=true;wait(partner);} break;
      }
      case 'COLLECTING_RECIPIENT_PHONE': case 'COLLECTING_SENDER_PHONE': {
        const recipient=session.state==='COLLECTING_RECIPIENT_PHONE'; const r=await nlp.extractPhone({message:text,phoneRole:recipient?'recipient':'sender'});
        if(!r.is_valid || !r.phone_number){emit('customer',r.reply_if_invalid || 'Anh/chị kiểm tra lại số điện thoại ạ.');break;}
        if(recipient){form.sdt_nguoi_nhan=String(r.phone_number);emit(partner,`SĐT người nhận: ${form.sdt_nguoi_nhan}`);emit('customer','Anh/chị cho em xin số điện thoại người gửi ạ.');session.state='COLLECTING_SENDER_PHONE';}
        else {form.sdt_nguoi_gui=String(r.phone_number);emit(partner,`SĐT người gửi: ${form.sdt_nguoi_gui}`);emit('customer','Người gửi hay người nhận thanh toán ạ?');session.state='COLLECTING_PAYMENT_PARTY';}break;
      }
      case 'COLLECTING_PAYMENT_PARTY': {
        const r=await nlp.extractPaymentParty({message:text});if(!r.is_valid || !r.payment_party){emit('customer',r.reply_if_invalid || 'Người gửi hay người nhận thanh toán ạ?');break;}form.ben_thanh_toan=r.payment_party;emit(partner,r.payment_party);emit('customer','Thanh toán lúc gửi hay sau khi nhận hàng ạ?');session.state='COLLECTING_PAYMENT_TIME';break;
      }
      case 'COLLECTING_PAYMENT_TIME': {
        const r=await nlp.extractPaymentTime({message:text});if(!r.is_valid || !r.payment_time){emit('customer',r.reply_if_invalid || 'Thanh toán lúc gửi hay sau khi nhận hàng ạ?');break;}form.thoi_diem_thanh_toan=r.payment_time;emit(partner,`${r.payment_time}. Anh/chị cho em xin SĐT tài xế.`);emit('customer','Em đang chờ số điện thoại tài xế ạ.');session.state=partner==='DCE'?'WAITING_DRIVER_PHONE_DCE':'WAITING_DRIVER_PHONE_CSDT';break;
      }
      default: emit('customer','Phiên đang chờ xử lý hoặc đã kết thúc.');
    }
  } else {
    if (from!==partner) throw new Error('Actor does not match active partner');
    if (session.state === `WAITING_DRIVER_PHONE_${from}`) {
      const r=await nlp.extractPhone({message:text,phoneRole:'driver'});
      if(!r.is_valid || !r.phone_number)emit(from,r.reply_if_invalid || 'Vui lòng cung cấp SĐT tài xế hợp lệ.');
      else {form.sdt_tai_xe=String(r.phone_number);emit('customer',`Số điện thoại tài xế: ${form.sdt_tai_xe}`);session.state='COMPLETED';}
    } else if(session.state === `WAITING_${from}`) {
      const r=await nlp.staff({message:text,staffType:from,form,isPostQuoteFollowUp:session.followUp,additionalInfo:form.thong_tin_bo_sung});
      if(r.intent==='REJECT'){if(from==='DCE'){session.partner='CSDT';session.followUp=false;wait('CSDT');emit('CSDT',formText());}else {session.state='REJECTED';emit('customer',r.translated_message_for_customer || 'Hiện chưa có đối tác nhận đơn.');}}
      else if(r.intent==='NEED_MORE_INFO'){clarify(from);emit('customer',r.translated_message_for_customer || r.clarification_question);}
      else if(r.intent==='QUOTE'){session.state='QUOTED_WAITING_CUSTOMER';session.followUp=false;emit('customer',r.translated_message_for_customer || r.quote_details);}
      else throw new Error('Unsupported partner intent');
    } else throw new Error('Not waiting for partner response');
  }
  return {session,messages};
}
