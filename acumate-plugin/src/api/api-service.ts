import { GraphModel } from "../model/graph-model";
import { GraphStructure } from "../model/graph-structure";
import {
    GraphAPIRoute,
    GraphAPIStructureRoute,
    AuthEndpoint,
    LogoutEndpoint,
    FeaturesRoute,
    LegacyFeaturesRoute
} from "./constants";
import { IAcuMateApiClient } from "./acu-mate-api-client";
import { AcuMateContext } from "../plugin-context";
import { FeatureModel } from "../model/FeatureModel";
import { logError, logInfo, logWarn } from "../logging/logger";

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

interface HttpGetResult<T> {
    status: number;
    data?: T;
}

export class AcuMateApiClient implements IAcuMateApiClient {

    private sessionCookieHeader?: string;
    private readonly unsupportedMetadataBackendUrls = new Set<string>();
    private readonly unsupportedLegacyFeatureUrls = new Set<string>();

    public resetState(): void {
        this.unsupportedMetadataBackendUrls.clear();
        this.unsupportedLegacyFeatureUrls.clear();
    }

    private getNormalizedBackendKey(): string | undefined {
        const url = AcuMateContext.ConfigurationService?.backedUrl?.trim();
        return url ? url.toLowerCase() : undefined;
    }

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
            "tenant" : AcuMateContext.ConfigurationService.tenant?.trim() || undefined
        };
        const response = await fetch(AcuMateContext.ConfigurationService.backedUrl! + AuthEndpoint, {
            method: 'POST',
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
        const response = await fetch(AcuMateContext.ConfigurationService.backedUrl! + LogoutEndpoint, {
            method: 'POST',
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

    private async makeGetRequestDetailed<T>(route: string): Promise<HttpGetResult<T>> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            logInfo('Skipped backend request because acuMate.useBackend is disabled.', { route });
            return { status: 0 };
        }

        if (!AcuMateContext.ConfigurationService.backedUrl?.trim()) {
            return { status: 0 };
        }

        try {
            logInfo('Authenticating before backend request.', { route });
            const authResponse = await this.auth();

            if (authResponse.status !== 200 && authResponse.status !== 204) {
                const errorBody = await authResponse.text().catch(() => "");
                logError('AcuMate backend authentication failed.', { status: authResponse.status, errorBody });
                return { status: authResponse.status };
            }

            const url = AcuMateContext.ConfigurationService.backedUrl! + route;
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (this.sessionCookieHeader) {
                headers.Cookie = this.sessionCookieHeader;
            }

            const settings: RequestInit = {
                method: 'GET',
                headers,
                credentials: 'include'
            };
            logInfo('Issuing backend GET request.', { url });
            const response = await fetch(url, settings);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                logError('Backend GET request failed.', { url, status: response.status, errorBody });
                return { status: response.status };
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.includes("application/json")) {
                const errorBody = await response.text().catch(() => "");
                logError('Backend GET returned unexpected content type.', { url, contentType, errorBody });
                return { status: response.status };
            }

            const data = await response.json();
            const summary: Record<string, unknown> = { url };
            if (Array.isArray(data)) {
                summary.items = data.length;
            }
            logInfo('Backend GET succeeded.', summary);

            return { status: response.status, data: data as T };
        }
        catch (error) {
            logError('Unexpected error during backend GET request.', { route, error });
            return { status: -1 };
        }
        finally {
            await this.logout();
        }
    }

    private markMetadataApiUnsupported(backendKey: string | undefined, route: string): void {
        if (!backendKey || this.unsupportedMetadataBackendUrls.has(backendKey)) {
            return;
        }
        this.unsupportedMetadataBackendUrls.add(backendKey);
        logWarn(
            `Backend endpoint "${route}" returned 404. The ui/meta-data/* API requires Acumatica 2026 R1 or later; skipping further metadata requests for this backend URL until settings change or cache is dropped.`,
            { backendUrl: AcuMateContext.ConfigurationService.backedUrl }
        );
    }

    public async getGraphs(): Promise<GraphModel[] | undefined> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            return undefined;
        }

        const backendKey = this.getNormalizedBackendKey();
        if (!backendKey || this.unsupportedMetadataBackendUrls.has(backendKey)) {
            return undefined;
        }

        const response = await this.makeGetRequestDetailed<GraphModel[]>(GraphAPIRoute);
        if (response.data) {
            return response.data;
        }
        if (response.status === 404) {
            this.markMetadataApiUnsupported(backendKey, GraphAPIRoute);
        }

        return undefined;
    }

    public async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            return undefined;
        }

        const backendKey = this.getNormalizedBackendKey();
        if (!backendKey || this.unsupportedMetadataBackendUrls.has(backendKey)) {
            return undefined;
        }

        const response = await this.makeGetRequestDetailed<GraphStructure>(GraphAPIStructureRoute + graphName);
        return response.data;
    }

    public async getFeatures(): Promise<FeatureModel[] | undefined> {
        if (!AcuMateContext.ConfigurationService.useBackend) {
            return undefined;
        }

        const backendKey = this.getNormalizedBackendKey();
        if (!backendKey) {
            return undefined;
        }

        if (!this.unsupportedMetadataBackendUrls.has(backendKey)) {
            const response = await this.makeGetRequestDetailed<FeatureSetsResponse | FeatureModel[]>(FeaturesRoute);
            if (response.data) {
                return normalizeFeatureResponse(response.data);
            }
            if (response.status === 404) {
                this.markMetadataApiUnsupported(backendKey, FeaturesRoute);
            }
        }

        // Pre-26R1 Acumatica (e.g., 25R2) exposes active tenant feature states at GET ui/features
        if (!this.unsupportedLegacyFeatureUrls.has(backendKey)) {
            const legacyResponse = await this.makeGetRequestDetailed<FeatureSetsResponse | FeatureModel[]>(LegacyFeaturesRoute);
            if (legacyResponse.data) {
                const normalized = normalizeFeatureResponse(legacyResponse.data);
                if (normalized?.length) {
                    logInfo('Loaded feature states from legacy Acumatica endpoint ui/features.', { count: normalized.length });
                    return normalized;
                }
            }
            if (legacyResponse.status === 404) {
                this.unsupportedLegacyFeatureUrls.add(backendKey);
            }
        }

        return undefined;
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
