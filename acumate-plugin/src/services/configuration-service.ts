import { workspace, WorkspaceConfiguration }  from 'vscode';

export class ConfigurationService {
    config: WorkspaceConfiguration;

    constructor() {
        this.config =  workspace.getConfiguration("acuMate");
    }

    get backedUrl() : string | undefined {
        return this.config.get("backedUrl");
    }

    get login() : string | undefined {
        return this.config.get("login");
    }

    get password() : string | undefined {
        return this.config.get("password");
    }

    get tenant() : string | undefined {
        return this.config.get("tenant");
    }

    get useCache() : boolean | undefined {
        return this.config.get("useCache");
    }

    get useBackend() : boolean | undefined {
        return this.config.get("useBackend");
    }

    get usePrettier() : boolean | undefined {
        return this.config.get("usePrettier");
    }

    get clearUsages() : boolean | undefined {
        return this.config.get("clearUsages");
    }

}