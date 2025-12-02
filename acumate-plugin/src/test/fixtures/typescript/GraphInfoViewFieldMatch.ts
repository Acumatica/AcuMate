@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class GraphInfoViewFieldMatch extends PXScreen {
	Document = createSingle(ViewFieldMatch);
}

export class ViewFieldMatch extends PXView {
	OrderNbr!: PXFieldState;
}
