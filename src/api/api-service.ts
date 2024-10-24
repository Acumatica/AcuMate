import { Axios } from "axios";
import { GraphModel } from "../model/graph-model";
import { json } from "stream/consumers";
import { GraphStructure } from "../model/graph-structure";
import { GraphAPIRoute, GraphAPIStructureRoute } from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";

export class AcuMateApiClient implements IAcuMateApiClient {
    private client = new Axios({});

    private async makePostRequest<T>(route: string): Promise<T | undefined> {
        try {
            const response = await this.client.post(`http://msk-lt-195/Delta/` + route, {
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
            const response = await this.client.get(`http://msk-lt-195/Delta/` + route);

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

