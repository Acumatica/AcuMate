import { SO301000 } from "../SO301000";

export interface SO301000_CreatePrepaymentInvoice extends SO301000 {}

export class SO301000_CreatePrepaymentInvoice {
	QuickPrepaymentInvoice = createSingle(SOQuickPrepaymentInvoice);
}

export class SOQuickPrepaymentInvoice extends PXView {
	PrepaymentPct!: PXFieldState<PXFieldOptions.CommitChanges>;
	CuryPrepaymentAmt!: PXFieldState<PXFieldOptions.CommitChanges>;
	CuryID!: PXFieldState<PXFieldOptions.Disabled>;
}
