let info: Record<string, unknown> = {};
const form=document.querySelector<HTMLFormElement>('#ride-form')!;
const message=document.querySelector<HTMLTextAreaElement>('#message')!;
const history=document.querySelector<HTMLDivElement>('#history')!;
const output=document.querySelector<HTMLPreElement>('#info')!;
let busy=false;
function add(role:string,text:string){const p=document.createElement('p');p.textContent=`${role}: ${text}`;history.append(p);}
form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;const text=message.value.trim();message.value='';add('Bạn',text);try{const response=await fetch('/api/dev/ride',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,info})});if(!response.ok)throw new Error(`HTTP ${response.status}`);const result=await response.json();info=result.info;add('Bot',result.reply);output.textContent=JSON.stringify(info,null,2);}catch(error){add('Lỗi',String(error));}finally{busy=false;}});
document.querySelector('#reset')!.addEventListener('click',()=>{if(busy)return;info={};history.replaceChildren();output.textContent='';});
