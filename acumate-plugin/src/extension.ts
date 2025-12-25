import vscode from 'vscode';
import { CachedDataService } from './api/cached-data-service';
import { AcuMateApiClient } from './api/api-service';
import { AcuMateContext } from './plugin-context';
import { LayeredDataService } from './api/layered-data-service';
import { ConfigurationService } from './services/configuration-service';

// import { BulbActionsProvider } from './providers/bulb-actions-provider';

import { buildScreens, CommandsCache, openBuildMenu } from './build-commands/build-screens';
import { createScreen } from './scaffolding/create-screen/create-screen';
import { createScreenExtension } from './scaffolding/create-screen-extension/create-screen-extension';
import { provideTSCompletionItems } from './completionItemProviders/ts-completion-provider';
const findConfig = require('find-config');
import { validateHtmlFile } from './validation/htmlValidation/html-validation';
import { registerHtmlDefinitionProvider } from './providers/html-definition-provider';
import { registerHtmlCompletionProvider } from './providers/html-completion-provider';
import { registerHtmlHoverProvider } from './providers/html-hover-provider';
import { registerGraphInfoValidation } from './validation/tsValidation/graph-info-validation';
import { registerSuppressionCodeActions } from './providers/suppression-code-actions';
import { registerTsHoverProvider } from './providers/ts-hover-provider';
import { getFrontendSourcesPath } from './utils';
import { runWorkspaceScreenValidation, runWorkspaceTypeScriptValidation } from './validation/workspace-validation';
import { logInfo, logWarn, registerLogger } from './logging/logger';

const HTML_VALIDATION_DEBOUNCE_MS = 250;
const pendingHtmlValidationTimers = new Map<string, NodeJS.Timeout>();
const OPEN_SETTINGS_LABEL = 'Open AcuMate Settings';

let backendConfigWarningShown = false;
let backendDisabledLogged = false;
let backendFeaturesInitialized = false;

function reportBackendConfigurationState() {
	if (!AcuMateContext.ConfigurationService.useBackend) {
		if (!backendDisabledLogged) {
			backendDisabledLogged = true;
			logWarn('acuMate.useBackend is disabled; backend-powered features will remain inactive.');
		}
		return;
	}

	const missing: string[] = [];
	if (!AcuMateContext.ConfigurationService.backedUrl?.trim()) {
		missing.push('acuMate.backedUrl');
	}
	if (!AcuMateContext.ConfigurationService.login?.trim()) {
		missing.push('acuMate.login');
	}
	if (!AcuMateContext.ConfigurationService.password?.trim()) {
		missing.push('acuMate.password');
	}
	if (!AcuMateContext.ConfigurationService.tenant?.trim()) {
		missing.push('acuMate.tenant');
	}

	if (missing.length) {
		const warning = `AcuMate backend is enabled but missing required settings: ${missing.join(', ')}`;
		logWarn(warning);
		if (!backendConfigWarningShown) {
			backendConfigWarningShown = true;
			vscode.window.showWarningMessage(warning, OPEN_SETTINGS_LABEL).then(selection => {
				if (selection === OPEN_SETTINGS_LABEL) {
					vscode.commands.executeCommand('workbench.action.openSettings', 'acuMate');
				}
			});
		}
		return;
	}

	logInfo('AcuMate backend is enabled and configured.', { backedUrl: AcuMateContext.ConfigurationService.backedUrl });
}

function logCommandInvocation(commandId: string, details?: Record<string, unknown>) {
	logInfo(`Command ${commandId} invoked`, details ?? {});
}

function registerConfigurationWatcher(context: vscode.ExtensionContext) {
	const disposable = vscode.workspace.onDidChangeConfiguration(event => {
		if (!event.affectsConfiguration('acuMate')) {
			return;
		}

		logInfo('Detected acuMate settings change. Reloading configuration.');
		AcuMateContext.ConfigurationService.reload();
		backendConfigWarningShown = false;
		backendDisabledLogged = false;
		reportBackendConfigurationState();

		if (AcuMateContext.ConfigurationService.useBackend && !backendFeaturesInitialized) {
			logInfo('Backend enabled after settings change. Initializing IntelliSense providers.');
			createIntelliSenseProviders(context);
		}
	});

	context.subscriptions.push(disposable);
}

export function activate(context: vscode.ExtensionContext) {
	init(context);

	// Register a completion item provider for TypeScript files
	createIntelliSenseProviders(context);

	createCommands(context);

	createHtmlDiagnostics(context);

	// HTML providers share the same metadata to supply navigation + IntelliSense inside markup.
	registerHtmlDefinitionProvider(context);
	registerHtmlCompletionProvider(context);
	registerHtmlHoverProvider(context);
	registerGraphInfoValidation(context);
    registerSuppressionCodeActions(context);

}

function createHtmlDiagnostics(context: vscode.ExtensionContext) {
	const scheduleHtmlValidation = (document: vscode.TextDocument, immediate = false) => {
		if (document.isClosed) {
			return;
		}
		const key = document.uri.toString();
		const existing = pendingHtmlValidationTimers.get(key);
		if (existing) {
			clearTimeout(existing);
			pendingHtmlValidationTimers.delete(key);
		}

		const runValidation = () => {
			pendingHtmlValidationTimers.delete(key);
			if (!document.isClosed) {
				validateHtmlFile(document);
			}
		};

		if (immediate) {
			runValidation();
			return;
		}

		const handle = setTimeout(runValidation, HTML_VALIDATION_DEBOUNCE_MS);
		pendingHtmlValidationTimers.set(key, handle);
	};

	const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document.languageId === 'html') {
			scheduleHtmlValidation(event.document);
		}
	});
	context.subscriptions.push(changeDisposable);

	const openDisposable = vscode.workspace.onDidOpenTextDocument(doc => {
		if (doc.languageId === 'html') {
			scheduleHtmlValidation(doc, true);
		}
	});
	context.subscriptions.push(openDisposable);

	const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor?.document.languageId === 'html') {
			scheduleHtmlValidation(editor.document, true);
		}
	});
	context.subscriptions.push(activeEditorDisposable);

	const closeDisposable = vscode.workspace.onDidCloseTextDocument(doc => {
		if (doc.languageId !== 'html') {
			return;
		}

		const key = doc.uri.toString();
		const pending = pendingHtmlValidationTimers.get(key);
		if (pending) {
			clearTimeout(pending);
			pendingHtmlValidationTimers.delete(key);
		}
		AcuMateContext.HtmlValidator.delete(doc.uri);
	});
	context.subscriptions.push(closeDisposable);

	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'html') {
			scheduleHtmlValidation(doc, true);
		}
	});
}


function createCommands(context: vscode.ExtensionContext) {
	let buildCommandsCache: CommandsCache;
	let disposable;

	disposable = vscode.commands.registerCommand('acumate.createScreen', async () => {
		logCommandInvocation('acumate.createScreen');
		createScreen();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.createScreenExtension', async () => {
		logCommandInvocation('acumate.createScreenExtension');
		createScreenExtension();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildMenu', async () => {
		logCommandInvocation('acumate.buildMenu');
		const command = await openBuildMenu();
		if (command) {
			logInfo('acumate.buildMenu returned selection', { command });
		}
		if (command) {
			vscode.commands.executeCommand(command);
		}
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensDev', async () => {
		const options = {
			devMode: true,
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.buildScreensDev', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreens', async () => {
		const options = {
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.buildScreens', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByNamesDev', async () => {
		const options = {
			devMode: true,
			byNames: true,
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.buildScreensByNamesDev', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByNames', async () => {
		const options = {
			byNames: true,
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.buildScreensByNames', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByModulesDev', async () => {
		const options = {
			devMode: true,
			byModules: true,
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.buildScreensByModulesDev', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByModules', async () => {
		const options = {
			byModules: true,
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.buildScreensByModules', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildCurrentScreenDev', async () => {
		const options = {
			currentScreen: true,
			devMode: true,
		};
		logCommandInvocation('acumate.buildCurrentScreenDev', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildCurrentScreen', async () => {
		const options = {
			currentScreen: true,
		};
		logCommandInvocation('acumate.buildCurrentScreen', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.repeatLastBuildCommand', async () => {
		const options = {
			noPrompt: true,
			byNames: buildCommandsCache?.byNames,
			byModules: buildCommandsCache?.byModules,
			cache: buildCommandsCache,
		};
		logCommandInvocation('acumate.repeatLastBuildCommand', options);
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens(options)
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.watchCurrentScreen', async () => {
		const options = {
			watch: true,
			currentScreen: true,
		};
		logCommandInvocation('acumate.watchCurrentScreen', options);
		await buildScreens(options);
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.dropCache', async () => {
		const keys = context.globalState.keys();
		logCommandInvocation('acumate.dropCache', { clearedKeys: keys.length });
		keys.forEach(key => context.globalState.update(key, undefined));
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.validateScreens', async () => {
		logCommandInvocation('acumate.validateScreens');
		await runWorkspaceScreenValidation();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.validateTypeScriptScreens', async () => {
		logCommandInvocation('acumate.validateTypeScriptScreens');
		await runWorkspaceTypeScriptValidation();
	});
	context.subscriptions.push(disposable);
}


function createIntelliSenseProviders(context: vscode.ExtensionContext) {
	if (backendFeaturesInitialized) {
		return;
	}

	if (!AcuMateContext.ConfigurationService.useBackend) {
		logWarn('Skipping TypeScript IntelliSense providers because acuMate.useBackend is disabled.');
		return;
	}

	let provider = vscode.languages.registerCompletionItemProvider(
		'typescript',
		{
			async provideCompletionItems(document, position, token, context): Promise<vscode.CompletionItem[] | undefined> {
				return provideTSCompletionItems(document, position, token, context);
			},
		},
		'.',
		'"',
		"'"
	);

	context.subscriptions.push(provider);

	registerTsHoverProvider(context);
	backendFeaturesInitialized = true;
	logInfo('TypeScript IntelliSense providers initialized.');

	/*provider = vscode.languages.registerCompletionItemProvider(
		{ language:'html', scheme:'file'},
		{
			async provideCompletionItems(document, position, token, context): Promise<vscode.CompletionItem[] | undefined> {
				return provideHTMLCompletionItems(document, position, token, context);
			},
		},
		'"', ' ' 
	);

	context.subscriptions.push(provider);*/
}

function init(context: vscode.ExtensionContext) {
	registerLogger(context);
	AcuMateContext.ConfigurationService = new ConfigurationService();
	const cacheService = new CachedDataService(context.globalState);
	const apiClient = new AcuMateApiClient();
	AcuMateContext.ApiService = new LayeredDataService(cacheService, apiClient);
	reportBackendConfigurationState();
	registerConfigurationWatcher(context);

	AcuMateContext.HtmlValidator = vscode.languages.createDiagnosticCollection('htmlValidator');

	AcuMateContext.repositoryPath = getRepositoryPath();

	vscode.commands.executeCommand('typescript.restartTsServer');
}

function getRepositoryPath(): string | undefined {
	return findConfig('config', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? getFrontendSourcesPath(), dir: '.git' }).replace('.git\\config', '');
}


export function deactivate() {}
