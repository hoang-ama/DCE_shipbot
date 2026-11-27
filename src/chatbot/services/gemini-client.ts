import { Type, ThinkingLevel } from '@google/genai';
import { geminiState } from '../models/gemini';
import { chatbotAI } from '../../config/chatbot-ai';
import { ChainError,errorDetail } from '../chains/trace';
export { Type };
export type ModelCall=(system:string,input:unknown,schema:any)=>Promise<{value:any;detail:Record<string,unknown>}>;
export const callGemini:ModelCall=async(system,input,schema)=>{
 const contents=JSON.stringify(input);const detail:Record<string,unknown>={model:chatbotAI.gemini.model,systemPrompt:system,input:contents};
 if(!geminiState.ai)throw new ChainError('GEMINI_NO_CLIENT',detail);
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const work=geminiState.ai.models.generateContent({model:chatbotAI.gemini.model,contents,config:{systemInstruction:system,temperature:0.1,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},abortSignal:controller.signal,responseMimeType:'application/json',responseSchema:schema}});
  const response=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new ChainError('GEMINI_TIMEOUT',detail));controller.abort();},chatbotAI.gemini.timeoutMs);})]);
  detail.rawOutput=response.text;detail.metadata=response.usageMetadata;const value=JSON.parse(response.text||'');detail.parsedJSON=value;return {value,detail};
 }catch(e){if(e instanceof ChainError)throw e;throw new ChainError('GEMINI_ERROR',{...detail,error:errorDetail(e)});}finally{if(timer)clearTimeout(timer);}
};
export function recentHistory(history:any[],message:string){const h=history.map(x=>({role:x.role||x.sender,content:x.content||x.text||''}));if(h.at(-1)?.role==='user'&&h.at(-1)?.content===message)h.pop();return h.slice(-chatbotAI.gemini.historyMessages);}
