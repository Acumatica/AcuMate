import { HtmlTestMaint } from "./TestScreen";

export class QuickProcessPanelView extends PXView {
	QuickProcessOk!: PXActionState;
	SiteID!: PXFieldState;
}

export class TestPanelActionValid extends HtmlTestMaint {
	QuickProcessParameters = createSingle(QuickProcessPanelView);
}
