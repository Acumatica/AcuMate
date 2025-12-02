@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class GraphInfoViewFieldMismatch extends PXScreen {
	Document = createSingle(ViewFieldMismatch);
}

export class ViewFieldMismatch extends PXView {
	MissingBackendField!: PXFieldState;
}
