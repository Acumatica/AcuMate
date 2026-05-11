import * as fs from 'fs';
import * as path from 'path';
import vscode from 'vscode';
import { describe, it } from 'mocha';
import { collectGraphInfoDiagnostics } from '../../validation/tsValidation/graph-info-validation';
import { AcuMateContext } from '../../plugin-context';
import { ConfigurationService } from '../../services/configuration-service';

const tsRootSetting = process.env.TS_SCREEN_VALIDATION_ROOT;
const failOnDiagnostics = isTruthy(process.env.TS_SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS);

if (!tsRootSetting) {
	console.warn('[acumate] Skipping project TypeScript validation test because TS_SCREEN_VALIDATION_ROOT is not set.');
}
else {
	describe('Project TypeScript validation', () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

		it('reports graphInfo diagnostics under configured TypeScript root', async function () {
			this.timeout(600000);

			await applyBackendSettingsFromEnvironment();
			AcuMateContext.ConfigurationService = new ConfigurationService();

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
				if (failOnDiagnostics) {
					throw new Error(
						`TypeScript screen validation reported ${totalDiagnostics} diagnostics across ${failures.length} file(s).`
					);
				}
			}
			else {
				console.log('[acumate] Validation complete with no diagnostics.');
			}
		});
	});
}

function isTruthy(value: string | undefined): boolean {
	return /^(1|true|yes)$/i.test(value || '');
}

async function applyBackendSettingsFromEnvironment(): Promise<void> {
	const settings = readBackendSettingsFromEnvironment();
	if (!Object.keys(settings).length) {
		return;
	}

	const configuration = vscode.workspace.getConfiguration('acuMate');
	for (const [key, value] of Object.entries(settings)) {
		await configuration.update(key, value, vscode.ConfigurationTarget.Global);
	}
	console.log('[acumate] Applied backend connection settings from validation environment.');
}

function readBackendSettingsFromEnvironment(): Record<string, string | boolean> {
	const settings: Record<string, string | boolean> = {};
	const backendUrl = firstEnvValue('ACUMATE_BACKEND_URL', 'ACUMATE_BACKED_URL');
	const login = firstEnvValue('ACUMATE_BACKEND_LOGIN', 'ACUMATE_LOGIN');
	const password = firstEnvValue('ACUMATE_BACKEND_PASSWORD', 'ACUMATE_PASSWORD');
	const tenant = firstEnvValue('ACUMATE_BACKEND_TENANT', 'ACUMATE_TENANT');
	const useBackend = firstEnvValue('ACUMATE_USE_BACKEND');

	if (backendUrl !== undefined) {
		settings.backedUrl = backendUrl;
	}
	if (login !== undefined) {
		settings.login = login;
	}
	if (password !== undefined) {
		settings.password = password;
	}
	if (tenant !== undefined) {
		settings.tenant = tenant;
	}
	if (useBackend !== undefined) {
		settings.useBackend = isTruthy(useBackend);
	}
	else if (Object.keys(settings).length) {
		settings.useBackend = true;
	}

	return settings;
}

function firstEnvValue(...names: string[]): string | undefined {
	for (const name of names) {
		if (process.env[name] !== undefined) {
			return process.env[name];
		}
	}
	return undefined;
}

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
		const start = `${diag.range.start.line + 1}:${diag.range.start.character + 1}`;
		const end = `${diag.range.end.line + 1}:${diag.range.end.character + 1}`;
		return `  [${severity}] range ${start}-${end}: ${diag.message}`;
	});
	return `${relative}\n${lines.join('\n')}`;
}
