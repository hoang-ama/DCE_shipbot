import { parseGoogleMapsLocation } from '../../shared/data/vnAdministrative';
import { baseInfo,norm,roleFor } from '../validation/field-check';
import type { Entities } from '../validation/field-schema';
import type { ruleExtract } from './express-nlp';
const allowedHost=(host:string)=>host==='maps.app.goo.gl'||host==='goo.gl'||host==='maps.google.com'||host==='www.google.com'||host==='www.google.com.vn'||host==='maps.google.com.vn'||host==='google.com'||host==='google.com.vn';
// Resolve only a single Google Maps link, with bounded, allowlisted redirects.
export async function ruleMap(message:string,current:any):Promise<ReturnType<typeof ruleExtract>|null>{
 const matches=[...message.matchAll(/https:\/\/[^\s<>]+/giu)];if(matches.length!==1)return null;
 const rawLink=matches[0][0];let url:URL;try{url=new URL(rawLink);}catch{return null;}
 if(url.username||url.password||url.port||!allowedHost(url.hostname)||!(/maps/i.test(url.pathname)||url.hostname.startsWith('maps.')))return null;
 const rest=norm(message.replace(rawLink,'')).replace(/[.!?]+$/u,'').trim();
 if(rest&&!/^(?:(?:anh|chị|em|tôi|mình|nhờ|giúp|hộ|ở|tại|từ|đến|tới|lấy|giao|hàng|địa|chỉ|điểm|nhé|nhá|nha|ạ)\s*)+$/u.test(rest))return null;
 const info=baseInfo(current);const role=roleFor(message,rawLink,info);if(!role)return null;
 let location=parseGoogleMapsLocation(url.href);
 if(!location&&(url.hostname==='maps.app.goo.gl'||url.hostname==='goo.gl')){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2000);
  try{for(let i=0;i<3&&!location;i++){
   const response=await fetch(url.href,{method:'HEAD',redirect:'manual',signal:controller.signal});const next=response.headers.get('location');if(!next)break;
   const target=new URL(next,url);if(target.protocol!=='https:'||!allowedHost(target.hostname)||target.username||target.password||target.port)break;
   url=target;location=parseGoogleMapsLocation(url.href);
  }}catch{}finally{clearTimeout(timer);}
 }
 if(!location?.address||!location.hasWardCommune)return null;
 if(info[role].address&&norm(info[role].address)!==norm(location.address)&&!norm(location.address).includes(norm(info[role].address)))return null;
 if(norm(info[role==='sender'?'receiver':'sender'].address)===norm(location.address))return null;
 info[role].address=location.address;info[role].rawAddress=rawLink;info[role].resolvedAddress=location.address;info[role].hasWardCommune=true;info[role].addressReady=true;
 const entities:Entities={[role==='sender'?'pickup':'destination']:rawLink};
 return {smart:location,raw:{status:'EXTRACTED',entities},checked:{ok:true,reason:'MAP_RESOLVED',info,accepted:entities,rejected:{}},ok:true,reason:'RULE_VALIDATED',remaining:'',info};
}
