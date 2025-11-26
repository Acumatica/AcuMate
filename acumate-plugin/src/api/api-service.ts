import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { GraphAPIRoute, GraphAPIStructureRoute, AuthEndpoint, LogoutEndpoint } from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { AcuMateContext } from "../plugin-context";

export class AcuMateApiClient implements IAcuMateApiClient {

    private sessionCookieHeader?: string;

    private updateSessionCookies(response: Response) {
        const cookieAccessor = response.headers as unknown as { getSetCookie?: () => string[] };
        const cookies = cookieAccessor.getSetCookie?.();

        if (!cookies?.length) {
            this.sessionCookieHeader = undefined;
            return;
        }

        // Keep only the key=value pairs; cookie attributes such as Expires are not needed in the header
        this.sessionCookieHeader = cookies
            .map(entry => entry.split(";", 1)[0]?.trim())
            .filter(Boolean)
            .join("; ");
    }

    private async auth() {
        const data = {
            "name" : AcuMateContext.ConfigurationService.login,
            "password" : AcuMateContext.ConfigurationService.password,
            "tenant" : AcuMateContext.ConfigurationService.tenant
        };
        const response = await fetch(AcuMateContext.ConfigurationService.backedUrl!+AuthEndpoint, {
            method:'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            this.updateSessionCookies(response);
        }

        return response;
    }

    private async logout(): Promise<void> {
        if (!this.sessionCookieHeader) {
            return;
        }

        await fetch(AcuMateContext.ConfigurationService.backedUrl!+LogoutEndpoint, {
            method:'POST',
            headers: {
                "Content-Type": "application/json",
                "Cookie": this.sessionCookieHeader
            }
        });

        this.sessionCookieHeader = undefined;
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
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (this.sessionCookieHeader) {
                headers.Cookie = this.sessionCookieHeader;
            }

            const settings: RequestInit = {
                method:'GET',
                headers
            };
            if (AcuMateContext.ConfigurationService.useAuthentification) {
                settings.credentials = `include`;
            }
            else {
                settings.credentials = `same-origin`;
            }
            const response = await fetch(url, settings);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                console.error(`GET ${url} failed with status ${response.status}: ${errorBody}`);
                return undefined;
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.includes("application/json")) {
                const errorBody = await response.text().catch(() => "");
                console.error(`GET ${url} returned non-JSON content (${contentType}): ${errorBody}`);
                return undefined;
            }

            const data = await response.json();

            console.log(data);

            return data as T;
        }
        catch (error) {
            console.error('Error making GET request:', error);
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

