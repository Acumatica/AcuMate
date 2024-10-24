import { BaseMetaItem } from "./base-meta-item";

export class View extends BaseMetaItem {
    public cacheType?: string;
    public cacheName?: string;

    public fields?: string[];
}
