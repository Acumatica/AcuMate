@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Items",
})
export class GraphInfoScreenSuppressed extends PXScreen {
	// acumate-disable-next-line graphInfo
	WrongView = createSingle(SuppressedView);

	// acumate-disable-next-line graphInfo
	WrongAction!: PXActionState;
}

export class SuppressedView extends PXView {}
