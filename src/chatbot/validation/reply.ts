import { norm, includesSpan } from './field-check';
import type { ReplyContext } from '../chains/types';
export function validateReply(value:unknown,ctx:ReplyContext):{ok:boolean;reason:string;reply:string}{
 const reply=typeof value==='string'?value.trim():'';const bad=(reason:string)=>({ok:false,reason,reply:''});
 if(!reply||reply.length>850||/[{}]|```|<think>|system prompt|nextAction|EXTRACTED/i.test(reply))return bad('REPLY_FORMAT');
 if(reply===ctx.referenceReply)return {ok:true,reason:'CANONICAL_REPLY',reply};
 if(/(?:\d[\d.,]*\s*(?:đồng|vnd|vnđ|k\b|triệu)|miễn phí|cam kết|đảm bảo|đã\s+(?:chốt|xác nhận đơn|lên đơn|điều phối|thanh toán|gửi yêu cầu|đặt xe|chuyển khoản)|sẽ\s+(?:bồi thường|hoàn tiền)|https?:\/\/)/iu.test(reply))return bad('REPLY_UNVERIFIED_CLAIM');
 // Never use the unverified raw message to whitelist a factual assertion.
 const known=norm(JSON.stringify(ctx.currentInfo)+' '+ctx.referenceReply);
 const knownNumbers=new Set(known.match(/\d+(?:[.,]\d+)?/g)||[]);
 for(const n of reply.match(/\d+(?:[.,]\d+)?/g)||[])if(!knownNumbers.has(n))return bad('REPLY_NEW_NUMBER');
 const claimsUpdate=/(?:đã|vừa)\s+(?:lưu|ghi nhận|nhận đủ|cập nhật|thêm|đổi|sửa)/iu.test(reply);
 const extracted=(ctx.extractedData||{}) as Record<string,any>;
 // Acknowledgements about committed data may not refer to rejected fields or to fields omitted from the commit.
 if(claimsUpdate){
   if(ctx.nextAction==='CLARIFY'||!Object.keys(extracted).length)return bad('REPLY_UNCOMMITTED_UPDATE');
   const labels:Record<string,RegExp>={pickup:/địa chỉ lấy|điểm lấy|lấy hàng/iu,destination:/địa chỉ giao|điểm giao|giao hàng/iu,cargo:/hàng gửi|mặt hàng|kiện|loại hàng/iu,weight:/khối lượng|cân nặng|\d+\s*(?:kg|cân)/iu,deliveryTime:/thời gian|ngày kia|ngày mai|lấy hàng vào/iu,senderName:/người gửi/iu,receiverName:/người nhận/iu};
   // Check only the assertion clause, not the subsequent question.
   const assertion=reply.split(/[.!?\n]/u)[0];
   for(const [field,pattern] of Object.entries(labels))if(pattern.test(assertion)&&!extracted[field]&&field!=='pickup'&&field!=='destination'){
     // Address roles may be represented by the neutral address field.
     if((field==='cargo'||field==='weight')&&Array.isArray(extracted.items))continue;
     if(field==='senderName'&&extracted.senderPhone||field==='receiverName'&&extracted.receiverPhone||field==='cargo'&&(extracted.weight||extracted.dimensions))continue;
     return bad('REPLY_UNCOMMITTED_FIELD');
   }
   for(const field of ['pickup','destination'] as const)if(labels[field].test(assertion)&&!extracted[field]&&!extracted.address&&!(field==='pickup'&&extracted.deliveryTime))return bad('REPLY_UNCOMMITTED_FIELD');
   // Require any specific named value in the acknowledgement to be derived from an accepted span.
   if(!Object.values(extracted).some(v=>typeof v==='string'&&includesSpan(assertion,v)||Array.isArray(v)&&v.some(i=>includesSpan(assertion,i.name)||includesSpan(assertion,i.weight)))&&!/^(?:dạ\s+)?(?:em|bên em)\s+đã\s+(?:ghi nhận|lưu|cập nhật)\s+(?:thông tin|yêu cầu)(?:\s+(?:rồi|ạ|nhé))*$/iu.test(assertion.trim()))return bad('REPLY_UNGROUNDED_ACK');
 }
 const fields:Record<string,RegExp>={sender_address:/lấy hàng|địa chỉ lấy|điểm lấy|gửi từ|phường|xã/iu,receiver_address:/giao hàng|địa chỉ giao|điểm giao|giao đến|giao tới|gửi đến|gửi tới/iu,cargo_info:/loại hàng|mặt hàng|kiện|cân nặng|khối lượng|kích thước|nặng|hàng gì/iu,delivery_time:/thời gian|khi nào|lúc nào|bao giờ|mấy giờ|ngày nào|hôm nào/iu,sender_name:/tên (?:của )?(?:người gửi|anh|chị)/iu,sender_phone:/(?:sđt|số điện thoại).*(?:người gửi|anh|chị)/iu,receiver_name:/tên.*người nhận/iu,receiver_phone:/(?:sđt|số điện thoại).*người nhận/iu};
 if(ctx.nextAction==='ASK_FIELD'&&ctx.nextField&&fields[ctx.nextField]&&!fields[ctx.nextField].test(reply))return bad('REPLY_WRONG_FIELD');
 // Do not let either model reintroduce mandatory ward wording. The draft resolver decides readiness.
 if(ctx.nextAction==='ASK_FIELD'&&['sender_address','receiver_address'].includes(ctx.nextField||'')&&/(?:chi tiết đến|kèm|đầy đủ|cụ thể đến)\s+(?:phường|xã)/iu.test(reply))return {ok:true,reason:'CANONICAL_ADDRESS_REPLY',reply:ctx.referenceReply};
 if(ctx.nextAction==='CONFIRM_FORM'&&!/xác nhận|kiểm tra|đúng không/iu.test(reply))return bad('REPLY_CONFIRM_REQUIRED');
 if(ctx.nextAction==='CLARIFY'){
   if(claimsUpdate||!/(?:cụ thể|nói rõ|cho em hỏi|xác nhận|chưa rõ|chưa có|chưa hiểu|liên hệ|hỗ trợ|\?)/iu.test(reply))return bad('REPLY_CLARIFICATION_REQUIRED');
   // Unsupported mutations are not an opportunity to make an unverified business promise.
   if(ctx.currentInfo?.pendingOperation||ctx.operation==='REMOVE'||ctx.currentInfo?.isConfirmed)return bad('REPLY_USE_CANONICAL_CLARIFICATION');
   if(/(?:có hỗ trợ|chắc chắn|có thể gửi thêm|được nhé|được ạ|sẽ đến|sẽ lấy)/iu.test(reply))return bad('REPLY_UNVERIFIED_CLAIM');
 }
 return {ok:true,reason:'REPLY_VALIDATED',reply};
}
