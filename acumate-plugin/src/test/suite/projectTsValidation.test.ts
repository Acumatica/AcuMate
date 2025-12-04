import * as fs from 'fs';
import * as path from 'path';
import vscode from 'vscode';
import { describe, it } from 'mocha';
import { collectGraphInfoDiagnostics } from '../../validation/tsValidation/graph-info-validation';
import { AcuMateContext } from '../../plugin-context';

const tsRootSetting = process.env.TS_SCREEN_VALIDATION_ROOT;
const describeMaybe = tsRootSetting ? describe : describe.skip;

describeMaybe('Project TypeScript validation', () => {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

	it('reports graphInfo diagnostics under configured TypeScript root', async function () {
		this.timeout(600000);

		if (!AcuMateContext.ConfigurationService?.useBackend) {
			this.skip();
			return;
		}

		const resolvedRoot = path.resolve(workspaceRoot, tsRootSetting!);
		if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
			throw new Error(`TS_SCREEN_VALIDATION_ROOT path does not exist: ${resolvedRoot}`);
		}

		const tsFiles = collectTypeScriptFiles(resolvedRoot);
		if (!tsFiles.length) {
			throw new Error(`No TypeScript files found under ${resolvedRoot}`);
		}

		console.log(`[acumate] Validating ${tsFiles.length} TypeScript files under ${resolvedRoot}`);

		const failures: { file: string; diagnostics: vscode.Diagnostic[] }[] = [];
		for (const file of tsFiles) {
			try {
				const document = await vscode.workspace.openTextDocument(file);
				const diagnostics = await collectGraphInfoDiagnostics(document);
				if (diagnostics.length) {
					failures.push({ file, diagnostics: [...diagnostics] });
				}
			}
			catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`[acumate] Failed to validate ${file}: ${message}`);
			}
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

function collectTypeScriptFiles(root: string): string[] {
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

		if (stats.isFile()) {
			const normalized = current.toLowerCase();
			if (normalized.endsWith('.ts') && !normalized.endsWith('.d.ts')) {
				files.push(current);
			}
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
