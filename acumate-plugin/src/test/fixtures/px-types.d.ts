declare class PXScreen {}
declare class PXView<T = any> {}
declare class PXViewCollection<T = any> {}
declare class PXFieldState<T = any> {}
declare class PXActionState {}

declare namespace PXFieldOptions {
	interface Disabled {}
	interface CommitChanges {}
}

declare function createSingle<T>(ctor: new () => T): PXView<T>;
declare function createCollection<T>(ctor: new () => T): PXViewCollection<T>;
declare function graphInfo(options: any): ClassDecorator;
