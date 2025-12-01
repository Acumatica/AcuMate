import { HtmlTestMaint } from "./TestScreen";

export class InvalidQuickProcessView extends PXView {
	QuickProcessOk!: PXActionState;
}

export class TestPanelActionInvalid extends HtmlTestMaint {
	QuickProcessParameters = createSingle(InvalidQuickProcessView);
}
