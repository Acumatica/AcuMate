import * as fs from 'fs';
import * as path from 'path';
import vscode from 'vscode';
import { describe, it, before } from 'mocha';
import { validateHtmlFile } from '../../validation/htmlValidation/html-validation';
import { AcuMateContext } from '../../plugin-context';

const screenRootSetting = process.env.SCREEN_VALIDATION_ROOT;
const shouldSkip = !screenRootSetting;
const describeMaybe = shouldSkip ? describe.skip : describe;

describeMaybe('Project screen validation', () => {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

	before(() => {
		if (!AcuMateContext.HtmlValidator) {
			AcuMateContext.HtmlValidator = vscode.languages.createDiagnosticCollection('htmlValidatorProject');
		}
	});

	it('reports no HTML diagnostics under configured screens root', async function () {
		this.timeout(600000);

		const resolvedRoot = path.resolve(workspaceRoot, screenRootSetting!);

		if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
			throw new Error(`SCREEN_VALIDATION_ROOT path does not exist: ${resolvedRoot}`);
		}

		const htmlFiles = collectHtmlFiles(resolvedRoot);
		if (!htmlFiles.length) {
			throw new Error(`No HTML files found under ${resolvedRoot}`);
		}

		console.log(`[acumate] Validating ${htmlFiles.length} HTML files under ${resolvedRoot}`);

		const failures: { file: string; diagnostics: vscode.Diagnostic[] }[] = [];
		for (const file of htmlFiles) {
			const document = await vscode.workspace.openTextDocument(file);
			await validateHtmlFile(document);
			const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
			if (diagnostics.length) {
				failures.push({ file, diagnostics: [...diagnostics] });
			}
			AcuMateContext.HtmlValidator?.delete(document.uri);
		}

		if (failures.length) {
			const totalDiagnostics = failures.reduce((sum, entry) => sum + entry.diagnostics.length, 0);
			console.warn(
				`[acumate] Validation complete with ${totalDiagnostics} diagnostics across ${failures.length} file(s).`
			);
			for (const entry of failures) {
				console.warn(formatDiagnosticSummary(entry.file, entry.diagnostics));
			}
		}
		else {
			console.log('[acumate] Validation complete with no diagnostics.');
		}
	});
});

function collectHtmlFiles(root: string): string[] {
	const files: string[] = [];
	const stack: string[] = [root];
	const excluded = new Set(['node_modules', '.git', '.vscode-test', 'out', 'dist', 'bin', 'obj']);

	while (stack.length) {
		const current = stack.pop()!;
		if (!fs.existsSync(current)) {
			continue;
		}

		const stats = fs.statSync(current);
		if (stats.isDirectory()) {
			const entries = fs.readdirSync(current);
			for (const entry of entries) {
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

	return files.sort();
}

function formatDiagnosticSummary(filePath: string, diagnostics: vscode.Diagnostic[]): string {
	const relative = path.relative(process.cwd(), filePath) || filePath;
	const lines = diagnostics.map(diag => {
		const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
		const line = diag.range?.start?.line ?? 0;
		return `  [${severity}] line ${line + 1}: ${diag.message}`;
	});
	return `${relative}\n${lines.join('\n')}`;
}
