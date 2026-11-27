import { entityKeys, operations, type Entities, type EntityKey, type Operation, type CargoItemEvidence } from './field-schema';
import { cleanAddressText, cleanPhoneNumber, detectCargoCategory, detectDeliveryTime, isGenericCargoWord, isNotValidAddress, isValidVNPhone, reverseGeocodeAddress } from '../extraction/express';
import { VN_PROVINCES, removeVietnameseDiacritics } from '../../shared/data/vnAdministrative';
export const norm = (v:unknown) => String(v??'').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/gu,' ').trim();
export const weightPattern = /(?:(?:chưa\s*(?:đến|tới)|dưới|<|khoảng|tầm|hơn|>)\s*)?\d+(?:[.,]\d+)?\s*(?:kilogram|kilo|kg|cân|lạng|gram|g|tạ|yến|tấn)(?![\p{L}\d])/giu;
export const dimensionPattern = /\d+\s*[xX*×]\s*\d+\s*[xX*×]\s*\d+(?:\s*cm)?/giu;
export const phonePattern = /(?:\+84|0)\d(?:[\s.-]?\d){8}\b/gu;
export function weightKg(text:string):number|null {
 const m=text.trim().match(/^(?:(?:chưa\s*(?:đến|tới)|dưới|<|khoảng|tầm|hơn|>)\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilogram|cân|lạng|g|gram|tạ|yến|tấn)$/iu);
 if(!m)return null; const units:Record<string,number>={kg:1,kilo:1,kilogram:1,cân:1,lạng:.1,g:.001,gram:.001,tạ:100,yến:10,tấn:1000};
 const n=Number(m[1].replace(',','.'))*units[m[2].toLowerCase()];return Number.isFinite(n)&&n>0?n:null;
}
export function baseInfo(current:any){const i=structuredClone(current||{});i.sender={name:'',phone:'',address:'',hasWardCommune:false,...i.sender};i.receiver={name:'',phone:'',address:'',hasWardCommune:false,...i.receiver};i.cargo={name:'',weight:'',weightKg:null,category:'Bưu phẩm / Hàng tiêu dùng',specialNotes:'',...i.cargo,dimensions:{length:null,width:null,height:null,raw:'',...i.cargo?.dimensions}};i.deliveryTime=i.deliveryTime||'';return i;}
export const stripPoliteTail=(s:string)=>s.replace(/(?:\s+(?:có\s+)?được\s+không(?:\s+(?:em|anh|chị|ạ|nhỉ|nhé))*)[.!?]*$/iu,'').replace(/(?:\s+(?:nhé|nhá|nhế|nha|ạ|em|thôi))+[.!?]*$/iu,'').replace(/[.!?]+$/u,'').trim();
export const semanticReview=(s:string)=>/(?:\?|không\s+(?:phải|đúng|gửi|cần|biết|nhớ|được)|chưa\s+(?:biết|rõ|chắc)|hay là|hoặc là|giống (?:hôm|lần|đơn)|như (?:cũ|trước)|hủy|hoàn tiền|bồi thường|hỏng|khiếu nại|báo giá|giá cước|bao nhiêu|phí|thanh toán|chuyển khoản|hóa đơn|vat|thuê xe|đặt xe|du lịch|tour|sửa|nhầm|thay đổi|đổi (?:lại|sang|thành|địa chỉ|giờ)|gửi thêm|chính sách|https?:\/\/)/iu.test(stripPoliteTail(s));
export const correction=(s:string)=>/(?:sửa|nhầm|không phải|không đúng|thay đổi|đổi (?:lại|sang|thành|địa chỉ|giờ))/iu.test(s);
export function operationFor(message:string,proposed?:unknown):Operation {
 const s=norm(message);
 if(/(?:hay là|hoặc là|giống (?:hôm|lần|đơn)|như (?:cũ|trước))/u.test(s))return 'CLARIFY';
 if(/(?:không phải|không đúng|nhầm)/u.test(s))return proposed==='UPDATE'?'UPDATE':'CLARIFY';
 if(proposed==='CANCEL_PENDING')return 'CANCEL_PENDING';
 if(/(?:gửi|thêm|bổ sung)\s+thêm|gửi thêm|thêm\s+(?:\d|kiện|thùng|gói)|bổ sung\s+(?:\d|kiện|hàng)/u.test(s))return 'ADD';
 if(/(?:bỏ|bớt|loại bỏ)\s+(?:kiện|hàng|\d)|hủy/u.test(s))return 'REMOVE';
 if(/(?:sửa|thay đổi|đổi|chỉnh lại)[^?]{0,100}(?:sang|thành|là)\s+[^?]+/u.test(s))return 'UPDATE';
 if(/(?:báo giá|giá tiền|giá cước|bao nhiêu|phí|bồi thường|hỏng|khiếu nại|chính sách|thanh toán|chuyển khoản|hóa đơn|vat|thuê xe|đặt xe|du lịch|tour)/u.test(s))return 'QUESTION';
 return operations.includes(proposed as Operation)?proposed as Operation:'SET';
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function includesSpan(message:string,value:string){const m=norm(message),v=norm(value);if(!v)return false;let p=m.indexOf(v);while(p>=0){if(!(/[\p{L}\d]/u.test(v[0]||'')&&/[\p{L}\d]/u.test(m[p-1]||''))&&!(/[\p{L}\d]/u.test(v.at(-1)||'')&&/[\p{L}\d]/u.test(m[p+v.length]||'')))return true;p=m.indexOf(v,p+1);}return false;}
export function cargoText(message:string){return message.replace(/(?:số\s+điện\s+thoại|sđt|sdt|gọi\s+điện\s+thoại|liên\s+hệ\s+(?:qua\s+)?điện\s+thoại)/giu,' ').replace(phonePattern,' ');}
export function roleFor(message:string,span:string,current:any,kind:'address'|'phone'|'name'='address'):'sender'|'receiver'|null {
 const m=norm(message),v=norm(span),p=m.indexOf(v);if(p<0)return null;
 const pre=m.slice(0,p).trimEnd();
 if(kind==='address'&&/^(?:lấy(?: hàng)?|giao(?: hàng)?)\s+(?:tại|ở|từ|đến|tới)\s+/u.test(v))return /^lấy/u.test(v)?'sender':'receiver';
 if(kind!=='address'){
   // The closest explicit party marker is stronger evidence than the previous asked slot.
   const markers=[...pre.matchAll(/người\s+(gửi|nhận)|bên\s+(gửi|nhận)|(?:sđt|số điện thoại|tên)\s+(gửi|nhận)|(?:^|[,.;]\s*)(?:anh|chị|em|tôi|mình)\s+(?:là|tên(?: là)?)/gu)];
   const last=markers.at(-1);if(last&&pre.length-(last.index??0)<160)return (last[1]||last[2]||last[3])==='nhận'?'receiver':'sender';
   if(/(?:số điện thoại|sđt|tên)\s+(?:của\s+)?(?:anh|chị|em|tôi|mình)(?:\s+là)?\s*[:：]?$/u.test(pre))return 'sender';
   const key=current?.nextMissingKey;if(key===`sender_${kind}`)return 'sender';if(key===`receiver_${kind}`)return 'receiver';
   return null;
 }
 if(/(?:đổi|sửa|thay đổi|chỉnh lại)[^,.;]{0,30}(?:địa chỉ lấy|điểm lấy)[^,.;]{0,20}(?:sang|thành|là)\s*$/u.test(pre))return 'sender';
 if(/(?:gửi|chuyển)\s+(?:cho\s+(?:anh|chị|em|tôi|mình)\s+)?(?:tại|đến|tới|về)\s*$/u.test(pre))return 'receiver';
 if(/(?:đổi|sửa|thay đổi|chỉnh lại)[^,.;]{0,30}(?:địa chỉ giao|điểm giao)[^,.;]{0,20}(?:sang|thành|là)\s*$/u.test(pre))return 'receiver';
 const sender=/(?:^|\s)(?:từ|lấy(?:\s+(?:giúp|hộ)\s+(?:anh|chị|em|tôi))?(?:\s+hàng)?(?:\s+(?:ở|tại))?|(?:địa chỉ|điểm) lấy(?: hàng)?(?: là)?)\s*[:：]?$/u;
 const receiver=/(?:^|\s)(?:đến|tới|về|xuống|lên|sang|ra|vào|giao(?:\s+(?:giúp|hộ)\s+(?:anh|chị|em|tôi))?(?:\s+hàng)?(?:\s+(?:ở|tại|đến|tới))?|(?:địa chỉ|điểm) giao(?: hàng)?(?: là)?)\s*[:：]?$/u;
 if(sender.test(pre))return 'sender';if(receiver.test(pre))return 'receiver';
 if(stripPoliteTail(m)===v||/^(?:ở|tại|là)\s*$/u.test(pre)){if(current?.nextMissingKey==='sender_address')return 'sender';if(current?.nextMissingKey==='receiver_address')return 'receiver';}
 return null;
}
export function provinceOf(s:string){const n=norm(s);return VN_PROVINCES.find(p=>p.aliases.some(a=>a.length>=4&&(n===norm(a)||n.endsWith(', '+norm(a))||n.endsWith(' thành phố '+norm(a))||n.endsWith(' tỉnh '+norm(a))||n.endsWith(', thành phố '+norm(a))||n.endsWith(', tỉnh '+norm(a))||n===`thành phố ${norm(a)}`||n===`tỉnh ${norm(a)}`||n.endsWith(' '+norm(a)))))?.standardName||'';}
function addressTokens(s:string){return removeVietnameseDiacritics(s).replace(/\b(?:so nha|thanh pho|quan|huyen|phuong|thi tran|tinh|xa|tp)\b/g,' ').split(/[^a-z0-9]+/).filter(Boolean);}
export function addressRefines(old:string,next:string){
 if(!old)return true;const a=addressTokens(old),b=addressTokens(next);if(!a.length||!b.length)return false;
 const oldCity=provinceOf(old),newCity=provinceOf(next);if(oldCity&&newCity&&oldCity!==newCity)return false;
 // Refinement must preserve all old address tokens in order, including house number.
 let i=0;for(const t of b)if(t===a[i])i++;return i===a.length;
}
function explicitWardOf(s:string){return /(?:^|[\s,])(?:phường|xã|thị trấn|p\.|x\.)\s+[\p{L}\d]/iu.test(s);}
function addWard(old:string,part:string){
 if(!old||explicitWardOf(old)||!explicitWardOf(part)||/(?:^|[\s,])(?:phố|đường|ngõ|ngách|số nhà|quận|huyện)\s/iu.test(part))return null;
 const oldCity=provinceOf(old),newCity=provinceOf(part);if(oldCity&&newCity&&oldCity!==newCity)return null;
 const ward=part.split(',')[0].trim();if(!/^(?:phường|xã|thị trấn|p\.|x\.)\s+/iu.test(ward))return null;
 const parts=old.split(',').map(x=>x.trim());const index=parts.findIndex(x=>/^(?:quận|huyện|thành phố|tỉnh)\s/iu.test(x)||provinceOf(x));
 parts.splice(index<0?parts.length:index,0,ward);if(newCity&&!oldCity)parts.push(newCity);return parts.join(', ');
}
// Anchor relative days in Vietnam time without inventing an hour or overwriting the raw phrase.
export function relativeDate(text:string,now=new Date()):string|undefined{
 const s=norm(text);if(/(?:hoặc|hay là|sang hôm sau)/u.test(s))return undefined;const offset=/(?:ngày kia|ngày mốt)/u.test(s)?2:/(?:ngày mai|sáng mai|trưa mai|chiều mai|tối mai|^mai$)/u.test(s)?1:/(?:hôm nay|trong ngày|sáng nay|chiều nay|tối nay)/u.test(s)?0:undefined;
 if(offset===undefined)return undefined;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const n=(k:string)=>Number(parts.find(p=>p.type===k)?.value);return new Date(Date.UTC(n('year'),n('month')-1,n('day')+offset)).toISOString().slice(0,10);
}
// Original DCE reverse geocoder is retained as a lookup, not allowed to erase a gate,
// house number or an explicitly supplied ward. Legacy lookup data can be historical.
export function resolveAddressForDraft(raw:string){
 const clean=cleanAddressText(stripPoliteTail(raw)).replace(/^(?:cho|giúp|hộ)\s+(?:anh|chị|em|tôi|mình)\s+(?:tại|ở|đến|tới|về)\s+/iu,''); const geo=reverseGeocodeAddress(clean);
 const explicit=explicitWardOf(clean); const city=provinceOf(clean)||provinceOf(geo.address);
 const specific=Boolean(city&&/(?:\d+\s*(?:[a-z]\s*)?(?:phố|đường|ngõ|ngách)|(?:số nhà|cổng|thôn|xóm|tòa|chung cư|bến xe|trường|đại học|bệnh viện)\s+|(?:phố|đường)\s+[^,]+)/iu.test(clean));
 // A lookup may return a district center rather than the actual pickup. Keep raw as primary.
 const genericCenter=/^khu vực\s/iu.test(geo.address);
 const broad=/^(?:quận|huyện|thành phố|tỉnh|thị xã)\s+/iu.test(clean)&&!specific&&!explicit;
 const known=geo.hasWardCommune&&!genericCenter&&!broad;
 const genericRoad=/^(?:đường|phố)\s+/iu.test(geo.address)&&!specific&&!explicit;
 const compatible=known&&!genericRoad&&addressRefines(clean,geo.address)&&!explicit&&specific;
 const address=compatible?geo.address:clean;
 return {address,rawAddress:clean,resolvedAddress:geo.hasWardCommune?geo.address:undefined,hasWardCommune:explicit||compatible,addressReady:!!clean&&(explicit||specific||known&&!genericRoad),city,addressResolution:explicit?'explicit':known&&!genericRoad?'legacy_lookup':specific?'specific':'incomplete'};
}
export function cargoItemsFromMessage(message:string):CargoItemEvidence[]|undefined {
 // Conservative deterministic path for unambiguous lists. More complex lists go to AI.
 const spans=message.split(/\s+và\s+|;\s*|,\s*(?=\d+\s*(?:kg|cân|g|lạng|tấn))/iu);
 if(spans.length<2||spans.length>20)return;
 const items:CargoItemEvidence[]=[];
 for(const part of spans){const m=[...part.matchAll(weightPattern)];if(m.length!==1)return;const w=m[0];const tail=stripPoliteTail(part.slice(w.index!+w[0].length)).trim();const prefix=part.slice(0,w.index).trim().replace(/^(?:(?:anh|chị|em|tôi|mình|muốn|cần|gửi|thêm|hàng)\s*)+/iu,'');const name=tail||prefix;
  if(!name||!detectCargoCategory(name)||isGenericCargoWord(name)||/\d|(?:địa chỉ|ngày|giờ|giao|lấy|hoặc)/iu.test(name)||!includesSpan(part,name))return;
  // Avoid treating extra prose as a name.
  if(name.split(/\s+/).length>5)return;
  items.push({name,weight:w[0]});}
 return items;
}
function storedItems(cargo:any){if(Array.isArray(cargo?.items)&&cargo.items.length)return structuredClone(cargo.items);return cargo?.name&&Number(cargo.weightKg)>0?[{name:cargo.name,weight:cargo.weight||`${cargo.weightKg} kg`,weightKg:cargo.weightKg,category:cargo.category}]:[];}
function aggregateItems(info:any,items:any[]){const total=Math.round(items.reduce((n,i)=>n+i.weightKg,0)*1000000)/1000000;info.cargo={...info.cargo,items,name:items.map(i=>i.name).join(' và '),weight:`${total} kg`,weightKg:total,category:items.every(i=>i.category===items[0].category)?items[0].category:'Hàng hỗn hợp'};}
function validateItems(raw:unknown,message:string){
 if(!Array.isArray(raw)||raw.length<1||raw.length>20||/(?:hoặc|hay là|chưa đến|dưới|hơn|khoảng|tầm)\s*\d/iu.test(message))return null;
 const weights=[...message.matchAll(weightPattern)].map(m=>norm(m[0]));const used=new Set<number>(),usedClauses=new Set<number>();const items=[];
 for(const item of raw){if(!object(item)||typeof item.name!=='string'||typeof item.weight!=='string'||!includesSpan(cargoText(message),item.name)||!includesSpan(message,item.weight)||isGenericCargoWord(item.name)||item.name.length>120||/\d|^(?:anh|chị|em|mình|tôi)$/iu.test(item.name)||!weightKg(item.weight)||!/^\d/iu.test(item.weight.trim()))return null;
  const idx=weights.findIndex((w,i)=>!used.has(i)&&w===norm(item.weight));if(idx<0)return null;used.add(idx);
  // A pair must occur together in the same clause; do not cross-pair different items.
  const clauses=message.split(/\s+và\s+|;|,\s*(?=\d)/iu);const clauseIndex=clauses.findIndex((c,i)=>!usedClauses.has(i)&&includesSpan(c,item.name as string)&&includesSpan(c,item.weight as string));if(clauseIndex<0)return null;usedClauses.add(clauseIndex);
  items.push({name:item.name.trim(),weight:item.weight.trim(),weightKg:weightKg(item.weight)!,category:detectCargoCategory(item.name)||'Bưu phẩm / Hàng tiêu dùng'});}
 if(used.size!==weights.length)return null;return items;
}
export type ExtractionCheck={ok:boolean;info:any;accepted:Entities;rejected:Record<string,string>;reason:string;operation?:Operation};
export function validateRuleFields(raw:unknown,message:string,history:any[],current:any,allowCorrection=false):ExtractionCheck {
 const info=baseInfo(current),accepted:Entities={},rejected:Record<string,string>={};
 const op=operationFor(message,object(raw)?raw.operation:undefined);
 const finish=(reason:string,ok=false):ExtractionCheck=>({ok,info,accepted,rejected,reason,operation:op});
 if(!object(raw)||!['EXTRACTED','AMBIGUOUS','OUT_OF_SCOPE'].includes(String(raw.status))||!object(raw.entities)||Object.keys(raw).some(k=>!['status','entities','operation'].includes(k)))return finish('SCHEMA');
 if(raw.status!=='EXTRACTED')return finish(String(raw.status));
 const e=raw.entities;
 if(current?.isConfirmed)return finish('CONFIRMED_ORDER_REQUIRES_STAFF');
 const active=Boolean(current?.nextMissingKey||current?.sender?.address||current?.receiver?.address||current?.cargo?.name||current?.deliveryTime||history.some(h=>['model','assistant','bot'].includes(h.role||h.sender)&&/địa chỉ|hàng hóa|kiện hàng|gửi hàng/i.test(String(h.content||h.text||''))));
 if(!active&&!/(?:gửi|chuyển hàng|vận chuyển|lấy|giao|ship)/iu.test(message)&&!(detectCargoCategory(cargoText(message))&&[...message.matchAll(weightPattern)].length===1))return finish('NO_BOOKING_CONTEXT');
 if(op==='CANCEL_PENDING'){if(info.pendingOperation){delete info.pendingOperation;return finish('PENDING_CANCELLED',true);}return finish('NO_PENDING_ACTION');}
 if(op==='CLARIFY'||op==='REMOVE')return finish('NEEDS_SEMANTIC_REVIEW');
 const canUpdate=op==='UPDATE'&&!current?.isConfirmed;
 const conflict=(old:unknown,v:unknown)=>old!=null&&String(old).trim()!==''&&norm(old)!==norm(v)&&!canUpdate;
 const cargoChanged=canUpdate&&typeof e.cargo==='string'&&norm(e.cargo)!==norm(info.cargo.name)&&includesSpan(message,e.cargo);
 // ADD appends to one existing shipment. If its existing cargo has no usable weight, clarify first.
 const blockedAdd=op==='ADD'&&!!(info.cargo.name||info.cargo.weightKg||info.cargo.dimensions.raw)&&!storedItems(info.cargo).length;
 const multipleWeights=[...message.matchAll(weightPattern)].length>1;
 const oldItems=storedItems(info.cargo);
 const wholeReplacement=/(?:đổi|thay|sửa)\s+(?:toàn bộ|tất cả|cả đơn)|(?:đổi|thay)\s+thành/iu.test(message);
 const target=canUpdate&&oldItems.length>1&&!wholeReplacement&&typeof e.cargo==='string'?oldItems.filter((i:any)=>norm(i.name)===norm(e.cargo)):[];
 const itemUpdate=target.length===1&&typeof e.weight==='string';
 const listInput=e.items??((op==='ADD'||itemUpdate)&&e.cargo&&e.weight?[{name:e.cargo,weight:e.weight}]:undefined);
 const list= listInput!==undefined?validateItems(listInput,message):null;
 let listApplied=false;
 if(list&&(!multipleWeights||list.length>1)&&!blockedAdd&&op!=='QUESTION'){
   if(op==='ADD'||canUpdate||!storedItems(info.cargo).length||JSON.stringify(storedItems(info.cargo).map((i:any)=>[norm(i.name),i.weightKg]))===JSON.stringify(list.map(i=>[norm(i.name),i.weightKg]))){
     const next=op==='ADD'?[...oldItems,...list]:itemUpdate?oldItems.map((i:any)=>norm(i.name)===norm(list[0].name)?list[0]:i):list;
     if(next.length<=20){aggregateItems(info,next);if(op==='UPDATE'){info.cargo.dimensions={length:null,width:null,height:null,raw:''};info.cargo.specialNotes='';info.cargo.declaredValue='';}delete info.pendingOperation;accepted.items=list.map(i=>({name:i.name,weight:i.weight}));listApplied=true;}
   }
 }
 const critical=new Set<string>();
 if((multipleWeights||listInput!==undefined)&&!listApplied){rejected.items='ITEM_LIST_INCOMPLETE_OR_CONFLICT';critical.add('items');}
 if(listApplied&&op==='ADD'&&info.cargo.dimensions?.raw){/* dimensions describe existing shipment only: clear until supplied again */ info.cargo.dimensions={length:null,width:null,height:null,raw:''};}
 for(const [key,rawValue] of Object.entries(e).sort(([a],[b])=>Number(b==='cargo')-Number(a==='cargo'))){
  if(key==='items')continue;
  if(['cargo','weight'].includes(key)&&(listApplied||multipleWeights||listInput!==undefined))continue;
  if(!entityKeys.includes(key as EntityKey)||typeof rawValue!=='string'||rawValue.length>400){rejected[key]='SCHEMA_FIELD';continue;}
  const v=rawValue.trim();if(!v)continue;if(!includesSpan(message,v)){rejected[key]='UNGROUNDED_VALUE';continue;}
  let fail='';
  if(['pickup','destination','address'].includes(key)){
   const role=roleFor(message,v,current);const expected=key==='pickup'?'sender':key==='destination'?'receiver':undefined;
   // Model may resolve a natural phrase that the old strict prefix patterns do not know, only if no opposing role and explicit cue exists.
   const pre=norm(message).slice(0,norm(message).indexOf(norm(v)));
   const lastCue=[...pre.matchAll(/(?:địa chỉ|điểm)\s+(lấy|giao)|(lấy|giao)\s+hàng/gu)].at(-1);const inferred=role||(lastCue?(lastCue[1]||lastCue[2])==='lấy'?'sender':'receiver':null);
   const clean=cleanAddressText(stripPoliteTail(v)),geo=reverseGeocodeAddress(clean);
   const refined=inferred?addWard(info[inferred].rawAddress||info[inferred].address,clean):null;
   if(!inferred||(expected&&inferred!==expected)||!clean||isNotValidAddress(clean)||!geo.address||/[.!?]\s+(?:ngày|hôm|anh|chị|em|mình|tôi|bạn|bên)/iu.test(clean)||[...clean.matchAll(phonePattern)].length||[...clean.matchAll(weightPattern)].length)fail='ADDRESS_ROLE_OR_VALUE';
   else if(conflict(info[inferred].rawAddress||info[inferred].address,clean)&&!refined&&!addressRefines(info[inferred].rawAddress||info[inferred].address,clean)&&!roleFor(message,v,current))fail='ADDRESS_CONFLICT';
   else if(norm(info[inferred==='sender'?'receiver':'sender'].address)===norm(geo.address))fail='DUPLICATE_ADDRESS';
   else {
     // Legacy geocoder may replace an entire street with a district center ward. Never commit such an inference.
     Object.assign(info[inferred],resolveAddressForDraft(refined||clean));
   }
  }else if(key==='cargo'){
   const category=detectCargoCategory(v),name=category&&['hoa quả','quần áo','tài liệu','hải sản','thực phẩm'].includes(norm(v))?category:v;
   if(!includesSpan(cargoText(message),v)||isGenericCargoWord(v)||/^(?:xin chào|chào|cảm ơn|ok|được|không|anh|chị|em|mình|tôi|nhé|nhá|nhế|nha|thôi|đổi|gửi|thêm|hàng)$/iu.test(v))fail='CARGO_INVALID';
   else if(blockedAdd)fail='MULTI_CARGO_UNSUPPORTED';else if(canUpdate&&oldItems.length>1&&!wholeReplacement)fail='ITEM_TARGET_REQUIRED';else if(conflict(info.cargo.name,name))fail='CARGO_CONFLICT';
   else{if(cargoChanged){delete info.cargo.items;info.cargo.weight='';info.cargo.weightKg=null;info.cargo.dimensions={length:null,width:null,height:null,raw:''};info.cargo.specialNotes='';info.cargo.declaredValue='';}info.cargo.name=name;info.cargo.category=category||'Bưu phẩm / Hàng tiêu dùng';}
  }else if(key==='weight'){
   const kg=weightKg(v);if(kg===null)fail='WEIGHT_INVALID';else if(info.cargo.items?.length>1&&!listApplied)fail='ITEM_TARGET_REQUIRED';else if(blockedAdd)fail='MULTI_CARGO_UNSUPPORTED';else if(conflict(info.cargo.weightKg,kg))fail='WEIGHT_CONFLICT';else{info.cargo.weight=v;info.cargo.weightKg=kg;if(info.cargo.items?.length===1){info.cargo.items[0].weight=v;info.cargo.items[0].weightKg=kg;}}
  }else if(key==='dimensions'){
   const m=v.match(/^(\d+)\s*[xX*×]\s*(\d+)\s*[xX*×]\s*(\d+)(?:\s*cm)?$/iu);const nums=m?.slice(1).map(Number);
   if(!nums||nums.some(n=>!Number.isSafeInteger(n)||n<=0))fail='DIMENSIONS_INVALID';else if(blockedAdd)fail='MULTI_CARGO_UNSUPPORTED';else {const [length,width,height]=nums;const raw=`${length}x${width}x${height} cm`;if(conflict(info.cargo.dimensions.raw,raw))fail='DIMENSIONS_CONFLICT';else info.cargo.dimensions={length,width,height,raw};}
  }else if(key==='deliveryTime'){
   const t=detectDeliveryTime(v)||(/^(?:\d{1,2}:\d{2}|(?:sáng|trưa|chiều|tối)\s+thứ\s+[2-7]|thứ\s+[2-7]|chủ nhật)(?:\s+.*)?$/iu.test(v)?v:null);
   const following=norm(message).slice(norm(message).indexOf(norm(v))+norm(v).length, norm(message).indexOf(norm(v))+norm(v).length+35);
   if(!t||/^(?:\s+(?:mình|anh|chị|em|tôi))?\s+(?:bận|không rảnh|không được)/u.test(following))fail='TIME_INVALID';else if(conflict(info.deliveryTime,v)&&conflict(info.deliveryTime,t))fail='TIME_CONFLICT';else {info.deliveryTime=v;const date=relativeDate(v);if(date)info.deliveryTimeDate=date;else delete info.deliveryTimeDate;}
  }else if(key==='notes'){
   if(blockedAdd||/^(?:gửi thêm|đổi|đổi thành|sửa)|được không$/iu.test(v)||!/(?:dễ vỡ|bảo quản|đông lạnh|giữ lạnh|không xếp|đóng gói|cẩn thận|không lật|nhẹ tay|ghi chú)/iu.test(v))fail='NOTES_NOT_HANDLING';else if(conflict(info.cargo.specialNotes,v))fail='NOTES_CONFLICT';else info.cargo.specialNotes=v;
  }else{
   const kind=key.toLowerCase().endsWith('phone')?'phone':'name';const role=roleFor(message,v,current,kind);const expected=key.startsWith('sender')?'sender':key.startsWith('receiver')?'receiver':role;
   const value=kind==='phone'?cleanPhoneNumber(v):v;
   if(kind==='phone'&&!isValidVNPhone(value))fail='PHONE_INVALID';else if(kind==='name'&&(!/^[\p{L}][\p{L}\s.'’-]{0,70}$/u.test(v)||/^(?:anh|chị|em|tôi|mình|người gửi|người nhận|chưa xác định|tên)$/iu.test(v)))fail='NAME_INVALID';
   else if(!role||role!==expected)fail='CONTACT_ROLE_UNKNOWN';else if(conflict(info[role][kind],value))fail='CONTACT_CONFLICT';else info[role][kind]=value;
  }
  if(fail){rejected[key]=fail;if(/CONFLICT|MULTI_CARGO|ROLE|DUPLICATE|ITEM_TARGET/.test(fail))critical.add(key);}else accepted[key as EntityKey]=v;
 }
 // Explicit numeric evidence remains a hard gate; the category dictionary is not a semantic authority.
 const weights=[...message.matchAll(weightPattern)].map(m=>m[0]);if(!listApplied&&weights.length&&(weights.length!==1||!accepted.weight||norm(accepted.weight)!==norm(weights[0]))){rejected.weightEvidence='WEIGHT_OMITTED_OR_MULTIPLE';critical.add('weightEvidence');delete accepted.weight;info.cargo.weight=cargoChanged?'':current?.cargo?.weight||'';info.cargo.weightKg=cargoChanged?null:current?.cargo?.weightKg??null;}
 const dims=[...message.matchAll(dimensionPattern)].map(m=>m[0]);if(dims.length&&(dims.length!==1||!accepted.dimensions||norm(accepted.dimensions).replace(/\s/g,'')!==norm(dims[0]).replace(/\s/g,''))){rejected.dimensionEvidence='DIMENSIONS_OMITTED_OR_MULTIPLE';critical.add('dimensionEvidence');delete accepted.dimensions;info.cargo.dimensions=cargoChanged?{length:null,width:null,height:null,raw:''}:baseInfo(current).cargo.dimensions;}
 if(!listApplied&&detectCargoCategory(cargoText(message))&&!accepted.cargo&&!accepted.pickup&&!accepted.destination&&!accepted.address&&!accepted.senderName&&!accepted.receiverName){rejected.cargoEvidence='CARGO_OMITTED';critical.add('cargoEvidence');}
 if(detectDeliveryTime(message)&&!accepted.deliveryTime){rejected.timeEvidence='TIME_OMITTED';critical.add('timeEvidence');}
 const phones=[...message.matchAll(phonePattern)].map(m=>cleanPhoneNumber(m[0])).filter(isValidVNPhone);if(phones.some(p=>p!==info.sender.phone&&p!==info.receiver.phone)){rejected.phoneEvidence='PHONE_OMITTED';critical.add('phoneEvidence');}
 if(blockedAdd)return finish('MULTI_CARGO_UNSUPPORTED');
 if(listApplied)delete info.pendingOperation;
 if(!listApplied&&(multipleWeights||rejected.cargo==='ITEM_TARGET_REQUIRED'||rejected.weight==='ITEM_TARGET_REQUIRED')){info.cargo=baseInfo(current).cargo;for(const k of ['cargo','weight','dimensions','notes'] as const)delete accepted[k];}
 // Replacing a type of cargo and its weight is atomic; do not modify the old item's weight if the new type was missed.
 if(canUpdate&&!listApplied&&(rejected.cargoEvidence||((rejected.weightEvidence||rejected.dimensionEvidence)&&cargoChanged))){info.cargo=baseInfo(current).cargo;for(const k of ['cargo','weight','dimensions','notes'] as const)delete accepted[k];}
 if(op==='QUESTION')return finish('QUESTION_RECOGNIZED',!critical.size);
 // Unknown or invalid extras are logged, not reasons to discard correctly grounded fields.
 return finish(!Object.keys(accepted).length?'NO_NEW_EVIDENCE':critical.size?'PARTIAL_OR_CONFLICT':'VALIDATED',!!Object.keys(accepted).length&&!critical.size);
}
