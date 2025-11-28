export class InvalidView extends PXView {
	goodField!: PXFieldState;
}

export class InvalidMaint extends PXScreen {
	validView!: PXView<InvalidView>;
}
