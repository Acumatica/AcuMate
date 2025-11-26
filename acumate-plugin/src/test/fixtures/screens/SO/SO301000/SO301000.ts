export class SO301000BaseView extends PXView {
	BaseField!: PXFieldState;
}

export class SO301000 extends PXScreen {
	BaseView!: PXView<SO301000BaseView>;
}
