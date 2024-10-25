import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { GraphAPIRoute, GraphAPIStructureRoute, AuthEndpoint, LogoutEndpoint } from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { AcuMateContext } from "../plugin-context";

export class AcuMateApiClient implements IAcuMateApiClient {

    private async auth() {
        const data = {
            "name" : AcuMateContext.ConfigurationService.login,
            "password" : AcuMateContext.ConfigurationService.password,
            "tenant" : AcuMateContext.ConfigurationService.tenant
        };
        return await fetch(AcuMateContext.ConfigurationService.backedUrl!+AuthEndpoint, {
            method:'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            credentials: `include`
        });
    }

    private async logout(): Promise<void> {
        await fetch(AcuMateContext.ConfigurationService.backedUrl!+LogoutEndpoint, {
            method:'POST',
            headers: { "Content-Type": "application/json" },
            credentials: `include`
        });
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

            const url = AcuMateContext.ConfigurationService.backedUrl!+route;
            const settings: RequestInit = {
                method:'POST',
                headers: { "Content-Type": "application/json" },
                
            };
            if (AcuMateContext.ConfigurationService.useAuthentification) {
                settings.credentials = `include`;
            }
            const response = await fetch(url, );

            const data = await response.json();

            console.log(data);

            return data as T;
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

