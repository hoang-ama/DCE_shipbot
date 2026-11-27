import { SUPPORT_MESSAGE } from '../../shared/support-message';
import { smartExtractVietnamese, detectCargoCategory, detectDeliveryTime, reverseGeocodeAddress, ADDR_KEYWORD_REGEX, cleanAddressText, isNotValidAddress, evaluateCompleteness, chooseNextQuestionKey, countKeyAsksInHistory, generateNaturalVietnameseReply, formatOrderConfirmationForm, cleanResponseText, normalizeForDedup, isCustomerConfirmation, ORDER_CONFIRMATION_CLOSING_PHRASE, generateTrackingCode } from '../extraction/express';
import { baseInfo, norm, roleFor, semanticReview, stripPoliteTail, validateRuleFields, weightPattern, dimensionPattern, cargoText, operationFor, cargoItemsFromMessage, resolveAddressForDraft, type ExtractionCheck } from '../validation/field-check';
import type { Entities } from '../validation/field-schema';
import type { ChatResult } from './fast-path';

const fillers=/^(?:(?:anh|chị|em|tôi|mình|bên|bạn|cho|giúp|hộ|xin|muốn|cần|chỉ|gửi|thêm|nữa|chuyển|ship|hàng|kiện|thùng|là|loại|mặt|tên|nặng|khối|lượng|kích|thước|lấy|giao|nhận|qua|vào|lúc|khoảng|tầm|ở|tại|từ|đến|tới|về|xuống|lên|sang|ra|và|thôi|nhé|nhá|nha|ạ|đi|rồi|có|một|cái|bộ|em|anh|chị|này|đó|đấy|luôn)(?:\s+|$))*$/u;
function smallestSpan(text:string, test:(span:string)=>boolean):string|undefined {
 const words=[...text.matchAll(/[\p{L}\p{N}]+(?:[./:-][\p{L}\p{N}]+)*/gu)];
 for(let n=1;n<=Math.min(10,words.length);n++)for(let i=0;i+n<=words.length;i++){
  const last=words[i+n-1], span=text.slice(words[i].index!,last.index!+last[0].length);if(test(span))return span;
 }return undefined;
}
export function ruleExtract(message:string,history:any[],current:any){
 const info=baseInfo(current), entities:Entities={};
 if(message.length>6000){const raw={status:'AMBIGUOUS',entities};return {smart:{},raw,checked:validateRuleFields(raw,message,history,info),ok:false,reason:'RULE_INPUT_TOO_LONG',remaining:'',info};}
 const smart=smartExtractVietnamese(message,info);
 const cargoMessage=cargoText(message);
 const category=detectCargoCategory(cargoMessage), time=detectDeliveryTime(message);
 const weights=[...message.matchAll(weightPattern)],dims=[...message.matchAll(dimensionPattern)];
 if(weights.length===1)entities.weight=weights[0][0];if(dims.length===1)entities.dimensions=dims[0][0];
 // Use the original DCE category/time detectors, but attach evidence from this turn.
 const items=cargoItemsFromMessage(message);if(items){entities.items=items;delete entities.weight;}
 if(category&&!items){const span=smallestSpan(cargoMessage,v=>detectCargoCategory(v)===category);if(span)entities.cargo=span;}
 if(time){const cleaned=stripPoliteTail(message);const clock=cleaned.match(/(?:tầm\s+|khoảng\s+)?\d{1,2}(?:h|\s*giờ)(?:\s*\d{1,2}(?:p|phút)?)?\s*(?:sáng|trưa|chiều|tối)?\s*(?:ngày mai|ngày kia|ngày mốt|hôm nay|mai|nay)/iu);const span=clock?.[0]??smallestSpan(message,v=>norm(detectDeliveryTime(v))===norm(time));if(span)entities.deliveryTime=span;}
 const notes=message.match(/dễ vỡ|bảo quản mát|đông lạnh/iu);if(notes)entities.notes=notes[0];
 // Find raw address spans, never accept an arbitrary sentence as an address just because a slot is empty.
 const addressEvidence=(v:string)=>!isNotValidAddress(v)&&![...v.matchAll(weightPattern)].length&&![...v.matchAll(dimensionPattern)].length&&!detectDeliveryTime(v)&&(ADDR_KEYWORD_REGEX.test(v)||reverseGeocodeAddress(v).hasWardCommune||/(?:^|,\s*)(?:hà nội|hải phòng|đà nẵng|hồ chí minh|tp\.?\s*hcm|cần thơ|huế|quảng ninh|bắc ninh|hưng yên|nam định|hải dương|thái bình|nghệ an|thanh hóa)$/iu.test(v));
 const tidy=(v:string)=>stripPoliteTail(v);
 const routes=message.match(/(?:^|\s)(?:từ|lấy(?:\s+hàng)?(?:\s+(?:ở|tại))?)\s+(.+?)\s+(?:giao(?:\s+(?:đến|tới|ở|tại))?|đến|tới|về|xuống|lên|sang)\s+(.+)$/iu);
 const addAddress=(v:string)=>{const raw=tidy(v);if(!addressEvidence(raw))return;const role=roleFor(message,raw,info);if(role)entities[role==='sender'?'pickup':'destination']=raw;};
 if(routes){addAddress(routes[1]);addAddress(routes[2]);}
 else {
  const single=message.match(/(?:^|\s)(?:từ|lấy(?:\s+(?:giúp|hộ)\s+(?:anh|chị|em|tôi))?(?:\s+hàng)?(?:\s+(?:ở|tại))?|giao(?:\s+(?:giúp|hộ)\s+(?:anh|chị|em|tôi))?(?:\s+hàng)?(?:\s+(?:ở|tại|đến|tới))?|gửi(?:\s+cho\s+(?:anh|chị|em|tôi|mình))?\s+(?:tại|đến|tới|về)|đến|tới|địa chỉ (?:lấy|giao)(?: hàng)?)\s+(.+)$/iu);
  const explicit=message.match(/(?:^|\s)(?:lấy(?:\s+(?:giúp|hộ)\s+(?:anh|chị|em|tôi|mình))?(?:\s+hàng)?(?:\s+(?:ở|tại|từ))?|giao(?:\s+(?:giúp|hộ)\s+(?:anh|chị|em|tôi|mình))?(?:\s+hàng)?(?:\s+(?:ở|tại|đến|tới))?|(?:địa chỉ|điểm)\s+(?:lấy|giao)(?:\s+hàng)?(?:\s+là)?)\s+(.+)$/iu);
  if(explicit)addAddress(explicit[1]);
  else if(single)addAddress(single[1]);
  else if(info.nextMissingKey==='sender_address'||info.nextMissingKey==='receiver_address')addAddress(message.trim());
 }
 // Address clauses may contain category/time-like street names. Do not infer cargo from an address.
 for(const key of ['cargo','deliveryTime'] as const)if(entities[key]&&[entities.pickup,entities.destination].some(a=>a&&norm(a).includes(norm(entities[key]))))delete entities[key];
 for(const m of message.matchAll(/(?:\+84|0)\d(?:[\s.-]?\d){8}\b/gu)){const role=roleFor(message,m[0],info,'phone');if(role)entities[role==='sender'?'senderPhone':'receiverPhone']=m[0];}
 for(const side of ['sender','receiver'] as const){const name=smart[side]?.name;if(typeof name==='string'&&name&&norm(name)!==norm(info[side]?.name)&&norm(message).includes(norm(name))&&roleFor(message,name,info,'name')===side)entities[`${side}Name`]=name;}
 const raw={status:'EXTRACTED',operation:operationFor(message),entities}; const checked=validateRuleFields(raw,message,history,info);
 let rest=norm(stripPoliteTail(message));for(const v of Object.values(checked.accepted).flatMap(v=>Array.isArray(v)?v.flatMap(i=>[i.name,i.weight]):[v]).sort((a,b)=>b.length-a.length))rest=rest.replace(norm(v),' ');
 rest=rest.replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const booking=/^(?:(?:anh|chị|em|tôi|mình)\s+)?(?:(?:muốn|cần)\s+)?(?:gửi hàng|chuyển hàng|ship hàng|chuyển phát)(?:\s+(?:ạ|nhé|nha))?[.!]?$/iu.test(message.trim());
 const simple=((!semanticReview(message)||checked.operation==='ADD'&&!!checked.accepted.items)&&['SET','UPDATE','ADD'].includes(checked.operation||'')&&checked.ok&&fillers.test(rest))||booking;
 // Smart extractor is kept for diagnostics and parity checks; never commit unverified guesses.
 return {smart,raw,checked,ok:simple,reason:simple?'RULE_VALIDATED':semanticReview(message)?'NEEDS_SEMANTIC_REVIEW':checked.ok?'UNHANDLED_TEXT':checked.reason,remaining:rest,info:booking?info:checked.info};
}
export function confirmRule(message:string,current:any):ChatResult|null{
 if(current?.isConfirmed||current?.pendingOperation||!current?.isComplete||!evaluateCompleteness(current,true).isComplete||!(isCustomerConfirmation(message)||/^(?:gửi|cho)\s+(?:anh\s+|chị\s+|em\s+)?(?:thông tin\s+)?giá tiền/iu.test(message))||/không|nhầm|sửa|thay đổi|đổi|\?/iu.test(message))return null;
 // Do not let a mixed message containing new order data silently confirm old data.
 if([...message.matchAll(weightPattern)].length||ADDR_KEYWORD_REGEX.test(message)||detectDeliveryTime(message))return null;
 return {reply:ORDER_CONFIRMATION_CLOSING_PHRASE,shippingInfo:{...current,isComplete:true,isConfirmed:true,trackingCode:current.trackingCode||generateTrackingCode()},quickReplies:[]};
}
export function planReply(info:any,history:any[],message:string,clarify=false,check?:Pick<ExtractionCheck,'reason'|'rejected'|'operation'|'accepted'>){
 const clean=baseInfo(info);delete clean._invalidSenderPhone;delete clean._invalidReceiverPhone;
 for(const side of ['sender','receiver'] as const)if(clean[side].address&&clean[side].addressReady===undefined&&!clean[side].hasWardCommune)Object.assign(clean[side],resolveAddressForDraft(clean[side].address));
 const operation=check?.operation??operationFor(message);
 const rejected=check?.rejected??{};
 if(operation==='ADD'&&check?.reason==='MULTI_CARGO_UNSUPPORTED')clean.pendingOperation='ADD';
 if(operation==='UPDATE'&&!clarify&&check?.reason!=='MULTI_CARGO_UNSUPPORTED'&&/(?:quần áo|hoa quả|kiện|hàng|\d+\s*(?:kg|cân|g|tấn))/iu.test(message))delete clean.pendingOperation;
 const evaluation=evaluateCompleteness(clean,true);
 // Keep the original four-field quote/confirmation readiness contract.
 const key=evaluation.missingKeys?.[0] ?? chooseNextQuestionKey(evaluation,history,message); // question order is not a validation requirement
 const contacts:Record<string,string>={sender_name:'Anh/chị cho em xin tên người gửi ạ?',sender_phone:'Anh/chị cho em xin số điện thoại người gửi ạ?',receiver_name:'Anh/chị cho em xin tên người nhận ạ?',receiver_phone:'Anh/chị cho em xin số điện thoại người nhận ạ?'};
 const repeats=key?(countKeyAsksInHistory(history)[key]||0):0;
 let nextAction=clarify||clean.pendingOperation?'CLARIFY':evaluation.isComplete?'CONFIRM_FORM':'ASK_FIELD';
 let reply=nextAction==='CONFIRM_FORM'?formatOrderConfirmationForm(clean):contacts[key||'']||({sender_address:'Anh/chị cho em xin địa chỉ hoặc điểm lấy hàng cụ thể nhé?',receiver_address:'Anh/chị muốn giao hàng đến địa chỉ nào ạ?',delivery_time:'Anh/chị muốn bên em lấy hàng vào thời gian nào ạ?'} as Record<string,string>)[key||'']||cleanResponseText(generateNaturalVietnameseReply(clean,key,repeats));
 if(nextAction==='CLARIFY'){
   if(clean.pendingOperation==='ADD'||check?.reason==='MULTI_CARGO_UNSUPPORTED')reply='Anh/chị cho em xin khối lượng của hàng đang có trước khi thêm hàng mới, hoặc xác nhận muốn thay thế hàng cũ nhé ạ.';
   else if(check?.reason==='CONFIRMED_ORDER_REQUIRES_STAFF')reply='Đơn đã xác nhận. Anh/chị vui lòng liên hệ nhân viên để kiểm tra yêu cầu thay đổi ạ.';
   else if(Object.keys(rejected).some(k=>['pickup','destination','address'].includes(k)))reply='Anh/chị xác nhận giúp em địa chỉ lấy hoặc giao hàng chính xác nhé. Em chưa cập nhật phần địa chỉ chưa rõ ạ.';
   else if(Object.keys(rejected).some(k=>/name|phone|contact/i.test(k)))reply='Anh/chị cho em xác nhận lại tên và số điện thoại tương ứng của người gửi hoặc người nhận nhé ạ.';
   else if(Object.keys(rejected).some(k=>/time/i.test(k)))reply='Anh/chị xác nhận giúp em thời gian muốn lấy hoặc giao hàng nhé ạ.';
   else if(Object.values(rejected).includes('ITEM_TARGET_REQUIRED'))reply='Anh/chị muốn sửa khối lượng của loại hàng nào, hay thay thế toàn bộ danh sách hàng ạ?';
   else if(Object.keys(rejected).some(k=>/cargo|weight|dimension|items/i.test(k)))reply='Anh/chị nói rõ giúp em tên hàng và khối lượng muốn gửi, hoặc thông tin nào cần thay đổi nhé ạ.';
   else reply=SUPPORT_MESSAGE;
 }
 if(nextAction==='ASK_FIELD'&&check?.accepted?.items?.length){const items=clean.cargo.items||[];reply=`Dạ em ghi nhận ${items.map((i:any)=>`${i.weight} ${i.name}`).join(' và ')} (tổng ${clean.cargo.weightKg} kg). ${reply}`;}
 const last=history.filter(h=>['model','assistant','bot'].includes(h.role||h.sender)).at(-1);
 if(nextAction==='ASK_FIELD'&&last&&normalizeForDedup(reply)===normalizeForDedup(String(last.content||last.text||'')))reply=key==='sender_address'?'Anh/chị có thể gửi tên đường, địa điểm hoặc vị trí trên bản đồ giúp em nhé.':key==='receiver_address'?'Anh/chị cho em xin nơi nhận hàng, hoặc gửi vị trí trên bản đồ nhé.':cleanResponseText(generateNaturalVietnameseReply(clean,key,repeats+1));
 // Preserve the original four-field completeness metric, but block new order creation while clarification is pending.
 const updatedInfo={...clean,...evaluation,nextMissingKey:nextAction==='CLARIFY'?evaluation.nextMissingKey:key,nextQuestion:reply,nextAction,nextField:nextAction==='CLARIFY'?undefined:key,isComplete:nextAction==='CONFIRM_FORM',isConfirmed:Boolean(clean.isConfirmed)};
 return {updatedInfo,nextAction,key:nextAction==='CLARIFY'?undefined:key,reply};
}
