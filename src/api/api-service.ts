import { Axios } from "axios";
import { GraphModel } from "../model/graph-model";
import { json } from "stream/consumers";
import { GraphStructure } from "../model/graph-structure";
import { GraphAPIRoute, GraphAPIStructureRoute } from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { AcuMateContext } from "../plugin-context";

export class AcuMateApiClient implements IAcuMateApiClient {
    private client = new Axios({});

    private async makePostRequest<T>(route: string): Promise<T | undefined> {
        try {
            const response = await this.client.post(AcuMateContext.ConfigurationService.backedUrl + route, {
                data:
                {

                }
            }, {
                headers: {

                }
            });

            console.log(response.data);

            return json(response.data) as T;
        }
        catch (error) {
            console.error('Error making POST request:', error);
            return undefined;
        }
    }

    private async makeGetRequest<T>(route: string): Promise<T | undefined> {
        try {
            const response = await this.client.get(AcuMateContext.ConfigurationService.backedUrl + route);

            console.log(response.data);

            return json(response.data) as T;
        }
        catch (error) {
            console.error('Error making POST request:', error);
        }
    }


    public async getGraphs(): Promise<GraphModel[] | undefined> {
        return await this.makeGetRequest<GraphModel[]>(GraphAPIRoute);
    }

    public async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        return await this.makeGetRequest<GraphStructure>(GraphAPIStructureRoute + graphName);
    }
}

