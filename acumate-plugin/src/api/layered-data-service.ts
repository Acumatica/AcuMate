import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { AcuMateApiClient } from "./api-service";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { CachedDataService } from "./cached-data-service";
import { FeaturesCache, GraphAPICache, GraphAPIStructureCachePrefix } from "./constants";
import { FeatureModel } from "../model/FeatureModel";
import { logInfo } from "../logging/logger";

export class LayeredDataService implements IAcuMateApiClient {

    private inflightGraphs?: Promise<GraphModel[] | undefined>;
    private inflightFeatures?: Promise<FeatureModel[] | undefined>;
    private readonly inflightStructures = new Map<string, Promise<GraphStructure | undefined>>();

    constructor(private cacheService: CachedDataService, private apiService: AcuMateApiClient) {

    }

    async getGraphs(): Promise<GraphModel[] | undefined> {
        const cachedResult = await this.cacheService.getGraphs();
        if (cachedResult) {
            logInfo('Serving graphs from cache.', { count: cachedResult.length });
            return cachedResult;
        }

        logInfo('Graph cache miss. Fetching from backend...');
        if (this.inflightGraphs) {
            return this.inflightGraphs;
        }

        this.inflightGraphs = this.apiService
            .getGraphs()
            .then(result => {
                logInfo('Graphs fetched from backend.', { count: result?.length ?? 0 });
                this.cacheService.store(GraphAPICache, result);
                return result;
            })
            .finally(() => {
                this.inflightGraphs = undefined;
            });

        return this.inflightGraphs;

    }

    async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        const cachedResult = await this.cacheService.getGraphStructure(graphName);
        if (cachedResult) {
            logInfo('Serving cached graph structure.', { graphName });
            return cachedResult;
        }

        const existing = this.inflightStructures.get(graphName);
        if (existing) {
            return existing;
        }

        logInfo('Graph structure cache miss. Fetching from backend...', { graphName });
        const pending = this.apiService
            .getGraphStructure(graphName)
            .then(result => {
                logInfo('Graph structure fetched from backend.', { graphName, hasResult: Boolean(result) });
                this.cacheService.store(GraphAPIStructureCachePrefix + graphName, result);
                return result;
            })
            .finally(() => {
                this.inflightStructures.delete(graphName);
            });

        this.inflightStructures.set(graphName, pending);
        return pending;
    }

    async getFeatures(): Promise<FeatureModel[] | undefined> {
        const cachedResult = await this.cacheService.getFeatures();
        if (cachedResult) {
            logInfo('Serving feature metadata from cache.', { count: cachedResult.length });
            return cachedResult;
        }

        logInfo('Feature cache miss. Fetching from backend...');
        if (this.inflightFeatures) {
            return this.inflightFeatures;
        }

        this.inflightFeatures = this.apiService
            .getFeatures()
            .then(result => {
                logInfo('Features fetched from backend.', { count: result?.length ?? 0 });
                this.cacheService.store(FeaturesCache, result);
                return result;
            })
            .finally(() => {
                this.inflightFeatures = undefined;
            });

        return this.inflightFeatures;
    }
}