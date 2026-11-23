export class NotesValidView extends PXView {
	Notes!: PXFieldState;
}

export class TestFieldConfigWithChildrenValid extends PXScreen {
	Document = createSingle(NotesValidView);
}
