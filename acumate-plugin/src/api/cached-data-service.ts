import { Memento } from "vscode";
import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { FeaturesCache, GraphAPICache, GraphAPIStructureCachePrefix } from "./constants";
import { AcuMateContext } from "../plugin-context";
import { FeatureModel } from "../model/FeatureModel";


export class CachedDataService implements IAcuMateApiClient {
    constructor(private cache: Memento)
    {
        
    }

    store(key: string, apiResult: any) : void {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        this.cache.update(key, apiResult);
    }

    async getGraphs(): Promise<GraphModel[] | undefined> {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        return this.cache.get(GraphAPICache) as GraphModel[];
    }

    async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        return this.cache.get(GraphAPIStructureCachePrefix + graphName) as GraphStructure;
    }

    async getFeatures(): Promise<FeatureModel[] | undefined> {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        return this.cache.get(FeaturesCache) as FeatureModel[];
    }
}