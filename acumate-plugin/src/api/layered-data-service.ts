import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { AcuMateApiClient } from "./api-service";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { CachedDataService } from "./cached-data-service";
import { FeaturesCache, GraphAPICache, GraphAPIStructureCachePrefix } from "./constants";
import { FeatureModel } from "../model/FeatureModel";

export class LayeredDataService implements IAcuMateApiClient {

    private inflightGraphs?: Promise<GraphModel[] | undefined>;
    private inflightFeatures?: Promise<FeatureModel[] | undefined>;
    private readonly inflightStructures = new Map<string, Promise<GraphStructure | undefined>>();

    constructor(private cacheService: CachedDataService, private apiService: AcuMateApiClient) {

    }

    async getGraphs(): Promise<GraphModel[] | undefined> {
        const cachedResult = await this.cacheService.getGraphs();
        if (cachedResult) {
            return cachedResult;
        }

        if (this.inflightGraphs) {
            return this.inflightGraphs;
        }

        this.inflightGraphs = this.apiService
            .getGraphs()
            .then(result => {
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
            return cachedResult;
        }

        const existing = this.inflightStructures.get(graphName);
        if (existing) {
            return existing;
        }

        const pending = this.apiService
            .getGraphStructure(graphName)
            .then(result => {
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
            return cachedResult;
        }

        if (this.inflightFeatures) {
            return this.inflightFeatures;
        }

        this.inflightFeatures = this.apiService
            .getFeatures()
            .then(result => {
                this.cacheService.store(FeaturesCache, result);
                return result;
            })
            .finally(() => {
                this.inflightFeatures = undefined;
            });

        return this.inflightFeatures;
    }
}