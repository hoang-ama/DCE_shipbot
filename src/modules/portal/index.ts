/** Contract only. The original DCE source does not implement Portal token reads. */
export interface PortalTokenProvider {
  getAccessToken(appId: string, oaId: string): Promise<string>;
}
export interface PortalBookingGateway {
  getQuote(request: unknown): Promise<unknown>;
  createBooking(request: unknown): Promise<unknown>;
}
// No implementation is wired into dev_bot until the Portal contract is verified.
