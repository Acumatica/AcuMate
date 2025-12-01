import { SO301000 } from "../SO301000";

export interface SO301000_FieldSelectors extends SO301000 {}

export class SO301000_FieldSelectors {
	SelectorView!: PXView<SelectorView>;
}

export class SelectorView extends PXView {
	AMCuryEstimateTotal!: PXFieldState;
	AMEstimateQty!: PXFieldState;
	AMInvalidSelector!: PXFieldState;
}
