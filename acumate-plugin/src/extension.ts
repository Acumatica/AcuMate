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

const HTML_VALIDATION_DEBOUNCE_MS = 250;
const pendingHtmlValidationTimers = new Map<string, NodeJS.Timeout>();

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
		createScreen();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.createScreenExtension', async () => {
		createScreenExtension();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildMenu', async () => {
		const command = await openBuildMenu();
		if (command) {
			vscode.commands.executeCommand(command);
		}
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensDev', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				devMode: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreens', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByNamesDev', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				devMode: true,
				byNames: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByNames', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				byNames: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByModulesDev', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				devMode: true,
				byModules: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildScreensByModules', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				byModules: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildCurrentScreenDev', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				currentScreen: true,
				devMode: true,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.buildCurrentScreen', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				currentScreen: true,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.repeatLastBuildCommand', async () => {
		buildCommandsCache = {
			...buildCommandsCache,
			...await buildScreens({
				noPrompt: true,
				byNames: buildCommandsCache.byNames,
				byModules: buildCommandsCache.byModules,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.watchCurrentScreen', async () => {
		await buildScreens({
			watch: true,
			currentScreen: true,
		});
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.dropCache', async () => {
		context.globalState.keys().forEach(key => context.globalState.update(key, undefined));
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.validateScreens', async () => {
		await runWorkspaceScreenValidation();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('acumate.validateTypeScriptScreens', async () => {
		await runWorkspaceTypeScriptValidation();
	});
	context.subscriptions.push(disposable);
}


function createIntelliSenseProviders(context: vscode.ExtensionContext) {
	if (!AcuMateContext.ConfigurationService.useBackend) {
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
	AcuMateContext.ConfigurationService = new ConfigurationService();
	const cacheService = new CachedDataService(context.globalState);
	const apiClient = new AcuMateApiClient();
	AcuMateContext.ApiService = new LayeredDataService(cacheService, apiClient);

	AcuMateContext.HtmlValidator = vscode.languages.createDiagnosticCollection('htmlValidator');

	AcuMateContext.repositoryPath = getRepositoryPath();
}

function getRepositoryPath(): string | undefined {
	return findConfig('config', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? getFrontendSourcesPath(), dir: '.git' }).replace('.git\\config', '');
}


export function deactivate() {}
