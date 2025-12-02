export class SO301000_ShopForRates {
	Document = createSingle(ShopForRatesHeader);
}

export class ShopForRatesHeader extends PXView {
	ExistingField!: PXFieldState;
	// completion-marker
}
