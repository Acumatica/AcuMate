import { MetaBaseMaint } from './base-maint';

class MetaChildView extends PXView {
	childField!: PXFieldState;
}

export class MetaChildMaint extends MetaBaseMaint {
	childView!: PXView<MetaChildView>;
}
