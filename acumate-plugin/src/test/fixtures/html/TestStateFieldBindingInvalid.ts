export class TestStateFieldBindingInvalid extends PXScreen {
	EstimateRecordSelected = createSingle(EstimateRecordSelectedInvalid);
}

export class EstimateRecordSelectedInvalid extends PXView {
	ImageUrl!: PXFieldState;
}
