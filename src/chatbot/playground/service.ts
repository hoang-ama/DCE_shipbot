import {
  analyzeStaffReply,
  extractCustomerForm,
  translateClarification,
  analyzeCustomerQuoteResponse,
  extractPhoneNumber,
  extractPaymentParty,
  extractPaymentTime,
  translateLogisticsText,
  transcribeLogisticsAudio,
} from '../agents';

export const customer = (body: any = {}) => extractCustomerForm(body);
export const staff = (body: any = {}) => analyzeStaffReply(body);
export const customerClarification = (body: any = {}) => translateClarification(body);
export const customerQuoteResponse = (body: any = {}) => analyzeCustomerQuoteResponse(body);
export const extractPhone = (body: any = {}) => extractPhoneNumber(body);
export const extractPaymentPartyHandler = (body: any = {}) => extractPaymentParty(body);
export { extractPaymentParty };
export const extractPaymentTimeHandler = (body: any = {}) => extractPaymentTime(body);
export { extractPaymentTime };
export const translate = (body: any = {}) => translateLogisticsText(body);
export const transcribe = (body: any = {}) => transcribeLogisticsAudio(body);
