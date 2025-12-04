@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document",
})
export class GraphInfoViewFieldDoubleUnderscore extends PXScreen {
	Document = createSingle(DoubleUnderscoreView);
}

export class DoubleUnderscoreView extends PXView {
	__CustomField!: PXFieldState;
}
