@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class AR201000 extends PXScreen {
	Document = createSingle(ARInvoiceView);
}

export class ARInvoiceView extends PXView {
	ExistingField!: PXFieldState;
}
