const { spawn } = require('child_process');
const path = require('path');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const repoRoot = path.resolve(__dirname, '..');

const child = spawn(npmCmd, ['test'], {
	cwd: repoRoot,
	env: {
		...process.env,
		TS_SCREEN_VALIDATION_ROOT: process.env.TS_SCREEN_VALIDATION_ROOT || 'src/screens'
	},
	stdio: 'inherit'
});

child.on('exit', code => {
	process.exit(code ?? 1);
});
