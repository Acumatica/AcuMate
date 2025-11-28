export class HtmlTestCustomerView extends PXView {
	customerName!: PXFieldState;
	customerId!: PXFieldState;
}

export class HtmlTestMaint extends PXScreen {
	mainView!: PXView<HtmlTestCustomerView>;
	gridView!: PXViewCollection<HtmlTestCustomerView>;
}
