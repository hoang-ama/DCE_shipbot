import { runtime } from "../../config/runtime";


export const DCE_OPS_PHONE = runtime.supplier.opsPhone;

export const supplierState = {
  dceOpsPhone: DCE_OPS_PHONE as string,
  dceOpsUserId: runtime.supplier.opsUserId as string,
  defaultSupplierName: runtime.supplier.name as string,
  defaultSupplierPhone: runtime.supplier.phone as string,
  defaultSupplierUserId: runtime.supplier.userId as string,
};
