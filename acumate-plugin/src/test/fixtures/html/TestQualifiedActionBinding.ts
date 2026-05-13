export class TestQualifiedActionBinding extends PXScreen {
	Document = createSingle(QualifiedActionDocument);
	SaveAction!: PXActionState;
}

export class QualifiedActionDocument extends PXView {
	AdjustDocAmt!: PXActionState;
	ImageUrl!: PXFieldState;
}
