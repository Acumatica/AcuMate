export class HtmlTestEmptyView extends PXView {
	gridField!: PXFieldState;
}

export class HtmlTestEmptyMaint extends PXScreen {
	formView!: PXView<HtmlTestEmptyView>;
	gridView!: PXView<HtmlTestEmptyView>;
}
