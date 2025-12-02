@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class GraphInfoLinkCommandValid extends PXScreen {
	Document = createSingle(LinkCommandValidView);
}

export class LinkCommandValidView extends PXView {
	@linkCommand("ExistingBackendAction")
	TargetNoteID!: PXFieldState<PXFieldOptions.CommitChanges>;
}
