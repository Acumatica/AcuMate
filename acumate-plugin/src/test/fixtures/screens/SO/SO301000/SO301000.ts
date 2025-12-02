export class SO301000BaseView extends PXView {
	BaseField!: PXFieldState;
}

export class SOOrder extends PXView {
	BaseOrderField!: PXFieldState;
	CuryGoodsExtPriceTotal!: PXFieldState;
	BlanketOpenQty!: PXFieldState;
}

@graphInfo({
	graphType: "PX.SM.ProjectNewUiFrontendFileMaintenance",
	primaryView: "Document"
})
export class SO301000 extends PXScreen {
	BaseView!: PXView<SO301000BaseView>;
	CurrentDocument!: PXView<SOOrder>;
}
