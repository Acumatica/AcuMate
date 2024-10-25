import { ScreenDataFileService } from "./screen-data-file-service";
import { IScreenDataService } from "./types";

export function getScreenDataService(baseUrl: string): IScreenDataService {
	// TODO: use API, not files
	return new ScreenDataFileService(baseUrl);
};
