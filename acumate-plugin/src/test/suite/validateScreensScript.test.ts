import * as assert from 'assert';
import * as path from 'path';
import { describe, it } from 'mocha';

const validateScreensScript = require('../../../scripts/validate-screens.js');

describe('validate:screens script', () => {
	it('parses positional root and workspace arguments for npm run compatibility', () => {
		const options = validateScreensScript.parseArgs(
			['src/screens', 'C:\\Work\\FrontendSources', 'C:\\VSCode\\Code.exe'],
			{},
			'C:\\Repo'
		);

		assert.strictEqual(options.root, 'src/screens');
		assert.strictEqual(options.workspaceRoot, 'C:\\Work\\FrontendSources');
		assert.strictEqual(options.vscodeExecutablePath, 'C:\\VSCode\\Code.exe');
	});

	it('prefers environment defaults when arguments are omitted', () => {
		const options = validateScreensScript.parseArgs(
			[],
			{
				SCREEN_VALIDATION_ROOT: 'custom/screens',
				SCREEN_VALIDATION_WORKSPACE_ROOT: 'D:\\Workspace',
				VSCODE_EXECUTABLE_PATH: 'D:\\VSCode\\Code.exe',
				SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS: 'true',
				SCREEN_VALIDATION_SKIP_COMPILE: 'yes',
			},
			'C:\\Repo'
		);

		assert.strictEqual(options.root, 'custom/screens');
		assert.strictEqual(options.workspaceRoot, 'D:\\Workspace');
		assert.strictEqual(options.vscodeExecutablePath, 'D:\\VSCode\\Code.exe');
		assert.strictEqual(options.failOnDiagnostics, true);
		assert.strictEqual(options.skipCompile, true);
	});

	it('builds Extension Host test options for only project screen validation by default', () => {
		const options = validateScreensScript.parseArgs(['screens', 'workspace'], {}, process.cwd());
		const runOptions = validateScreensScript.buildRunTestsOptions(options, {});

		assert.strictEqual(runOptions.extensionTestsEnv.SCREEN_VALIDATION_ROOT, 'screens');
		assert.strictEqual(runOptions.extensionTestsEnv.ACUMATE_TEST_GREP, 'Project screen validation');
		assert.ok(runOptions.launchArgs.includes(path.resolve('workspace')));
		assert.ok(runOptions.launchArgs.includes('--disable-extensions'));
	});

	it('can opt into the full extension test suite', () => {
		const options = validateScreensScript.parseArgs(['--all-tests'], {}, process.cwd());
		const runOptions = validateScreensScript.buildRunTestsOptions(options, {});

		assert.strictEqual(runOptions.extensionTestsEnv.ACUMATE_TEST_GREP, undefined);
	});

	it('prefers an explicit VS Code test version over installed VS Code autodetection', () => {
		const options = validateScreensScript.parseArgs(['--vscode-version', '1.90.0'], {}, process.cwd());
		const runOptions = validateScreensScript.buildRunTestsOptions(options, {
			LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
		});

		assert.strictEqual(runOptions.version, '1.90.0');
		assert.strictEqual(runOptions.vscodeExecutablePath, undefined);
	});
});
