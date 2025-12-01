export class CurrentDocumentView extends PXView {
	CuryVatExemptTotal!: PXFieldState;
}

export class InvalidScreenUsingViewMaint extends PXScreen {
	CurrentDocument!: PXView<CurrentDocumentView>;
}
