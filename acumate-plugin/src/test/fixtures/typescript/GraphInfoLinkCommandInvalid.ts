@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class GraphInfoLinkCommandInvalid extends PXScreen {
	Document = createSingle(LinkCommandInvalidView);
}

export class LinkCommandInvalidView extends PXView {
	@linkCommand("MissingBackendAction")
	TargetNoteID!: PXFieldState;
}
