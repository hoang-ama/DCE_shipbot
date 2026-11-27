// Offline with respect to Zalo/CRM/DB: invokes AI only, using synthetic messages.
import { processChatPipeline } from '../src/chatbot/engine';
import { chatbotAI } from '../src/config/chatbot-ai';
async function main() {
  const messages = process.argv.slice(2);
  const inputs = messages.length ? messages : ['Xin chào','Chuyển hàng','Chuyển phát nhanh','293 phố Vọng, Hà Nội','thôn Tràng, xã Vĩnh Bảo, Hải Phòng','10 cân quần áo và 5kg hoa quả','10h sáng ngày kia'];
  let info:any = {}, history:any[] = [];
  console.log('Gemini model:', chatbotAI.gemini.model, 'timeout:', chatbotAI.gemini.timeoutMs);
  for (const message of inputs) {
    console.log('\nCUSTOMER:', message);
    const result = await processChatPipeline(message, history, info, {debug:true});
    console.log('BOT:', result.reply);
    console.log('STATE:', JSON.stringify(result.shippingInfo, null, 2));
    console.log('TRACE:', JSON.stringify(result.aiTrace, null, 2));
    info = result.shippingInfo;
    history.push({role:'user',content:message},{role:'model',content:result.reply});
  }
}
main().catch(error=>{console.error('AI smoke failed:',error instanceof Error ? error.message : 'Unknown error');process.exitCode=1;});
