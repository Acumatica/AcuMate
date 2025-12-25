import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import { GraphAPIRoute, GraphAPIStructureRoute, AuthEndpoint, LogoutEndpoint, FeaturesRoute } from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { AcuMateContext } from "../plugin-context";
import { FeatureModel } from "../model/FeatureModel";
import { logError, logInfo } from "../logging/logger";

interface FeatureSetsResponse {
    sets?: FeatureSetEntry[];
}

interface FeatureSetEntry {
    name?: string;
    features?: FeatureEntry[];
}

interface FeatureEntry {
    name?: string;
    enabled?: boolean;
}

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

        logInfo('Logging out from AcuMate backend.');
        const response = await fetch(AcuMateContext.ConfigurationService.backedUrl!+LogoutEndpoint, {
            method:'POST',
            headers: {
                "Content-Type": "application/json",
                "Cookie": this.sessionCookieHeader
            }
        });

        this.sessionCookieHeader = undefined;

        if (response.ok) {
            logInfo('Backend session closed successfully.');
        } else {
            const errorBody = await response.text().catch(() => "");
            logError('Backend logout failed.', { status: response.status, errorBody });
        }
    }

    private async makeGetRequest<T>(route: string): Promise<T | undefined> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            logInfo('Skipped backend request because acuMate.useBackend is disabled.', { route });
            return undefined;
        }

        try {
            logInfo('Authenticating before backend request.', { route });
            const authResponse = await this.auth();

            if (authResponse.status !== 200 && authResponse.status !== 204) {
                const errorBody = await authResponse.text().catch(() => "");
                logError('AcuMate backend authentication failed.', { status: authResponse.status, errorBody });
                return undefined;
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
            settings.credentials = `include`;
            logInfo('Issuing backend GET request.', { url });
            const response = await fetch(url, settings);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                logError('Backend GET request failed.', { url, status: response.status, errorBody });
                return undefined;
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.includes("application/json")) {
                const errorBody = await response.text().catch(() => "");
                logError('Backend GET returned unexpected content type.', { url, contentType, errorBody });
                return undefined;
            }

            const data = await response.json();
            const summary: Record<string, unknown> = { url };
            if (Array.isArray(data)) {
                summary.items = data.length;
            }
            logInfo('Backend GET succeeded.', summary);

            return data as T;
        }
        catch (error) {
            logError('Unexpected error during backend GET request.', { route, error });
        }
        finally {
            await this.logout();
        }
    }


    public async getGraphs(): Promise<GraphModel[] | undefined> {
        return await this.makeGetRequest<GraphModel[]>(GraphAPIRoute);
    }

    public async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        return await this.makeGetRequest<GraphStructure>(GraphAPIStructureRoute + graphName);
    }

    public async getFeatures(): Promise<FeatureModel[] | undefined> {
        const response = await this.makeGetRequest<FeatureSetsResponse | FeatureModel[]>(FeaturesRoute);
        return normalizeFeatureResponse(response);
    }
}

function normalizeFeatureResponse(response: FeatureSetsResponse | FeatureModel[] | undefined): FeatureModel[] | undefined {
    if (!response) {
        return undefined;
    }

    if (Array.isArray(response)) {
        return response;
    }

    const sets = response.sets;
    if (!Array.isArray(sets)) {
        return undefined;
    }

    const flattened: FeatureModel[] = [];
    for (const set of sets) {
        if (!set?.name || !Array.isArray(set.features)) {
            continue;
        }

        for (const feature of set.features) {
            if (!feature?.name) {
                continue;
            }

            flattened.push({
                featureName: `${set.name}+${feature.name}`,
                enabled: Boolean(feature.enabled),
                featureSet: set.name
            });
        }
    }

    return flattened;
}

