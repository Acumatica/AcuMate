declare class PXScreen {}
declare class PXFieldState {}
declare function createSingle(view: unknown): unknown;
declare class ImportedContactBase {}

export class TestViewBindingImportedBase extends PXScreen {
	ImportedContact = createSingle(ImportedContact);
}

export class ImportedContact extends ImportedContactBase {
	CustomField!: PXFieldState;
}
