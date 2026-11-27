export const entityKeys = ['pickup','destination','address','cargo','weight','dimensions','deliveryTime','senderName','receiverName','senderPhone','receiverPhone','phone','notes'] as const;
export type EntityKey = typeof entityKeys[number];
export type CargoItemEvidence = {name:string;weight:string};
export type Entities = Partial<Record<EntityKey,string>> & {items?:CargoItemEvidence[]};
export const operations = ['SET','ADD','UPDATE','REMOVE','CLARIFY','QUESTION','CANCEL_PENDING'] as const;
export type Operation = typeof operations[number];
