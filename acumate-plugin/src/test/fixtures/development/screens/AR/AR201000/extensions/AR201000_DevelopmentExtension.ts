export class AR201000_DevelopmentExtension {
	Document = createSingle(ARDevShippingView);
}

export class ARDevShippingView extends PXView {
	@linkCommand("MissingBackendAction")
	TargetNoteID!: PXFieldState;

	@linkCommand("ExistingBackendAction")
	ExistingLink!: PXFieldState;
}
