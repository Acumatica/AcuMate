class MetaBaseView extends PXView {
	baseField!: PXFieldState;
}

export class MetaBaseMaint extends PXScreen {
	baseView!: PXView<MetaBaseView>;
}
