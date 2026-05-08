const { createValidationRunner, isTruthy } = require('./validation-test-runner');

const runner = createValidationRunner({
	scriptName: 'scripts/validate-screens.js',
	rootDescription: 'Screen HTML root. Defaults to SCREEN_VALIDATION_ROOT or src/screens.',
	rootEnvNames: ['SCREEN_VALIDATION_ROOT'],
	workspaceRootEnvNames: ['SCREEN_VALIDATION_WORKSPACE_ROOT'],
	failOnDiagnosticsEnvNames: ['SCREEN_VALIDATION_FAIL_ON_DIAGNOSTICS'],
	skipCompileEnvNames: ['SCREEN_VALIDATION_SKIP_COMPILE'],
	allTestsEnvNames: ['SCREEN_VALIDATION_ALL_TESTS'],
	defaultRoot: 'src/screens',
	suiteName: 'Project screen validation',
	logName: 'screen validation tests',
	commandId: 'acumate.validateScreensPipeline',
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
