// acumate-disable-file graphInfo
@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Items",
})
export class GraphInfoScreenFileSuppressed extends PXScreen {
	WrongView = createSingle(SuppressedFileView);
	WrongAction!: PXActionState;
}

export class SuppressedFileView extends PXView {}
