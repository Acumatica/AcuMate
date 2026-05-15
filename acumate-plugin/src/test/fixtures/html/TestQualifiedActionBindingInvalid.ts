export class TestQualifiedActionBindingInvalid extends PXScreen {
	Document = createSingle(QualifiedActionDocumentInvalid);
}

export class QualifiedActionDocumentInvalid extends PXView {
	AdjustDocAmt!: PXActionState;
}
