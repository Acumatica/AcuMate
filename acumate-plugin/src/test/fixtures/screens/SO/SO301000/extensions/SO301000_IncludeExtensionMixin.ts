import { SO301000 } from "../SO301000";
import {
	IncludeExtensionMixinBase,
	IncludeExtensionMixinParameters,
} from "../../../../includes/include-extension-mixin-template";

export interface SO301000_IncludeExtensionMixin extends SO301000, IncludeExtensionMixinBase { }
export class SO301000_IncludeExtensionMixin extends IncludeExtensionMixinBase { }

export interface SO301000_IncludeExtensionMixinParameters extends IncludeExtensionMixinParameters { }
export class SO301000_IncludeExtensionMixinParameters {
	VendorID!: PXFieldState;
}
