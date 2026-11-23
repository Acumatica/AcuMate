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

    private getScopePrefix(): string {
        const backendUrl = AcuMateContext.ConfigurationService?.backedUrl?.trim().toLowerCase() ?? "";
        const tenant = AcuMateContext.ConfigurationService?.tenant?.trim().toLowerCase() ?? "";
        return `${backendUrl}|${tenant}::`;
    }

    store(key: string, apiResult: any) : void {
        if (!AcuMateContext.ConfigurationService.useCache || apiResult === undefined) {
            return;
        }
        this.cache.update(this.getScopePrefix() + key, apiResult);
    }

    async getGraphs(): Promise<GraphModel[] | undefined> {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        return this.cache.get(this.getScopePrefix() + GraphAPICache) as GraphModel[];
    }

    async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        return this.cache.get(this.getScopePrefix() + GraphAPIStructureCachePrefix + graphName) as GraphStructure;
    }

    async getFeatures(): Promise<FeatureModel[] | undefined> {
        if (!AcuMateContext.ConfigurationService.useCache) {
            return;
        }
        return this.cache.get(this.getScopePrefix() + FeaturesCache) as FeatureModel[];
    }
}