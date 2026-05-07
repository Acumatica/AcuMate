import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'mocha';

const validateScreensScript = require('../../../scripts/validate-screens.js');
const validateTsScreensScript = require('../../../scripts/validate-ts-screens.js');
const validationTestRunner = require('../../../scripts/validation-test-runner.js');

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
				VSCODE_TEST_VERSION: '1.117.0',
				SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS: 'true',
				SCREEN_VALIDATION_SKIP_COMPILE: 'yes',
			},
			'C:\\Repo'
		);

		assert.strictEqual(options.root, 'custom/screens');
		assert.strictEqual(options.workspaceRoot, 'D:\\Workspace');
		assert.strictEqual(options.vscodeExecutablePath, 'D:\\VSCode\\Code.exe');
		assert.strictEqual(options.vscodeVersion, '1.117.0');
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

	it('uses a pinned VS Code test version by default', () => {
		const options = validateScreensScript.parseArgs([], {}, process.cwd());
		const runOptions = validateScreensScript.buildRunTestsOptions(options, {
			LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
		});

		assert.strictEqual(runOptions.vscodeExecutablePath, undefined);
		assert.strictEqual(runOptions.version, validationTestRunner.DEFAULT_VSCODE_TEST_VERSION);
	});

	it('passes an explicit VS Code test version to @vscode/test-electron', () => {
		const options = validateScreensScript.parseArgs(['--vscode-version', '1.90.0'], {}, process.cwd());
		const runOptions = validateScreensScript.buildRunTestsOptions(options, {
			LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
		});

		assert.strictEqual(runOptions.version, '1.90.0');
		assert.strictEqual(runOptions.vscodeExecutablePath, undefined);
	});

	it('uses an explicit VS Code executable path when provided', () => {
		const options = validateScreensScript.parseArgs(['--vscode-executable-path', 'C:\\VSCode\\Code.exe'], {}, process.cwd());
		const runOptions = validateScreensScript.buildRunTestsOptions(options, {});

		assert.strictEqual(runOptions.vscodeExecutablePath, 'C:\\VSCode\\Code.exe');
		assert.strictEqual(runOptions.version, undefined);
	});
});

describe('validate:screens:ts script', () => {
	it('prefers TypeScript validation environment defaults', () => {
		const options = validateTsScreensScript.parseArgs(
			[],
			{
				TS_SCREEN_VALIDATION_ROOT: 'ts/screens',
				TS_SCREEN_VALIDATION_WORKSPACE_ROOT: 'D:\\TsWorkspace',
				TS_SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS: 'true',
				TS_SCREEN_VALIDATION_SKIP_COMPILE: 'yes',
			},
			'C:\\Repo'
		);

		assert.strictEqual(options.root, 'ts/screens');
		assert.strictEqual(options.workspaceRoot, 'D:\\TsWorkspace');
		assert.strictEqual(options.failOnDiagnostics, true);
		assert.strictEqual(options.skipCompile, true);
	});

	it('builds Extension Host test options for only project TypeScript validation by default', () => {
		const options = validateTsScreensScript.parseArgs(['screens', 'workspace'], {}, process.cwd());
		const runOptions = validateTsScreensScript.buildRunTestsOptions(options, {});

		assert.strictEqual(runOptions.extensionTestsEnv.TS_SCREEN_VALIDATION_ROOT, 'screens');
		assert.strictEqual(runOptions.extensionTestsEnv.ACUMATE_TEST_GREP, 'Project TypeScript validation');
		assert.ok(runOptions.launchArgs.includes(path.resolve('workspace')));
		assert.ok(runOptions.launchArgs.includes('--disable-extensions'));
	});

	it('passes fail-on-diagnostics to the TypeScript validation suite', () => {
		const options = validateTsScreensScript.parseArgs(['--fail-on-diagnostics'], {}, process.cwd());
		const runOptions = validateTsScreensScript.buildRunTestsOptions(options, {});

		assert.strictEqual(runOptions.extensionTestsEnv.TS_SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS, 'true');
	});
});

describe('validation test runner', () => {
	it('disables VS Code versioned update flags recursively', () => {
		const productJson = {
			win32VersionedUpdate: true,
			embedded: {
				win32VersionedUpdate: true,
			},
			other: {
				win32VersionedUpdate: false,
			},
		};

		const changed = validationTestRunner.disableVersionedUpdateFlags(productJson);

		assert.strictEqual(changed, true);
		assert.strictEqual(productJson.win32VersionedUpdate, false);
		assert.strictEqual(productJson.embedded.win32VersionedUpdate, false);
		assert.strictEqual(productJson.other.win32VersionedUpdate, false);
	});

	it('finds product.json in VS Code versioned Windows archives', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acumate-vscode-test-'));
		try {
			const versionRoot = path.join(tempRoot, '0123456789');
			const productJsonPath = path.join(versionRoot, 'resources', 'app', 'product.json');
			fs.mkdirSync(path.dirname(productJsonPath), { recursive: true });
			fs.writeFileSync(productJsonPath, '{}');

			assert.strictEqual(
				validationTestRunner.findProductJsonPath(path.join(tempRoot, 'Code.exe')),
				productJsonPath
			);
		}
		finally {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
