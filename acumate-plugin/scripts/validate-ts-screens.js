const { createValidationRunner, isTruthy } = require('./validation-test-runner');

const runner = createValidationRunner({
	scriptName: 'scripts/validate-ts-screens.js',
	rootDescription: 'Screen TypeScript root. Defaults to TS_SCREEN_VALIDATION_ROOT or src/screens.',
	rootEnvNames: ['TS_SCREEN_VALIDATION_ROOT'],
	workspaceRootEnvNames: ['TS_SCREEN_VALIDATION_WORKSPACE_ROOT', 'SCREEN_VALIDATION_WORKSPACE_ROOT'],
	failOnDiagnosticsEnvNames: ['TS_SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS'],
	skipCompileEnvNames: ['TS_SCREEN_VALIDATION_SKIP_COMPILE', 'SCREEN_VALIDATION_SKIP_COMPILE'],
	allTestsEnvNames: ['TS_SCREEN_VALIDATION_ALL_TESTS', 'SCREEN_VALIDATION_ALL_TESTS'],
	defaultRoot: 'src/screens',
	suiteName: 'Project TypeScript validation',
	logName: 'TypeScript screen validation tests',
	supportsBackendSettings: true,
	commandId: 'acumate.validateTypeScriptScreensPipeline',
});

if (require.main === module) {
	runner.main().catch(error => {
		const code = typeof error?.code === 'number' ? error.code : 1;
		console.error(`[acumate] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = code;
	});
}

module.exports = {
	...runner,
	isTruthy,
};
