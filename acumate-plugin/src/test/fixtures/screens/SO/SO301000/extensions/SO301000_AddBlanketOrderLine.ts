import { SO301000 } from "../SO301000";

export interface SO301000_AddBlanketOrderLine extends SO301000 {}

export class SO301000_AddBlanketOrderLine {
	BlanketSplits!: PXView<BlanketSplitsView>;
	AddBlanketLineOK!: PXActionState;
}

export class BlanketSplitsView extends PXView {
	BlanketLineField!: PXFieldState;
}
