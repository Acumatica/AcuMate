export class IncludeHostView extends PXView {
	HostField!: PXFieldState;
}

export class IncludeHostMaint extends PXScreen {
	hostView!: PXView<IncludeHostView>;
}
