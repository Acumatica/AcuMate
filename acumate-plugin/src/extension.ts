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
const fs = require(`fs`);
import { validateHtmlFile } from './validation/htmlValidation/html-validation';

export function activate(context: vscode.ExtensionContext) {
	init(context);

	// Register a completion item provider for TypeScript files
	createIntelliSenseProviders(context);

	createCommands(context);

	createHtmlDiagnostics();

}

function createHtmlDiagnostics() {
	vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document.languageId === 'html') {
			validateHtmlFile(event.document);
		}
	});

	vscode.workspace.onDidOpenTextDocument(doc => {
		if (doc.languageId === 'html') {
			validateHtmlFile(doc);
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
}

function createIntelliSenseProviders(context: vscode.ExtensionContext) {
	let provider = vscode.languages.registerCompletionItemProvider(
		'typescript',
		{
			async provideCompletionItems(document, position, token, context): Promise<vscode.CompletionItem[] | undefined> {
				return provideTSCompletionItems(document, position, token, context);
			},
		},
		'.' // Optional: Trigger completion when typing a specific character (e.g., '.')
	);

	context.subscriptions.push(provider);

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
}



export function deactivate() {}
