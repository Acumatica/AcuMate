import { SOOrder } from "../../../../../../screens/SO/SO301000/SO301000";

export interface SOOrder_CustomExt extends SOOrder { }
export class SOOrder_CustomExt {
	UsrFirstField!: PXFieldState;
	UsrSecondField!: PXFieldState;
}
