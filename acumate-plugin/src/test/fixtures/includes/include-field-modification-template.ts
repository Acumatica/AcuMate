export class IncludeModificationView extends PXView {
	Anchor!: PXFieldState;
	IncludedAlpha!: PXFieldState;
	IncludedBeta!: PXFieldState;
}

export class IncludeModificationMaint extends PXScreen {
	includedView!: PXView<IncludeModificationView>;
}
