import { SO301000 } from "../SO301000";
import { SO301000_Approvals } from "./SO301000_Approvals";

export interface SO301000_Discounts extends SO301000, SO301000_Approvals {}

export class SO301000_Discounts {
	DiscountDetails = createCollection(SODiscountDetails);
}

export class SODiscountDetails extends PXView {
	DiscountID!: PXFieldState;
}
