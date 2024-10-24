import { BaseMetaItem } from "./base-meta-item";
import { View } from "./View";

export class GraphStructure extends BaseMetaItem {
	public views? : Map<string, View>;

	public actions? : string[];
}


