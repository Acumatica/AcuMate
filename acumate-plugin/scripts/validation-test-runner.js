const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { downloadAndUnzipVSCode, runTests } = require('@vscode/test-electron');

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_VSCODE_TEST_VERSION = '1.118.1';

function createValidationRunner(config) {
	function printUsage() {
		const backendUsage = config.supportsBackendSettings ? `
      --backend-url <url>            AcuMate backend URL for Extension Host validation.
      --backend-login <login>        AcuMate backend login for Extension Host validation.
      --backend-password <password>  AcuMate backend password for Extension Host validation.
      --backend-tenant <tenant>      AcuMate backend tenant for Extension Host validation.` : '';
		console.log(`Usage: node ${config.scriptName} [options]
       node ${config.scriptName} [root] [workspaceRoot] [vscodeExecutablePath]

Options:
  -r, --root <path>                  ${config.rootDescription}
  -w, --workspace-root <path>        Workspace opened by the Extension Host. Defaults to ${config.workspaceRootEnvNames.join(' or ')} or cwd.
      --vscode-executable-path <p>   Use this VS Code executable instead of the @vscode/test-electron cache/download.
      --vscode-version <version>     VS Code version for @vscode/test-electron download/cache. Defaults to VSCODE_TEST_VERSION or ${DEFAULT_VSCODE_TEST_VERSION}.
      --fail-on-diagnostics          Exit non-zero when diagnostics are reported.
      --skip-compile                 Do not run npm run compile before starting VS Code tests.
      --all-tests                    Run the whole extension test suite instead of the validation command runner.
${backendUsage}
  -h, --help                         Show this help.`);
	}

	function parseArgs(args, env = process.env, cwd = process.cwd()) {
		const options = {
			root: firstEnvValue(env, config.rootEnvNames) || config.defaultRoot,
			workspaceRoot: firstEnvValue(env, config.workspaceRootEnvNames) || cwd,
			vscodeExecutablePath: env.VSCODE_EXECUTABLE_PATH || env.VSCODE_TEST_EXECUTABLE_PATH,
			vscodeVersion: env.VSCODE_TEST_VERSION || config.defaultVscodeVersion || DEFAULT_VSCODE_TEST_VERSION,
			failOnDiagnostics: isTruthy(firstEnvValue(env, config.failOnDiagnosticsEnvNames)),
			skipCompile: isTruthy(firstEnvValue(env, config.skipCompileEnvNames)),
			allTests: isTruthy(firstEnvValue(env, config.allTestsEnvNames)),
			backendSettings: config.supportsBackendSettings ? readBackendSettingsFromEnv(env) : undefined,
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
				case '--backend-url':
					ensureBackendSettingsSupported(config, arg);
					options.backendSettings.backendUrl = readValue(args, ++index, arg);
					break;
				case '--backend-login':
					ensureBackendSettingsSupported(config, arg);
					options.backendSettings.login = readValue(args, ++index, arg);
					break;
				case '--backend-password':
					ensureBackendSettingsSupported(config, arg);
					options.backendSettings.password = readValue(args, ++index, arg);
					break;
				case '--backend-tenant':
					ensureBackendSettingsSupported(config, arg);
					options.backendSettings.tenant = readValue(args, ++index, arg);
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

	function buildRunTestsOptions(options, env = process.env) {
		const workspaceRoot = path.resolve(options.workspaceRoot);
		const extensionTestsEnv = {
			...env,
			[config.rootEnvNames[0]]: options.root,
		};
		if (options.failOnDiagnostics) {
			extensionTestsEnv[config.failOnDiagnosticsEnvNames[0]] = 'true';
		}
		else {
			const configuredFailValue = firstEnvValue(env, config.failOnDiagnosticsEnvNames);
			if (configuredFailValue !== undefined) {
				extensionTestsEnv[config.failOnDiagnosticsEnvNames[0]] = configuredFailValue;
			}
		}
		if (!options.allTests) {
			extensionTestsEnv.ACUMATE_VALIDATION_COMMAND = config.commandId;
			extensionTestsEnv.ACUMATE_VALIDATION_ROOT = options.root;
			extensionTestsEnv.ACUMATE_VALIDATION_WORKSPACE_ROOT = workspaceRoot;
			if (options.failOnDiagnostics) {
				extensionTestsEnv.ACUMATE_VALIDATION_FAIL_ON_DIAGNOSTICS = 'true';
			}
		}
		if (config.supportsBackendSettings) {
			applyBackendSettingsEnv(extensionTestsEnv, options.backendSettings);
		}

		const runOptions = {
			extensionDevelopmentPath: repoRoot,
			extensionTestsPath: path.resolve(
				repoRoot,
				'out',
				'test',
				'suite',
				options.allTests ? 'index' : 'validationCommandRunner'
			),
			extensionTestsEnv,
			launchArgs: [
				workspaceRoot,
				'--disable-extensions',
			],
		};

		if (options.vscodeExecutablePath) {
			runOptions.vscodeExecutablePath = options.vscodeExecutablePath;
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
		console.log(`[acumate] Running ${config.logName} under ${options.root}`);
		console.log(`[acumate] Extension Host workspace: ${path.resolve(options.workspaceRoot)}`);
		if (runOptions.vscodeExecutablePath) {
			console.log(`[acumate] VS Code executable: ${runOptions.vscodeExecutablePath}`);
		}
		else if (runOptions.version) {
			console.log(`[acumate] VS Code test version: ${runOptions.version}`);
		}

		const exitCode = await runValidationTests(runOptions);
		process.exitCode = exitCode;
	}

	return {
		printUsage,
		parseArgs,
		buildRunTestsOptions,
		main,
	};
}

async function runValidationTests(runOptions) {
	if (process.platform !== 'win32' || runOptions.vscodeExecutablePath) {
		return runTests(runOptions);
	}

	const vscodeExecutablePath = await downloadAndUnzipVSCode({
		extensionDevelopmentPath: runOptions.extensionDevelopmentPath,
		version: runOptions.version,
	});
	disableWindowsVersionedUpdate(vscodeExecutablePath);

	const resolvedRunOptions = {
		...runOptions,
		vscodeExecutablePath,
	};
	delete resolvedRunOptions.version;

	return runTests(resolvedRunOptions);
}

function disableWindowsVersionedUpdate(vscodeExecutablePath) {
	const productJsonPath = findProductJsonPath(vscodeExecutablePath);
	if (!productJsonPath) {
		return;
	}

	const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	const changed = disableVersionedUpdateFlags(productJson);
	if (changed) {
		fs.writeFileSync(productJsonPath, `${JSON.stringify(productJson, null, '\t')}\n`);
		console.log(`[acumate] Disabled VS Code test update mutex check: ${productJsonPath}`);
	}
}

function findProductJsonPath(vscodeExecutablePath) {
	const installRoot = path.dirname(vscodeExecutablePath);
	const directProductJsonPath = path.join(installRoot, 'resources', 'app', 'product.json');
	if (fs.existsSync(directProductJsonPath)) {
		return directProductJsonPath;
	}

	const entries = fs.readdirSync(installRoot, { withFileTypes: true });
	const versionedEntry = entries.find(entry =>
		entry.isDirectory()
		&& /^[0-9a-f]{10,40}$/i.test(entry.name)
		&& fs.existsSync(path.join(installRoot, entry.name, 'resources', 'app', 'product.json'))
	);

	return versionedEntry
		? path.join(installRoot, versionedEntry.name, 'resources', 'app', 'product.json')
		: undefined;
}

function disableVersionedUpdateFlags(value) {
	if (!value || typeof value !== 'object') {
		return false;
	}

	let changed = false;
	for (const key of Object.keys(value)) {
		if (key === 'win32VersionedUpdate' && value[key] === true) {
			value[key] = false;
			changed = true;
		}
		else if (disableVersionedUpdateFlags(value[key])) {
			changed = true;
		}
	}

	return changed;
}

function readValue(args, index, optionName) {
	if (!args[index]) {
		throw new Error(`${optionName} requires a value.`);
	}
	return args[index];
}

function ensureBackendSettingsSupported(config, optionName) {
	if (!config.supportsBackendSettings) {
		throw new Error(`${optionName} is only supported by backend-powered validation runners.`);
	}
}

function readBackendSettingsFromEnv(env) {
	return {
		backendUrl: firstEnvValue(env, ['ACUMATE_BACKEND_URL', 'ACUMATE_BACKED_URL']),
		login: firstEnvValue(env, ['ACUMATE_BACKEND_LOGIN', 'ACUMATE_LOGIN']),
		password: firstEnvValue(env, ['ACUMATE_BACKEND_PASSWORD', 'ACUMATE_PASSWORD']),
		tenant: firstEnvValue(env, ['ACUMATE_BACKEND_TENANT', 'ACUMATE_TENANT']),
		useBackend: firstEnvValue(env, ['ACUMATE_USE_BACKEND']),
	};
}

function applyBackendSettingsEnv(extensionTestsEnv, backendSettings) {
	if (!backendSettings) {
		return;
	}

	const pairs = [
		['ACUMATE_BACKEND_URL', normalizeBackendUrl(backendSettings.backendUrl)],
		['ACUMATE_BACKEND_LOGIN', backendSettings.login],
		['ACUMATE_BACKEND_PASSWORD', backendSettings.password],
		['ACUMATE_BACKEND_TENANT', backendSettings.tenant],
		['ACUMATE_USE_BACKEND', backendSettings.useBackend],
	];
	let hasBackendSetting = false;
	for (const [name, value] of pairs) {
		if (value !== undefined) {
			extensionTestsEnv[name] = value;
			if (name !== 'ACUMATE_USE_BACKEND') {
				hasBackendSetting = true;
			}
		}
	}
	if (extensionTestsEnv.ACUMATE_USE_BACKEND === undefined && hasBackendSetting) {
		extensionTestsEnv.ACUMATE_USE_BACKEND = 'true';
	}
}

function normalizeBackendUrl(value) {
	if (!value || value.endsWith('/')) {
		return value;
	}
	return `${value}/`;
}

function firstEnvValue(env, names) {
	for (const name of names) {
		if (env[name] !== undefined) {
			return env[name];
		}
	}
	return undefined;
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

module.exports = {
	DEFAULT_VSCODE_TEST_VERSION,
	applyBackendSettingsEnv,
	createValidationRunner,
	disableWindowsVersionedUpdate,
	disableVersionedUpdateFlags,
	findProductJsonPath,
	isTruthy,
	normalizeBackendUrl,
	readBackendSettingsFromEnv,
	repoRoot,
	runValidationTests,
};
