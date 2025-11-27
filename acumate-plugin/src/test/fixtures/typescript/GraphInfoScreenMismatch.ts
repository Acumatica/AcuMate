@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Items",
})
export class GraphInfoScreenMismatch extends PXScreen {
	WrongView = createSingle(MismatchView);
	WrongAction!: PXActionState;
}

export class MismatchView extends PXView {}
