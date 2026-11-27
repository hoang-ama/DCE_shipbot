// Trace is only included in the local web response. Never serialize SDK request/error objects.
const secretKey=/^(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|cookie|headers|stack|request|response)$/i;
export function safeText(text:string):string {
 let s=text.replace(/AIza[\w-]{20,}/g,'[REDACTED]').replace(/Bearer\s+[\w.\-+/=]+/gi,'Bearer [REDACTED]').replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie)["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi,'$1[REDACTED]').replace(/(?:postgres(?:ql)?|https?):\/\/[^\s/@:]+:[^\s/@]+@/gi,'[REDACTED_URL]@');
 for(const [k,v] of Object.entries(process.env))if(/KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/i.test(k)&&v&&v.length>=8)s=s.split(v).join('[REDACTED]');
 return s.length>24000?s.slice(0,24000)+'… [truncated]':s;
}
export function safeDetail(value:unknown,depth=0):any {
 if(depth>9)return '[depth limit]';if(typeof value==='string')return safeText(value);if(Array.isArray(value))return value.slice(0,40).map(v=>safeDetail(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,100).map(([k,v])=>[k,secretKey.test(k)?'[REDACTED]':safeDetail(v,depth+1)]));return value;
}
export function errorDetail(error:unknown):Record<string,unknown>{
 const e=error as any;return safeDetail({name:e?.name||'Error',message:e?.message||String(error),code:e?.code,status:e?.status,cause:e?.cause?{message:e.cause.message,code:e.cause.code}:undefined});
}
export class ChainError extends Error { constructor(public code:string,public detail:Record<string,unknown>){super(code);this.name='ChainError';} }
