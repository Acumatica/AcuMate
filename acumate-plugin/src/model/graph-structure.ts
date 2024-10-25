import { BaseMetaItem } from "./base-meta-item";
import { Action, View } from "./view";

export class GraphStructure extends BaseMetaItem {
	public views? :  { [x: string] : View};

	public actions? : Action[];
}


