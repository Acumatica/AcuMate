export class CurrentDocumentView extends PXView {
	CuryVatExemptTotal!: PXFieldState;
	CuryTaxTotal!: PXFieldState;
}

export class ProdItemSelectedView extends PXView {
	DetailSource!: PXFieldState;
	BOMEffDate!: PXFieldState;
}

export class ItemConfigurationView extends PXView {
	ConfigurationID!: PXFieldState;
	Revision!: PXFieldState;
}

export class TestScreenUsingMaint extends PXScreen {
	CurrentDocument!: PXView<CurrentDocumentView>;
	ProdItemSelected!: PXView<ProdItemSelectedView>;
	ItemConfiguration!: PXView<ItemConfigurationView>;
}
