import { GROUP_MENU,GROUP_CHOICES,GROUP_LABELS,SUBS,SERVICE_LABELS,subMenu,type MainVertical,type SubVertical } from '../../shared/service-menu';
import { SUPPORT_MESSAGE } from '../../shared/support-message';
import { baseInfo } from '../validation/field-check';
import { Type,callGemini,type ModelCall,recentHistory } from './gemini-client';
import { expressStep } from './express';
import { rideSetup,rideStep } from './ride';import { rentSetup,rentStep } from './rent';import { truckSetup,truckStep } from './truck';import { tourSetup,tourStep } from './tour';
import { safeDetail,errorDetail,ChainError } from '../chains/trace';
import type { AITrace,AITraceStep,AITraceSource } from '../../shared/types';
import { evaluateCompleteness } from '../extraction/express';
import { chatbotAI } from '../../config/chatbot-ai';
const groups=Object.keys(GROUP_LABELS) as MainVertical[];
const setups={ride:rideSetup,rent:rentSetup,truck:truckSetup,tour:tourSetup};
const norm=(s:string)=>s.toLocaleLowerCase('vi').trim().replace(/[.!?]+$/u,'');
const chooseGroup=(m:string)=>{const t=norm(m);if(/^(?:1|chuyển người|chở người|đặt xe|thuê xe|đi xe)$/u.test(t))return 'chuyen_nguoi';if(/^(?:2|chuyển hàng|gửi hàng|vận chuyển hàng|chở hàng)$/u.test(t))return 'chuyen_hang';if(/^(?:3|du lịch|tour|khách sạn)$/u.test(t))return 'du_lich';return undefined;};
const chooseSub=(m:string,g:MainVertical):SubVertical|undefined=>{const t=norm(m);const n=Number(t);if(Number.isInteger(n)&&n>=1&&n<=SUBS[g].length)return SUBS[g][n-1];if(g==='chuyen_nguoi'){if(/^(?:ride|đặt xe|đặt xe theo chuyến|xe theo chuyến)$/u.test(t))return 'ride';if(/^(?:rent|thuê xe|thuê xe theo lịch trình \/ ngày|thuê xe theo ngày|thuê xe theo lịch trình)$/u.test(t))return 'rent';}if(g==='chuyen_hang'){if(/^(?:express|chuyển phát nhanh|gửi hàng nhanh|giao hàng nhanh)$/u.test(t))return 'express';if(/^(?:truck|thuê xe tải|thuê xe tải \/ chuyển đồ|chuyển đồ|chuyển nhà)$/u.test(t))return 'truck';}if(g==='du_lich'&&/^(?:tour|tour \/ khách sạn|đặt tour|khách sạn|đặt khách sạn)$/u.test(t))return 'tour';};
const initialQuestion:Record<SubVertical,string>={ride:'Anh/chị muốn đón xe ở đâu ạ?',rent:'Anh/chị muốn đón xe ở đâu và đi theo lịch trình nào ạ?',express:'Anh/chị cho em xin địa chỉ hoặc điểm lấy hàng cụ thể nhé.',truck:'Anh/chị muốn lấy đồ tại địa chỉ nào ạ?',tour:'Anh/chị đang quan tâm tour hoặc khách sạn ở đâu ạ?'};
const legacyShipment=(i:any)=>Boolean(i.sender?.address||i.receiver?.address||i.cargo?.name||i.deliveryTime||i.isConfirmed||i.trackingCode);
export async function routeConversation(message:string,history:any[]=[],current:any={},options:{debug?:boolean;call?:ModelCall;channel?:'web'|'zalo'}={}): Promise<any> {
  if (options.channel === 'zalo' && !current?.subVertical && !current?.mainVertical && !/^(?:đổi dịch vụ|chọn lại dịch vụ|menu|tạo đơn mới|đơn mới|reset)$/iu.test(String(message || '').trim())) {
    current = { ...(current || {}), mainVertical: 'chuyen_hang', subVertical: 'express' };
  }
 const start=Date.now(),steps:AITraceStep[]=[];const call=options.call||callGemini;history=Array.isArray(history)?history:[];let resetIndex=-1;for(let i=history.length-1;i>=0;i--){const h=history[i];if(h&&(h.role||h.sender)==='user'&&/^(?:đổi dịch vụ|chọn lại dịch vụ|menu|tạo đơn mới|đơn mới|reset)$/iu.test(String(h.content||h.text||'').trim())){resetIndex=i;break;}}if(resetIndex>=0)history=history.slice(resetIndex+1);current=baseInfo(current);message=String(message||'').trim();
 const trace=(s:AITraceStep)=>steps.push({...s,detail:options.debug&&s.detail?safeDetail(s.detail):undefined});
 function done(reply:string,shippingInfo:any,quickReplies:string[]=[],source:AITraceSource='rule',reason='SERVICE_ROUTER'){
  trace({node:'final',status:'ok',reason:'FINAL_RESPONSE',detail:{reply,shippingInfo}});const aiTrace:AITrace={source,reason,elapsedMs:Date.now()-start,steps};if(chatbotAI.logRoutes)console.info(`[AI ROUTE] service=${shippingInfo.subVertical||'selection'} source=${source} reason=${reason} elapsed_ms=${aiTrace.elapsedMs}`);return {reply,shippingInfo,quickReplies,aiTrace};}
 const cleanMenu=(g?:MainVertical)=>({...baseInfo({}),mainVertical:g,subVertical:undefined,completionRate:0,isComplete:false,isConfirmed:false,missingFields:[],missingKeys:[],nextAction:g?'SELECT_SERVICE':'SELECT_GROUP',nextQuestion:g?subMenu(g):GROUP_MENU});
 const selectMenu=(g?:MainVertical)=>done(g?subMenu(g):GROUP_MENU,cleanMenu(g),g?SUBS[g].map(s=>SERVICE_LABELS[s]):GROUP_CHOICES);
 if(/^(?:đổi dịch vụ|chọn lại dịch vụ|menu|tạo đơn mới|đơn mới|reset)$/iu.test(message)){
   if (options.channel === 'zalo') {
     const freshExpress = { ...baseInfo({}), mainVertical: 'chuyen_hang' as MainVertical, subVertical: 'express' as SubVertical, ...evaluateCompleteness(baseInfo({}), true), nextQuestion: initialQuestion.express };
     return done(`Dạ em đã mở đơn chuyển phát nhanh mới cho mình. ${initialQuestion.express}`, freshExpress, [], 'rule', 'ZALO_EXPRESS_RESET');
   }
   return selectMenu();
 }
 let group=groups.includes(current.mainVertical)?current.mainVertical as MainVertical:undefined;
 let service=group&&SUBS[group].includes(current.subVertical)?current.subVertical as SubVertical:undefined;
 // Existing shipping sessions resume safely; new empty sessions must choose their group first.
 if(!group&&!service&&legacyShipment(current)){group='chuyen_hang';service='express';}
 if(!service){
  let selectedGroup: MainVertical | undefined = group ? undefined : (chooseGroup(message) as MainVertical | undefined);let selectedSub=group?chooseSub(message,group):undefined;let source:AITraceSource='rule';
  const greeting=/^(?:chào(?: bạn| em| anh| chị)?|xin chào|hi|hello|alo|)$/iu.test(message);
  if(!selectedGroup&&!selectedSub&&!greeting){try{
    const r=await call('Phân loại yêu cầu dịch vụ Đi Chung. mainVertical: chuyen_nguoi (đặt xe/thuê xe), chuyen_hang (chuyển phát/xe tải), du_lich (tour/khách sạn), unknown. subVertical: ride, rent, express, truck, tour, unknown. Chỉ phân loại theo lời khách, không suy diễn từ địa chỉ đơn lẻ. Khi nhóm đã chọn chỉ chọn dịch vụ thuộc nhóm. Trả JSON, không trả lời khách.',{message,group:group||'unknown',history:recentHistory(history,message)},{type:Type.OBJECT,required:['mainVertical','subVertical'],properties:{mainVertical:{type:Type.STRING,enum:[...groups,'unknown']},subVertical:{type:Type.STRING,enum:[...Object.keys(SERVICE_LABELS),'unknown']}}});
    trace({node:'service_router_gemini',status:'ok',reason:'CLASSIFIED',detail:r.detail});source='gemini';if(!group&&groups.includes(r.value?.mainVertical))selectedGroup=r.value.mainVertical as MainVertical;if(group&&SUBS[group].includes(r.value?.subVertical))selectedSub=r.value.subVertical;
   }catch(e){trace({node:'service_router_gemini',status:'error',reason:e instanceof ChainError?e.code:'GEMINI_ERROR',detail:e instanceof ChainError?e.detail:errorDetail(e)});}}
  if(!group){trace({node:'service_router',status:'ok',reason:selectedGroup?'GROUP_SELECTED':'SELECT_GROUP',detail:{selectedGroup}});return done(selectedGroup?subMenu(selectedGroup):GROUP_MENU,cleanMenu(selectedGroup),selectedGroup?SUBS[selectedGroup].map(s=>SERVICE_LABELS[s]):GROUP_CHOICES,source,selectedGroup?'GROUP_SELECTED':'SELECT_GROUP');}
  if(!selectedSub)return selectMenu(group);
  service=selectedSub;const info={...baseInfo({}),mainVertical:group,subVertical:service,completionRate:0,isComplete:false,isConfirmed:false,missingFields:[],missingKeys:[],nextAction:'ASK_FIELD',nextQuestion:initialQuestion[service]};
  if(service==='express')Object.assign(info,evaluateCompleteness(info,true),{nextQuestion:initialQuestion[service]});
  else {const required=setups[service].fields.filter(f=>!f.optional);Object.assign(info,{serviceDraft:{fields:{},ready:false,missing:required.map(f=>f.label)},missingFields:required.map(f=>f.label),missingKeys:required.map(f=>f.key),nextMissingKey:required[0]?.key});}
  trace({node:'service_router',status:'ok',reason:'SERVICE_SELECTED',detail:{group,service}});return done(`Dạ, anh/chị đã chọn ${SERVICE_LABELS[service]}. ${initialQuestion[service]}`,info,[],source,'SERVICE_SELECTED');
 }
 current={...current,mainVertical:group,subVertical:service};trace({node:'service_router',status:'ok',reason:'ACTIVE_SERVICE',detail:{group,service}});
 let result;
 if(service==='express')result=await expressStep(message,history,current,call,trace);
 else if(service==='ride')result=await rideStep(message,history,current,call,trace);
 else if(service==='rent')result=await rentStep(message,history,current,call,trace);
 else if(service==='truck')result=await truckStep(message,history,current,call,trace);
 else result=await tourStep(message,history,current,call,trace);
 const source=steps.some(t=>t.node==='address_enrichment'&&t.reason==='DCE_GEMINI_INFERRED')?'gemini':result.source;
 return done(result.reply,{...result.shippingInfo,mainVertical:group,subVertical:service},result.quickReplies,source,'SERVICE_RESPONSE');
}
