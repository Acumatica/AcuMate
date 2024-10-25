import axios from "axios";
import { GraphModel } from "../model/graph-model";
import { json } from "stream/consumers";
import { GraphStructure } from "../model/graph-structure";
import { GraphAPIRoute, GraphAPIStructureRoute, AuthEndpoint, LogoutEndpoint } from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { AcuMateContext } from "../plugin-context";

export class AcuMateApiClient implements IAcuMateApiClient {
    
    private client: axios.AxiosInstance; 

    constructor()
    {
        axios.defaults.withCredentials = true;
        axios.defaults.headers.common = {
            "Content-Type": "application/json"
        };
        axios.defaults.baseURL = AcuMateContext.ConfigurationService.backedUrl;
        // Add a request interceptor
        axios.interceptors.request.use(request => {
            console.log('Starting Request', request);
            return request;  // Make sure to return the request object
        }, error => {
            console.error('Request error', error);
            return Promise.reject(error);
        });
        this.client = axios.create();
    }
    

    private getTrasformRequest() {
        return {
            transformRequest: [
                (data: any) => {
                    if (data) {
                        return JSON.stringify(data);
                    }
                    return undefined;
                }
            ]
        };
    }

    private async auth() {
        const data = {
            "name" : AcuMateContext.ConfigurationService.login,
            "password" : AcuMateContext.ConfigurationService.password,
            "tenant" : AcuMateContext.ConfigurationService.tenant
        };
        return await this.client.post(AuthEndpoint, data, this.getTrasformRequest());
    }

    private async logout(): Promise<void> {
        await this.client.post(LogoutEndpoint);
    }

    private async makePostRequest<T>(route: string, data: any): Promise<T | undefined> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            return undefined;
        }

        try {
            if (AcuMateContext.ConfigurationService.useAuthentification) {
                const authResponse = await this.auth();

                if (authResponse.status !== 200 && authResponse.status !== 204) {
                    return undefined;
                }
            }

            const response = await this.client.post(route, {
                data: data
            }, this.getTrasformRequest());

            console.log(response.data);

            return response.data as T;
        }
        catch (error) {
            console.error('Error making POST request:', error);
            return undefined;
        }
        finally {
            if (AcuMateContext.ConfigurationService.useAuthentification) {
                await this.logout();
            }
        }
    }

    private async makeGetRequest<T>(route: string): Promise<T | undefined> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            return undefined;
        }

        try {
            if (AcuMateContext.ConfigurationService.useAuthentification) {
                const authResponse = await this.auth();

                if (authResponse.status !== 200 && authResponse.status !== 204) {
                    return undefined;
                }
            }

            const response = await this.client.get(route );

            console.log(response.data);

            return response.data as T;
        }
        catch (error) {
            console.error('Error making POST request:', error);
        }
        finally {
            if (AcuMateContext.ConfigurationService.useAuthentification) {
                await this.logout();
            }
        }
    }


    public async getGraphs(): Promise<GraphModel[] | undefined> {
        return await this.makeGetRequest<GraphModel[]>(GraphAPIRoute);
    }

    public async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        return await this.makeGetRequest<GraphStructure>(GraphAPIStructureRoute + graphName);
    }
}

