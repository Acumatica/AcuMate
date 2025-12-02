import { SO301000, SOOrder } from "../SO301000";

export interface SO301000_Manufacturing extends SO301000 {}

export class SO301000_Manufacturing {
	ManufacturingRecords = createSingle(AMManufacturingRecord);
}

export class AMManufacturingRecord extends PXView {
	EstimateNumber!: PXFieldState;
}

export interface SOOrder_Manufacturing extends SOOrder {}

export class SOOrder_Manufacturing {
	AMCuryEstimateTotal!: PXFieldState;
	AMEstimateQty!: PXFieldState;
}
