import { Memento } from "vscode";
import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { GraphAPICache, GraphAPIStructureCachePrefix } from "./constants";


export class CachedDataService implements IAcuMateApiClient {
    constructor(private cache: Memento)
    {
        
    }

    store(key: string, apiResult: any) {
        this.cache.update(key, apiResult);
    }

    async getGraphs(): Promise<GraphModel[] | undefined> {
        return this.cache.get(GraphAPICache) as GraphModel[];
    }

    async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        return this.cache.get(GraphAPIStructureCachePrefix + graphName) as GraphStructure;
    }
    
}