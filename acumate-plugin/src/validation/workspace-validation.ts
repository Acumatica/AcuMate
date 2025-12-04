import path from 'path';
import * as fs from 'fs';
import vscode from 'vscode';
import { AcuMateContext } from '../plugin-context';
import { validateHtmlFile } from './htmlValidation/html-validation';
import { collectGraphInfoDiagnostics } from './tsValidation/graph-info-validation';

const validationOutput = vscode.window.createOutputChannel('AcuMate Validation');
export const workspacePath = 'WebSites\\Pure\\Site\\FrontendSources\\';

export async function runWorkspaceScreenValidation(): Promise<void> {
	const workspaceFolderUri = vscode.Uri.file(`${AcuMateContext.repositoryPath}${workspacePath}`);
	if (!workspaceFolderUri) {
		vscode.window.showWarningMessage('Open a workspace folder before running AcuMate screen validation.');
		return;
	}

	const defaultRoot = path.join(workspaceFolderUri.fsPath, 'src', 'screens');
	const defaultExists = fsExists(defaultRoot);
	const initialValue = defaultExists ? defaultRoot : workspaceFolderUri.fsPath;
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
		: path.normalize(path.join(workspaceFolderUri.fsPath, targetInput));
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

	validationOutput.clear();
	validationOutput.appendLine(`[AcuMate] Validating ${htmlFiles.length} HTML files under ${resolvedRoot}`);

	const issues: Array<{ file: string; diagnostics: vscode.Diagnostic[] }> = [];
	const cancelled = await vscode.window.withProgress(
		{
			title: 'AcuMate HTML validation',
			location: vscode.ProgressLocation.Notification,
			cancellable: true
		},
		async (progress, token) => {
			for (let index = 0; index < htmlFiles.length; index++) {
				if (token.isCancellationRequested) {
					validationOutput.appendLine('[AcuMate] HTML validation cancelled by user.');
					return true;
				}

				const file = htmlFiles[index];
				const relative = path.relative(workspaceFolderUri.fsPath, file);
				progress.report({ message: relative, increment: (1 / htmlFiles.length) * 100 });
				const document = await vscode.workspace.openTextDocument(file);
				await validateHtmlFile(document);
				const diagnostics = [...(AcuMateContext.HtmlValidator?.get(document.uri) ?? [])];
				if (diagnostics.length) {
					issues.push({ file, diagnostics });
				}
				AcuMateContext.HtmlValidator?.delete(document.uri);
			}

			return false;
		}
	);

	const totalDiagnostics = issues.reduce((sum, entry) => sum + entry.diagnostics.length, 0);
	if (cancelled) {
		const summary = `AcuMate HTML validation cancelled after processing ${issues.length} file(s).`;
		validationOutput.appendLine(`[AcuMate] ${summary}`);
		vscode.window.showInformationMessage(summary, 'Open Output').then(choice => {
			if (choice === 'Open Output') {
				validationOutput.show(true);
			}
		});
		return;
	}
	if (!totalDiagnostics) {
		validationOutput.appendLine('[AcuMate] No diagnostics reported.');
		vscode.window.showInformationMessage(`AcuMate validation complete: ${htmlFiles.length} files, no diagnostics.`);
		return;
	}

	appendDiagnosticsToOutput(workspaceFolderUri.fsPath, issues);

	const summary = `AcuMate validation complete: ${totalDiagnostics} diagnostics across ${issues.length} file(s).`;
	validationOutput.appendLine(`[AcuMate] ${summary}`);
	const choice = await vscode.window.showInformationMessage(summary, 'Open Output');
	if (choice === 'Open Output') {
		validationOutput.show(true);
	}
}

export async function runWorkspaceTypeScriptValidation(): Promise<void> {
	const workspaceFolderUri = vscode.Uri.file(`${AcuMateContext.repositoryPath}${workspacePath}`);
	if (!workspaceFolderUri) {
		vscode.window.showWarningMessage('Open a workspace folder before running AcuMate TypeScript validation.');
		return;
	}

	if (!AcuMateContext.ConfigurationService?.useBackend) {
		vscode.window.showWarningMessage('TypeScript validation requires backend metadata. Enable acuMate.useBackend to continue.');
		return;
	}

	if (!AcuMateContext.ApiService) {
		vscode.window.showErrorMessage('AcuMate backend client is not initialized yet. Try again once initialization completes.');
		return;
	}

	const defaultRoot = path.join(workspaceFolderUri.fsPath, 'src', 'screens');
	const defaultExists = fsExists(defaultRoot);
	const initialValue = defaultExists ? defaultRoot : workspaceFolderUri.fsPath;
	const targetInput = await vscode.window.showInputBox({
		title: 'TypeScript validation root',
		prompt: 'Folder containing screen TypeScript files (absolute path or relative to workspace).',
		value: initialValue,
		ignoreFocusOut: true
	});
	if (!targetInput) {
		return;
	}

	const resolvedRoot = path.isAbsolute(targetInput)
		? path.normalize(targetInput)
		: path.normalize(path.join(workspaceFolderUri.fsPath, targetInput));
	const stats = safeStat(resolvedRoot);
	if (!stats?.isDirectory()) {
		vscode.window.showErrorMessage(`Folder does not exist: ${resolvedRoot}`);
		return;
	}

	const tsFiles = collectTypeScriptFiles(resolvedRoot);
	if (!tsFiles.length) {
		vscode.window.showInformationMessage(`No TypeScript files found under ${resolvedRoot}.`);
		return;
	}

	validationOutput.clear();
	validationOutput.appendLine(`[AcuMate] Validating ${tsFiles.length} TypeScript files under ${resolvedRoot}`);

	const issues: Array<{ file: string; diagnostics: vscode.Diagnostic[] }> = [];
	const cancelled = await vscode.window.withProgress(
		{
			title: 'AcuMate TypeScript validation',
			location: vscode.ProgressLocation.Notification,
			cancellable: true
		},
		async (progress, token) => {
			for (let index = 0; index < tsFiles.length; index++) {
				if (token.isCancellationRequested) {
					validationOutput.appendLine('[AcuMate] TypeScript validation cancelled by user.');
					return true;
				}

				const file = tsFiles[index];
				const relative = path.relative(workspaceFolderUri.fsPath, file);
				progress.report({ message: relative, increment: (1 / tsFiles.length) * 100 });
				try {
					const document = await vscode.workspace.openTextDocument(file);
					const diagnostics = await collectGraphInfoDiagnostics(document);
					if (diagnostics.length) {
						issues.push({ file, diagnostics });
					}
				}
				catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					validationOutput.appendLine(`[AcuMate] Failed to validate ${relative || file}: ${message}`);
				}
			}

			return false;
		}
	);

	const totalDiagnostics = issues.reduce((sum, entry) => sum + entry.diagnostics.length, 0);
	if (cancelled) {
		const summary = `AcuMate TypeScript validation cancelled after processing ${issues.length} file(s).`;
		validationOutput.appendLine(`[AcuMate] ${summary}`);
		const choice = await vscode.window.showInformationMessage(summary, 'Open Output');
		if (choice === 'Open Output') {
			validationOutput.show(true);
		}
		return;
	}
	if (!totalDiagnostics) {
		validationOutput.appendLine('[AcuMate] No diagnostics reported.');
		vscode.window.showInformationMessage(`AcuMate TypeScript validation complete: ${tsFiles.length} files, no diagnostics.`);
		return;
	}

	appendDiagnosticsToOutput(workspaceFolderUri.fsPath, issues);

	const summary = `AcuMate TypeScript validation complete: ${totalDiagnostics} diagnostics across ${issues.length} file(s).`;
	validationOutput.appendLine(`[AcuMate] ${summary}`);
	const choice = await vscode.window.showInformationMessage(summary, 'Open Output');
	if (choice === 'Open Output') {
		validationOutput.show(true);
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

function collectTypeScriptFiles(root: string): string[] {
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

		if (!stats.isFile()) {
			continue;
		}

		const normalized = current.toLowerCase();
		if (normalized.endsWith('.ts') && !normalized.endsWith('.d.ts')) {
			files.push(current);
		}
	}

	return files.sort((a, b) => a.localeCompare(b));
}

function appendDiagnosticsToOutput(
	workspaceRoot: string,
	entries: Array<{ file: string; diagnostics: vscode.Diagnostic[] }>
) {
	for (const entry of entries) {
		validationOutput.appendLine(path.relative(workspaceRoot, entry.file) || entry.file);
		for (const diag of entry.diagnostics) {
			const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
			const line = (diag.range?.start?.line ?? 0) + 1;
			const normalizedMessage = diag.message.replace(/\s+/g, ' ').trim();
			validationOutput.appendLine(`  [${severity}] line ${line}: ${normalizedMessage}`);
		}
		validationOutput.appendLine('');
	}
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
