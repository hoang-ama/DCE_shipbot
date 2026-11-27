import { paymentState } from './state';

export function buildVietQrUrl(amountVnd: number, trackingCode: string): string {
  const amt = Math.max(1000, Math.round(amountVnd || 0));
  return `https://img.vietqr.io/image/${encodeURIComponent(paymentState.paymentBankId)}-${encodeURIComponent(paymentState.paymentAccountNo)}-compact2.png?amount=${amt}&addInfo=${encodeURIComponent(trackingCode)}&accountName=${encodeURIComponent(paymentState.paymentAccountName)}`;
}
