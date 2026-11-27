import { cleanAddressText, reverseGeocodeAddress } from '../extraction/express';
import { provinceOf, norm, addressRefines, resolveAddressForDraft } from '../validation/field-check';
import { DCE_ADDRESS_PROMPT } from './dce-address-prompt';
import { Type,type ModelCall } from './gemini-client';
import type { AITraceStep } from '../../shared/types';
import { ChainError,errorDetail } from '../chains/trace';
const ward=(s:string)=>/(?:^|[\s,])(?:phường|xã|thị trấn|p\.|x\.)\s+[\p{L}\d]/iu.test(s);
// The original DCE lookup/prompt is reused. Keep the original input and avoid losing a specific house/gate.
export async function normalizeAddress(raw:string,call:ModelCall,trace:(step:AITraceStep)=>void,side:string){
 const clean=cleanAddressText(raw);const fallback=resolveAddressForDraft(clean);const lookup=reverseGeocodeAddress(clean);
 const usable=(v:string)=>{const city=provinceOf(clean),next=provinceOf(v);return !!v&&ward(v)&&(!city||city===next)&&addressRefines(clean,v);};
 const finish=(v:string,source:'explicit'|'legacy_lookup'|'gemini_inferred')=>({...fallback,address:v,rawAddress:clean,resolvedAddress:v,hasWardCommune:true,addressReady:true,city:provinceOf(v)||fallback.city,addressResolution:source});
 if(ward(clean)){trace({node:'address_enrichment',status:'ok',reason:'DCE_EXPLICIT',detail:{input:clean,output:clean,side}});return finish(clean,'explicit');}
 if(lookup.hasWardCommune&&usable(lookup.address)&&!/^khu vực/i.test(lookup.address)){trace({node:'address_enrichment',status:'ok',reason:'DCE_LOOKUP',detail:{input:clean,output:lookup.address,side}});return finish(lookup.address,'legacy_lookup');}
 const start=Date.now();
 try{
  const r=await call(DCE_ADDRESS_PROMPT+'\nChỉ chuẩn hóa địa chỉ đầu vào. Trả JSON {address}. Giữ số nhà, tên đường, tên cổng/thôn và tỉnh thành. Không đổi địa giới đã được khách ghi rõ. Nếu không biết, trả nguyên văn. Không có dữ liệu bản đồ thực tế, đây chỉ là suy luận để khách xác nhận.',{address:clean,lookupHint:lookup.address,role:side},{type:Type.OBJECT,required:['address'],properties:{address:{type:Type.STRING}}});
  const candidate=typeof r.value?.address==='string'?r.value.address.trim():'';
  const ok=candidate.length<=400&&usable(candidate);
  trace({node:'address_enrichment',status:ok?'ok':'skip',reason:ok?'DCE_GEMINI_INFERRED':'DCE_KEEP_RAW',elapsedMs:Date.now()-start,detail:{...r.detail,side,accepted:ok?candidate:clean}});
  if(ok)return finish(candidate,'gemini_inferred');
 }catch(e){trace({node:'address_enrichment',status:'error',reason:e instanceof ChainError?e.code:'ADDRESS_ERROR',elapsedMs:Date.now()-start,detail:e instanceof ChainError?e.detail:errorDetail(e)});}
 return {...fallback,address:clean,rawAddress:clean,hasWardCommune:false,resolvedAddress:undefined,addressResolution:fallback.addressReady?'specific':'incomplete'};
}
