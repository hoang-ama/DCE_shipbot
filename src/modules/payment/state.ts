import { runtime } from "../../config/runtime";


export const paymentState = {
  paymentBankId: runtime.payment.bankId as string,
  paymentAccountNo: runtime.payment.accountNo as string,
  paymentAccountName: runtime.payment.accountName as string,
};

export const PAYMENT_WEBHOOK_SECRET: string = runtime.payment.webhookSecret;
