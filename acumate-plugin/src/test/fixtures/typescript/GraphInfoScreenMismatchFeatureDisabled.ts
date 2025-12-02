@featureInstalled("PX.Objects.CS.FeaturesSet+VATRecognitionOnPrepaymentsAR")
@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Items"
})
export class GraphInfoScreenMismatchFeatureDisabled extends PXScreen {
	WrongView = createSingle(MismatchViewDisabled);
	WrongAction!: PXActionState;
}

export class MismatchViewDisabled extends PXView {}
