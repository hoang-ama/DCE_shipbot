import { GROUP_MENU,GROUP_LABELS,SUBS,SERVICE_LABELS,subMenu,type MainVertical,type SubVertical } from '../../shared/service-menu';
import { SUPPORT_MESSAGE } from '../../shared/support-message';
import { baseInfo } from '../validation/field-check';
import { callGemini,type ModelCall } from './gemini-client';
import { expressStep } from './express';
import { rideSetup,rideStep } from './ride';import { rentSetup,rentStep } from './rent';import { truckSetup,truckStep } from './truck';import { tourSetup,tourStep } from './tour';
import { safeDetail, errorDetail } from '../chains/trace';
import type { AITrace,AITraceStep,AITraceSource } from '../../shared/types';
import { evaluateCompleteness } from '../extraction/express';
import { chatbotAI } from '../../config/chatbot-ai';
import { callPassengerQwen, parsePassengerQwenJson } from '../../../chatbot/passenger-transport/qwen-client';
const groups=Object.keys(GROUP_LABELS) as MainVertical[];
const setups={ride:rideSetup,rent:rentSetup,truck:truckSetup,tour:tourSetup};
const fold=(s:string)=>s.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').replace(/đ/gu,'d').replace(/[.!?,;:]+/gu,' ').replace(/\s+/gu,' ').trim();
const norm=(s:string)=>fold(s);
const chooseGroup=(m:string):MainVertical|undefined=>{const t=norm(m);if(/^(?:1|chuyen nguoi|cho nguoi|dat xe|thue xe|di xe)$/u.test(t)||/\b(?:chuyen nguoi|cho nguoi|dat xe theo chuyen|thue xe theo lich trinh)\b/u.test(t))return 'chuyen_nguoi';if(/^(?:2|chuyen hang|gui hang|van chuyen hang|cho hang)$/u.test(t)||/\b(?:chuyen hang|gui hang|van chuyen hang|cho hang)\b/u.test(t))return 'chuyen_hang';if(/^(?:3|du lich|tour|khach san)$/u.test(t)||/\b(?:du lich|tour|khach san)\b/u.test(t))return 'du_lich';return undefined;};
const chooseSub=(m:string,g:MainVertical):SubVertical|undefined=>{const t=norm(m);const n=Number(t);if(Number.isInteger(n)&&n>=1&&n<=SUBS[g].length)return SUBS[g][n-1];if(g==='chuyen_nguoi'){if(/\b(?:ride|dat xe theo chuyen|xe theo chuyen|theo chuyen|mot chuyen|1 chuyen)\b/u.test(t))return 'ride';if(/\b(?:rental|thue xe|thue theo lich trinh|lich trinh|thue xe theo ngay)\b/u.test(t))return 'rent';}if(g==='chuyen_hang'){if(/\b(?:express|chuyen phat nhanh|gui hang nhanh|giao hang nhanh)\b/u.test(t))return 'express';if(/\b(?:truck|thue xe tai|xe tai|chuyen do|chuyen nha)\b/u.test(t))return 'truck';}if(g==='du_lich'&&/\b(?:tour|khach san|dat tour|dat khach san)\b/u.test(t))return 'tour';};
async function classifySelectionWithQwen(message:string,group?:MainVertical,history:any[]=[],timeoutMs=60_000):Promise<{group?:MainVertical;service?:SubVertical;model?:string;elapsedMs?:number}> {
 const system='Phân loại một câu trả lời cho menu dịch vụ Đi Chung. Nếu đang hỏi nhóm: mainVertical là chuyen_nguoi, chuyen_hang, du_lich. Nếu đã có nhóm, chỉ chọn subVertical thuộc nhóm: chuyen_nguoi => ride/rent; chuyen_hang => express/truck; du_lich => tour. Nếu câu không chọn rõ, trả unknown. Chỉ trả JSON {"mainVertical":"...","subVertical":"..."}; không trả lời người dùng.';
 const result=await callPassengerQwen(system,{message,selectedGroup:group||'unknown',recentHistory:history.slice(-2).map(x=>({role:x.role||x.sender,content:x.content||x.text||''}))},100,timeoutMs);
 const value=parsePassengerQwenJson(result.text);
 const validGroups:MainVertical[]=['chuyen_nguoi','chuyen_hang','du_lich'];
 const validServices:SubVertical[]=['ride','rent','express','truck','tour'];
 const foundGroup=validGroups.includes(value?.mainVertical)?value.mainVertical as MainVertical:undefined;
 const foundService=validServices.includes(value?.subVertical)?value.subVertical as SubVertical:undefined;
 if(group&&foundService&&!SUBS[group].includes(foundService))return {};
 return {group:group||foundGroup,service:foundService,model:result.model,elapsedMs:result.elapsedMs};
}
const initialQuestion:Record<SubVertical,string>={ride:'Anh/chị muốn đón xe ở đâu ạ?',rent:'Anh/chị muốn đón xe tại đâu ạ?',express:'Anh/chị cho em xin địa chỉ hoặc điểm lấy hàng cụ thể nhé.',truck:'Anh/chị muốn lấy hàng tại địa chỉ nào ạ?',tour:'Anh/chị đang quan tâm tour hoặc khách sạn ở đâu ạ?'};
const legacyShipment=(i:any)=>Boolean(i.sender?.address||i.receiver?.address||i.cargo?.name||i.deliveryTime||i.isConfirmed||i.trackingCode);
export async function routeConversation(message:string,history:any[]=[],current:any={},options:{debug?:boolean;call?:ModelCall;channel?:'web'|'zalo';qwenDeadlineAt?:number}={}): Promise<any> {
 const start=Date.now(),steps:AITraceStep[]=[];const call=options.call||callGemini;history=Array.isArray(history)?history:[];let resetIndex=-1;for(let i=history.length-1;i>=0;i--){const h=history[i];if(h&&(h.role||h.sender)==='user'&&/^(?:đổi dịch vụ|chọn lại dịch vụ|menu|tạo đơn mới|đơn mới|reset)$/iu.test(String(h.content||h.text||'').trim())){resetIndex=i;break;}}if(resetIndex>=0)history=history.slice(resetIndex+1);current=baseInfo(current);message=String(message||'').trim();
 const trace=(s:AITraceStep)=>steps.push({...s,detail:options.debug&&s.detail?safeDetail(s.detail):undefined});
 function done(reply:string,shippingInfo:any,quickReplies:string[]=[],source:AITraceSource='rule',reason='SERVICE_ROUTER'){
  // The model used for extraction is not necessarily the author of the customer-facing reply.
  // Prefer the explicit output node so Qwen extraction does not mislabel a rule-generated question.
  const answerSource: AITraceSource = steps.some((step) => step.node === 'rule_reply') ? 'rule' : source;
  trace({node:'final',status:'ok',reason:'FINAL_RESPONSE',detail:{reply,shippingInfo}});const aiTrace:AITrace={source:answerSource,reason,elapsedMs:Date.now()-start,steps};if(chatbotAI.logRoutes)console.info(`[AI ROUTE] service=${shippingInfo.subVertical||'selection'} source=${answerSource} reason=${reason} elapsed_ms=${aiTrace.elapsedMs}`);return {reply,shippingInfo,quickReplies,aiTrace};}
 const cleanMenu=(g?:MainVertical)=>({...baseInfo({}),mainVertical:g,subVertical:undefined,completionRate:0,isComplete:false,isConfirmed:false,missingFields:[],missingKeys:[],nextAction:g?'SELECT_SERVICE':'SELECT_GROUP',nextQuestion:g?subMenu(g):GROUP_MENU});
 const selectMenu=(g?:MainVertical)=>done(g?subMenu(g):GROUP_MENU,cleanMenu(g),[]);
 if(/^(?:đổi dịch vụ|chọn lại dịch vụ|menu|tạo đơn mới|đơn mới|reset)$/iu.test(message)){
   return selectMenu();
 }
 let group=groups.includes(current.mainVertical)?current.mainVertical as MainVertical:undefined;
 let service=group&&SUBS[group].includes(current.subVertical)?current.subVertical as SubVertical:undefined;
 const isMenuGreeting=/^(?:chao(?: ban| em| anh| chi)?|xin chao|hi|hello|alo)$/u.test(norm(message));
 const isExplicitMenuChoice=Boolean(chooseGroup(message)||groups.some((candidate)=>chooseSub(message,candidate)));
 const hasPreviousBotReply=history.some((item)=>['model','assistant','bot'].includes(item?.role||item?.sender));
 // Resume a legacy Express draft only when the conversation already contains a bot turn.
 // A greeting, a menu answer, or a saved legacy payload by itself must not select Express.
 if(!group&&!service&&legacyShipment(current)&&hasPreviousBotReply&&!isMenuGreeting&&!isExplicitMenuChoice){group='chuyen_hang';service='express';}
 if(!service){
  let selectedGroup: MainVertical | undefined = group ? undefined : chooseGroup(message);
  let selectedSub=group?chooseSub(message,group):undefined;
  let source:AITraceSource='rule';
  if ((!group && !selectedGroup) || (group && !selectedSub)) {
    if (message.trim().length >= 4 && !isMenuGreeting) {
      try {
        const classified=await classifySelectionWithQwen(message,group,history,Math.max(1,(options.qwenDeadlineAt||Date.now()+60_000)-Date.now()));
        if(!group&&classified.group)selectedGroup=classified.group;
        if(group&&classified.service)selectedSub=classified.service;
        else if(!group&&classified.service){selectedSub=classified.service;selectedGroup=classified.group||(['ride','rent'].includes(classified.service)?'chuyen_nguoi':['express','truck'].includes(classified.service)?'chuyen_hang':'du_lich');}
        if(selectedGroup||selectedSub){source='qwen';trace({node:'service_router_qwen',status:'ok',reason:'QWEN_MENU_CLASSIFIED',elapsedMs:classified.elapsedMs,detail:{input:message,selectedGroup,selectedSub,model:classified.model}});}
        else trace({node:'service_router_qwen',status:'skip',reason:'NO_MENU_CHOICE',detail:{input:message}});
      } catch(error) {
        trace({node:'service_router_qwen',status:'error',reason:'QWEN_MENU_CLASSIFICATION_FAILED',detail:errorDetail(error)});
      }
    }
  }
  if(!group&&!selectedGroup){trace({node:'service_router',status:'ok',reason:'SELECT_GROUP',detail:{selectedGroup}});return done(GROUP_MENU,cleanMenu(),[],source,'SELECT_GROUP');}
  if(!group&&selectedGroup&&!selectedSub){trace({node:'service_router',status:'ok',reason:'GROUP_SELECTED',detail:{selectedGroup}});return done(subMenu(selectedGroup),cleanMenu(selectedGroup),[],source,'GROUP_SELECTED');}
  if(group&&!selectedSub)return selectMenu(group);
  if(!group&&selectedGroup)group=selectedGroup;
  service=selectedSub as SubVertical;const info={...baseInfo({}),mainVertical:group,subVertical:service,completionRate:0,isComplete:false,isConfirmed:false,missingFields:[],missingKeys:[],nextAction:'ASK_FIELD',nextQuestion:initialQuestion[service]};
  if(service==='express')Object.assign(info,evaluateCompleteness(info,true),{nextQuestion:initialQuestion[service]});
  else {const required=setups[service].fields.filter(f=>!f.optional);Object.assign(info,{serviceDraft:{fields:{},ready:false,missing:required.map(f=>f.label)},missingFields:required.map(f=>f.label),missingKeys:required.map(f=>f.key),nextMissingKey:({ride:'pickupAddress',rent:'pickupAddress',truck:'pickupAddress',tour:'destination'} as Record<string,string>)[service]||required[0]?.key});}
  trace({node:'service_router',status:'ok',reason:'SERVICE_SELECTED',detail:{group,service}});return done(`Dạ, anh/chị đã chọn ${SERVICE_LABELS[service]}. ${initialQuestion[service]}`,info,[],source,'SERVICE_SELECTED');
 }
 current={...current,mainVertical:group,subVertical:service};trace({node:'service_router',status:'ok',reason:'ACTIVE_SERVICE',detail:{group,service}});
 if(current.serviceDraft?.confirmationStatus==='quote_pending'){
  trace({node:'quote_pending_guard',status:'ok',reason:'NO_QUOTE_API_AUTO_REPLY_SUPPRESSED'});
  const paused=done('',current,[],'rule','QUOTE_PENDING_MANUAL');
  return {...paused,suppressed:true};
 }
 let result;
 const qwenTimeoutMs=Math.max(1,(options.qwenDeadlineAt||Date.now()+60_000)-Date.now());
 if(service==='express')result=await expressStep(message,history,current,call,trace,qwenTimeoutMs);
 else if(service==='ride')result=await rideStep(message,history,current,call,trace,qwenTimeoutMs);
 else if(service==='rent')result=await rentStep(message,history,current,call,trace,qwenTimeoutMs);
 else if(service==='truck')result=await truckStep(message,history,current,call,trace,qwenTimeoutMs);
 else result=await tourStep(message,history,current,call,trace,qwenTimeoutMs);
 const source=steps.some(t=>t.node==='address_enrichment'&&t.reason==='DCE_GEMINI_INFERRED')?'gemini':result.source;
 return done(result.reply,{...result.shippingInfo,mainVertical:group,subVertical:service},result.quickReplies,source,'SERVICE_RESPONSE');
}
