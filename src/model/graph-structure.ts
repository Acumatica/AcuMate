import { BaseMetaItem } from "./base-meta-item";
import { View } from "./View";

export class GraphStructure extends BaseMetaItem {
	public views? :  { [x: string] : View};

	public actions? : string[];
}


