const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runTests } = require('@vscode/test-electron');

const repoRoot = path.resolve(__dirname, '..');

function printUsage() {
	console.log(`Usage: node scripts/validate-screens.js [options]
       node scripts/validate-screens.js [screenRoot] [workspaceRoot] [vscodeExecutablePath]

Options:
  -r, --root <path>                  Screen HTML root. Defaults to SCREEN_VALIDATION_ROOT or src/screens.
  -w, --workspace-root <path>        Workspace opened by the Extension Host. Defaults to SCREEN_VALIDATION_WORKSPACE_ROOT or cwd.
      --vscode-executable-path <p>   Use an installed VS Code instead of downloading one.
      --vscode-version <version>     VS Code version for @vscode/test-electron download/cache.
      --fail-on-diagnostics          Exit non-zero when screen diagnostics are reported.
      --skip-compile                 Do not run npm run compile before starting VS Code tests.
      --all-tests                    Run the whole extension test suite instead of only Project screen validation.
  -h, --help                         Show this help.`);
}

function parseArgs(args, env = process.env, cwd = process.cwd()) {
	const options = {
		root: env.SCREEN_VALIDATION_ROOT || 'src/screens',
		workspaceRoot: env.SCREEN_VALIDATION_WORKSPACE_ROOT || cwd,
		vscodeExecutablePath: env.VSCODE_EXECUTABLE_PATH || env.VSCODE_TEST_EXECUTABLE_PATH,
		vscodeVersion: env.VSCODE_TEST_VERSION,
		failOnDiagnostics: isTruthy(env.SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS),
		skipCompile: isTruthy(env.SCREEN_VALIDATION_SKIP_COMPILE),
		allTests: isTruthy(env.SCREEN_VALIDATION_ALL_TESTS),
		help: false,
	};
	const positionals = [];

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		switch (arg) {
			case '-r':
			case '--root':
				options.root = readValue(args, ++index, arg);
				break;
			case '-w':
			case '--workspace-root':
				options.workspaceRoot = readValue(args, ++index, arg);
				break;
			case '--vscode-executable-path':
				options.vscodeExecutablePath = readValue(args, ++index, arg);
				break;
			case '--vscode-version':
				options.vscodeVersion = readValue(args, ++index, arg);
				break;
			case '--fail-on-diagnostics':
				options.failOnDiagnostics = true;
				break;
			case '--skip-compile':
				options.skipCompile = true;
				break;
			case '--all-tests':
				options.allTests = true;
				break;
			case '-h':
			case '--help':
				options.help = true;
				break;
			default:
				if (arg.startsWith('-')) {
					throw new Error(`Unknown option: ${arg}`);
				}
				positionals.push(arg);
				break;
		}
	}

	if (positionals.length > 3) {
		throw new Error(`Unexpected positional arguments: ${positionals.slice(3).join(' ')}`);
	}
	if (positionals[0]) {
		options.root = positionals[0];
	}
	if (positionals[1]) {
		options.workspaceRoot = positionals[1];
	}
	if (positionals[2]) {
		options.vscodeExecutablePath = positionals[2];
	}

	return options;
}

function readValue(args, index, optionName) {
	if (!args[index]) {
		throw new Error(`${optionName} requires a value.`);
	}
	return args[index];
}

function isTruthy(value) {
	return /^(1|true|yes)$/i.test(value || '');
}

function runCompile() {
	return spawnSync('npm run compile', {
		cwd: repoRoot,
		stdio: 'inherit',
		shell: true,
	});
}

function findInstalledVSCode(env = process.env) {
	const explicit = env.VSCODE_EXECUTABLE_PATH || env.VSCODE_TEST_EXECUTABLE_PATH;
	if (explicit) {
		return explicit;
	}

	const candidates = [];
	if (process.platform === 'win32') {
		if (env.LOCALAPPDATA) {
			candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'));
		}
		if (env.ProgramFiles) {
			candidates.push(path.join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'));
		}
		if (env['ProgramFiles(x86)']) {
			candidates.push(path.join(env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe'));
		}
	}
	else if (process.platform === 'darwin') {
		candidates.push('/Applications/Visual Studio Code.app/Contents/MacOS/Electron');
	}
	else {
		candidates.push('/usr/share/code/code', '/usr/bin/code', '/snap/bin/code');
	}

	return candidates.find(candidate => fs.existsSync(candidate));
}

function buildRunTestsOptions(options, env = process.env) {
	const workspaceRoot = path.resolve(options.workspaceRoot);
	const vscodeExecutablePath = options.vscodeExecutablePath || (options.vscodeVersion ? undefined : findInstalledVSCode(env));
	const extensionTestsEnv = {
		...env,
		SCREEN_VALIDATION_ROOT: options.root,
		SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS: options.failOnDiagnostics ? 'true' : env.SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS,
	};
	if (!options.allTests) {
		extensionTestsEnv.ACUMATE_TEST_GREP = 'Project screen validation';
	}

	const runOptions = {
		extensionDevelopmentPath: repoRoot,
		extensionTestsPath: path.resolve(repoRoot, 'out', 'test', 'suite', 'index'),
		extensionTestsEnv,
		launchArgs: [
			workspaceRoot,
			'--disable-extensions',
		],
	};

	if (vscodeExecutablePath) {
		runOptions.vscodeExecutablePath = vscodeExecutablePath;
	}
	else if (options.vscodeVersion) {
		runOptions.version = options.vscodeVersion;
	}

	return runOptions;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	if (!options.skipCompile) {
		const compileResult = runCompile();
		if (compileResult.status !== 0) {
			if (compileResult.error) {
				console.error(`[acumate] Failed to run npm compile: ${compileResult.error.message}`);
			}
			process.exitCode = compileResult.status ?? 1;
			return;
		}
	}

	const runOptions = buildRunTestsOptions(options);
	console.log(`[acumate] Running screen validation tests under ${options.root}`);
	console.log(`[acumate] Extension Host workspace: ${path.resolve(options.workspaceRoot)}`);
	if (runOptions.vscodeExecutablePath) {
		console.log(`[acumate] VS Code executable: ${runOptions.vscodeExecutablePath}`);
	}

	const exitCode = await runTests(runOptions);
	process.exitCode = exitCode;
}

if (require.main === module) {
	main().catch(error => {
		const code = typeof error?.code === 'number' ? error.code : 1;
		console.error(`[acumate] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = code;
	});
}

module.exports = {
	parseArgs,
	buildRunTestsOptions,
	findInstalledVSCode,
	isTruthy,
};
