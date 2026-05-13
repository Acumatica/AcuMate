@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "EstimateRecordSelected",
})
export class TestStateFieldBinding extends PXScreen {
	EstimateRecordSelected = createSingle(EstimateRecordSelected);
	SaveAction!: PXActionState;
}

export class EstimateRecordSelected extends PXView {
	ImageUrl!: PXFieldState;
}
