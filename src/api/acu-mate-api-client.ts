import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";


export interface IAcuMateApiClient {
    getGraphs(): Promise<GraphModel[] | undefined>;

    getGraphStructure(graphName: string): Promise<GraphStructure | undefined>;
}
