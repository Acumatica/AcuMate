export class AR201000_ShippingExtension {
	Document = createSingle(ARShippingView);
}

export class ARShippingView extends PXView {
	@linkCommand("MissingBackendAction")
	TargetNoteID!: PXFieldState;

	@linkCommand("ExistingBackendAction")
	ExistingLink!: PXFieldState;
}
