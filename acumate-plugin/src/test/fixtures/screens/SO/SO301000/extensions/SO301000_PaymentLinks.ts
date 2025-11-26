import { SO301000, SOOrder } from "../SO301000";

export interface SO301000_PaymentLinks extends SO301000 {}

export class SO301000_PaymentLinks {
	PayLink = createSingle(CCPayLink);
}

export class CCPayLink extends PXView {
	Url!: PXFieldState;
	LinkStatus!: PXFieldState;
}

export interface SOOrder_PaymentLinks extends SOOrder {}

export class SOOrder_PaymentLinks {
	ProcessingCenterID!: PXFieldState<PXFieldOptions.CommitChanges>;
	DeliveryMethod!: PXFieldState<PXFieldOptions.CommitChanges>;
}
