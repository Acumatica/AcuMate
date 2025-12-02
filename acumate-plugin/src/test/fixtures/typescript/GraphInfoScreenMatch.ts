@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Items",
})
export class GraphInfoScreenMatch extends PXScreen {
	Document = createSingle(MatchView);
	SaveAction!: PXActionState;
}

export class MatchView extends PXView {}
