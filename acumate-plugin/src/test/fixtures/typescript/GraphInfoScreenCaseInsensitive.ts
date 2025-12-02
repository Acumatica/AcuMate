@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Items",
})
export class GraphInfoScreenCaseInsensitive extends PXScreen {
	Document = createSingle(CaseInsensitiveView);
	OverrideBlanketTaxZone!: PXActionState;
}

export class CaseInsensitiveView extends PXView {}
