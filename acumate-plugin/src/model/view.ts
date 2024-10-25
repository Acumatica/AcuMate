import { BaseMetaItem } from "./base-meta-item";

export class View extends BaseMetaItem {
    public cacheType?: string;
    public cacheName?: string;
    public extension?: string;

    public fields?: { [x: string] : Field };
}

export class Action extends BaseMetaItem {
    public displayName?: string;
}

export class Field extends BaseMetaItem {
    public isKey?: boolean; 	
    public displayName?: string;
	public typeName?: string;
    public extension?: string;
}

