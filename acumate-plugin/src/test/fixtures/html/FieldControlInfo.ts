@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class FieldControlInfoMaint extends PXScreen {
	Document = createSingle(FieldControlInfoView);
}

export class FieldControlInfoView extends PXView {
	BillShipmentSource!: PXFieldState;
	AlternateField!: PXFieldState;
}
