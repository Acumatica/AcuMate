import { workspace, WorkspaceConfiguration }  from 'vscode';

export class ConfigurationService {
    config: WorkspaceConfiguration;

    constructor() {
        this.config =  workspace.getConfiguration("acuMate");
    }

    get backedUrl() : string | undefined {
        return this.config.get("backedUrl");
    }

}