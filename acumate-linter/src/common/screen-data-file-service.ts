import { GraphDto, GraphListItem, IScreenDataService } from "./types";

export class ScreenDataFileService implements IScreenDataService {
	constructor(private dirName: string) {
	}

	public checkGraphName(name: string): boolean {
		const filename = `${this.dirName}\\${graphListFilename}`;
		const json: GraphListItem[] = require(filename);
		if (!json) {
			throw Error("No json");
		}

		if (!json.hasOwnProperty("length")) {
			throw Error("Json in not an array");
		}

		return json.some((g: GraphListItem) => g.name === name);
	}

	public getGraphInfo(name: string): GraphDto {
		return require(`${this.dirName}\\${name}.json`);
	}
}

const graphListFilename = "graphs.json";
