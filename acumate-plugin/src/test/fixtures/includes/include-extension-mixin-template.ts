export abstract class IncludeExtensionMixinBase {
	addItemParameters = createSingle(IncludeExtensionMixinParameters);
}

export class IncludeExtensionMixinParameters extends PXView {
	BaseParam!: PXFieldState;
}
