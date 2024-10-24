import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { AcuMateApiClient } from "./api-service";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { CachedDataService } from "./cached-data-service";
import { GraphAPICache } from "./constants";

export class LayeredDataService implements IAcuMateApiClient {

    constructor(private cacheService: CachedDataService, private apiService: AcuMateApiClient) {

    }

    async getGraphs(): Promise<GraphModel[] | undefined> {
        const cachedResult = await this.cacheService.getGraphs();
        if (cachedResult) {
            return cachedResult;
        }

        const apiResult = await this.apiService.getGraphs();
        this.cacheService.store(GraphAPICache, apiResult);
        return apiResult;

    }

    async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        const cachedResult = await this.cacheService.getGraphStructure(graphName);
        if (cachedResult) {
            return cachedResult;
        }

        const apiResult = await this.apiService.getGraphStructure(graphName);
        this.cacheService.store(GraphAPICache, apiResult);
        return apiResult;
    }

}