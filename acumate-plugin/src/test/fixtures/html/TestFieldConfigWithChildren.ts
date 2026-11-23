export class NotesView extends PXView {
	Notes!: PXFieldState;
}

export class TestFieldConfigWithChildren extends PXScreen {
	Document = createSingle(NotesView);
}
