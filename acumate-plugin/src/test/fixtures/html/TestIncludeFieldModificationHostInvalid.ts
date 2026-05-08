export class InvalidIncludeHostView extends PXView {
	HostField!: PXFieldState;
}

export class InvalidIncludeHostMaint extends PXScreen {
	hostView!: PXView<InvalidIncludeHostView>;
}
