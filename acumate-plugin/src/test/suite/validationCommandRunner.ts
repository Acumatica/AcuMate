import * as path from 'path';
import vscode from 'vscode';

interface ValidationCommandOptions {
	root: string;
	workspaceRoot: string;
}

interface ValidationDiagnostic {
	severity: 'Error' | 'Warning';
	line: number;
	start: ValidationPosition;
	end: ValidationPosition;
	message: string;
}

interface ValidationPosition {
	line: number;
	column: number;
}

interface ValidationDiagnosticEntry {
	file: string;
	diagnostics: ValidationDiagnostic[];
}

interface ValidationResult {
	root: string;
	workspaceRoot: string;
	filesValidated: number;
	diagnosticCount: number;
	diagnostics: ValidationDiagnosticEntry[];
}

export async function run(): Promise<void> {
	const commandId = requireEnv('ACUMATE_VALIDATION_COMMAND');
	const options = readValidationOptions();
	const failOnDiagnostics = isTruthy(process.env.ACUMATE_VALIDATION_FAIL_ON_DIAGNOSTICS);

	await applyBackendSettingsFromEnvironment();
	await activateAcuMateExtension();

	const result = await vscode.commands.executeCommand<ValidationResult>(commandId, options);
	if (!result) {
		throw new Error(`Validation command ${commandId} did not return a result.`);
	}

	printValidationResult(result);
	if (failOnDiagnostics && result.diagnosticCount > 0) {
		throw new Error(
			`Validation reported ${result.diagnosticCount} diagnostics across ${result.diagnostics.length} file(s).`
		);
	}
}

function readValidationOptions(): ValidationCommandOptions {
	return {
		root: requireEnv('ACUMATE_VALIDATION_ROOT'),
		workspaceRoot: requireEnv('ACUMATE_VALIDATION_WORKSPACE_ROOT'),
	};
}

async function activateAcuMateExtension(): Promise<void> {
	const extension = vscode.extensions.getExtension('acumatica.acumate')
		?? vscode.extensions.all.find(candidate =>
			candidate.packageJSON?.publisher === 'acumatica'
			&& candidate.packageJSON?.name === 'acumate'
		);

	if (!extension) {
		throw new Error('Unable to find the AcuMate extension in the Extension Host.');
	}

	await extension.activate();
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
		settings.backedUrl = normalizeBackendUrl(backendUrl);
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

function printValidationResult(result: ValidationResult): void {
	console.log(`[acumate] Validated ${result.filesValidated} file(s) under ${result.root}`);
	if (!result.diagnosticCount) {
		console.log('[acumate] Validation complete with no diagnostics.');
		return;
	}

	console.warn(
		`[acumate] Validation complete with ${result.diagnosticCount} diagnostics across ${result.diagnostics.length} file(s).`
	);
	for (const entry of result.diagnostics) {
		console.warn(formatDiagnosticSummary(result.workspaceRoot, entry));
	}
}

function formatDiagnosticSummary(workspaceRoot: string, entry: ValidationDiagnosticEntry): string {
	const relative = path.relative(workspaceRoot, entry.file) || entry.file;
	const lines = entry.diagnostics.map(diagnostic =>
		`  [${diagnostic.severity}] ${formatDiagnosticRange(diagnostic)}: ${diagnostic.message}`
	);
	return `${relative}\n${lines.join('\n')}`;
}

function formatDiagnosticRange(diagnostic: ValidationDiagnostic): string {
	return `range ${diagnostic.start.line}:${diagnostic.start.column}-${diagnostic.end.line}:${diagnostic.end.column}`;
}

function normalizeBackendUrl(value: string): string {
	return value.endsWith('/') ? value : `${value}/`;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is required.`);
	}
	return value;
}

function firstEnvValue(...names: string[]): string | undefined {
	for (const name of names) {
		if (process.env[name] !== undefined) {
			return process.env[name];
		}
	}
	return undefined;
}

function isTruthy(value: string | undefined): boolean {
	return /^(1|true|yes)$/i.test(value || '');
}
