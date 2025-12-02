@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class GraphInfoViewFieldCompletion extends PXScreen {
	Document = createSingle(ViewFieldCompletion);
}

export class ViewFieldCompletion extends PXView {
	ExistingField!: PXFieldState;

	// completion-marker
}
