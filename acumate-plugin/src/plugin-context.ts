import { IAcuMateApiClient } from "./api/acu-mate-api-client";
import { ConfigurationService } from "./services/configuration-service";
import vscode from 'vscode';

export class AcuMateContext {
    public static ApiService: IAcuMateApiClient;
	public static ConfigurationService: ConfigurationService;
	public static HtmlValidator: vscode.DiagnosticCollection;
	public static repositoryPath: string | undefined;
}