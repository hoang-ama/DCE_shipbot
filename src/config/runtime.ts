// Internal application settings; not environment variables.
// Change these in code only when the corresponding integration is ready.
// Never commit real secrets here or share a ZIP containing them.
export type TokenMode = 'disabled' | 'access_only' | 'local_owner';

export const runtime = {
  host: '0.0.0.0',
  database: {
    name: 'shipbot_db',
    allowRemote: true,
  },
  zalo: {
    live: true,
    tokenMode: 'local_owner' as TokenMode,
    refresh: true,
    idleFollowUp: true,
  },
  chatbot: {
    rideModel: 'gemini-3.8-flash',
    maxSessionHistory: 100,
    maxContextMessages: 30,
  },
  supplier: {
    enabled: true,
    opsPhone: '0934691766',
    opsUserId: '',
    name: 'Dichung Express',
    phone: '',
    userId: '',
  },
  asterisk: {
    znsTemplateId: '',
    webhookSecret: '',
  },
  payment: {
    bankId: 'MB',
    accountNo: '',
    accountName: '',
    webhookSecret: '',
  },
};
