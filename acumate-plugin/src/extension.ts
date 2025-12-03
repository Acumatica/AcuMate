import vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
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
import { validateHtmlFile } from './validation/htmlValidation/html-validation';
import { registerHtmlDefinitionProvider } from './providers/html-definition-provider';
import { registerHtmlCompletionProvider } from './providers/html-completion-provider';
import { registerHtmlHoverProvider } from './providers/html-hover-provider';
import { registerGraphInfoValidation } from './validation/tsValidation/graph-info-validation';
import { registerSuppressionCodeActions } from './providers/suppression-code-actions';
import { registerTsHoverProvider } from './providers/ts-hover-provider';

const HTML_VALIDATION_DEBOUNCE_MS = 250;
const pendingHtmlValidationTimers = new Map<string, NodeJS.Timeout>();
const htmlValidationOutput = vscode.window.createOutputChannel('AcuMate Validation');

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
}

async function runWorkspaceScreenValidation() {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showWarningMessage('Open a workspace folder before running AcuMate screen validation.');
		return;
	}

	const defaultRoot = path.join(workspaceFolder.uri.fsPath, 'src', 'screens');
	const defaultExists = fsExists(defaultRoot);
	const initialValue = defaultExists ? defaultRoot : workspaceFolder.uri.fsPath;
	const targetInput = await vscode.window.showInputBox({
		title: 'Screen validation root',
		prompt: 'Folder containing HTML screens (absolute path or relative to workspace).',
		value: initialValue,
		ignoreFocusOut: true
	});
	if (!targetInput) {
		return;
	}

	const resolvedRoot = path.isAbsolute(targetInput)
		? path.normalize(targetInput)
		: path.normalize(path.join(workspaceFolder.uri.fsPath, targetInput));
	const stats = safeStat(resolvedRoot);
	if (!stats?.isDirectory()) {
		vscode.window.showErrorMessage(`Folder does not exist: ${resolvedRoot}`);
		return;
	}

	const htmlFiles = collectHtmlFiles(resolvedRoot);
	if (!htmlFiles.length) {
		vscode.window.showInformationMessage(`No HTML files found under ${resolvedRoot}.`);
		return;
	}

	htmlValidationOutput.clear();
	htmlValidationOutput.appendLine(`[AcuMate] Validating ${htmlFiles.length} HTML files under ${resolvedRoot}`);

	const issues: Array<{ file: string; diagnostics: vscode.Diagnostic[] }> = [];
	await vscode.window.withProgress(
		{
			title: 'AcuMate HTML validation',
			location: vscode.ProgressLocation.Notification,
			cancellable: false
		},
		async progress => {
			for (const file of htmlFiles) {
				const relative = path.relative(workspaceFolder.uri.fsPath, file);
				progress.report({ message: relative, increment: (1 / htmlFiles.length) * 100 });
				const document = await vscode.workspace.openTextDocument(file);
				await validateHtmlFile(document);
				const diagnostics = [...(AcuMateContext.HtmlValidator?.get(document.uri) ?? [])];
				if (diagnostics.length) {
					issues.push({ file, diagnostics });
				}
				AcuMateContext.HtmlValidator?.delete(document.uri);
			}
		}
	);

	const totalDiagnostics = issues.reduce((sum, entry) => sum + entry.diagnostics.length, 0);
	if (!totalDiagnostics) {
		htmlValidationOutput.appendLine('[AcuMate] No diagnostics reported.');
		vscode.window.showInformationMessage(`AcuMate validation complete: ${htmlFiles.length} files, no diagnostics.`);
		return;
	}

	for (const entry of issues) {
		htmlValidationOutput.appendLine(path.relative(workspaceFolder.uri.fsPath, entry.file) || entry.file);
		for (const diag of entry.diagnostics) {
			const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
			const line = (diag.range?.start?.line ?? 0) + 1;
			const normalizedMessage = diag.message.replace(/\s+/g, ' ').trim();
			htmlValidationOutput.appendLine(`  [${severity}] line ${line}: ${normalizedMessage}`);
		}
		htmlValidationOutput.appendLine('');
	}

	const summary = `AcuMate validation complete: ${totalDiagnostics} diagnostics across ${issues.length} file(s).`;
	htmlValidationOutput.appendLine(`[AcuMate] ${summary}`);
	const choice = await vscode.window.showInformationMessage(summary, 'Open Output');
	if (choice === 'Open Output') {
		htmlValidationOutput.show(true);
	}
}

function collectHtmlFiles(root: string): string[] {
	const stack: string[] = [root];
	const files: string[] = [];
	const excluded = new Set(['node_modules', '.git', '.vscode-test', 'out', 'dist', 'bin', 'obj']);

	while (stack.length) {
		const current = stack.pop()!;
		const stats = safeStat(current);
		if (!stats) {
			continue;
		}

		if (stats.isDirectory()) {
			for (const entry of fs.readdirSync(current)) {
				if (excluded.has(entry)) {
					continue;
				}
				stack.push(path.join(current, entry));
			}
			continue;
		}

		if (stats.isFile() && current.toLowerCase().endsWith('.html')) {
			files.push(current);
		}
	}

	return files.sort((a, b) => a.localeCompare(b));
}

function safeStat(targetPath: string): fs.Stats | undefined {
	try {
		return fs.statSync(targetPath);
	}
	catch {
		return undefined;
	}
}

function fsExists(targetPath: string): boolean {
	return Boolean(safeStat(targetPath));
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
}



export function deactivate() {}
