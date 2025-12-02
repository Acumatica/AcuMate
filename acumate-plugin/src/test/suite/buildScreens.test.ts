import * as assert from 'assert';
import sinon from 'sinon';
import { describe, it, afterEach } from 'mocha';
import { buildScreens, openBuildMenu } from '../../build-commands/build-screens';

describe('build screens commands', () => {
	afterEach(() => {
		sinon.restore();
	});

	it('openBuildMenu returns command for selected item', async () => {
		const pickStub = sinon.stub().resolves({ label: 'Build Screens (Dev)' });
		const command = await openBuildMenu({
			window: {
				showQuickPick: pickStub,
				showInputBox: sinon.stub(),
				createTerminal: sinon.stub(),
			} as any,
		});

		assert.strictEqual(command, 'acumate.buildScreensDev');
		assert.ok(pickStub.calledOnce, 'expected quick pick to be invoked');
	});

	it('buildScreens builds current screen and installs modules when missing', async () => {
		const sentCommands: string[] = [];
		const terminal = {
			sendText: (value: string) => sentCommands.push(value),
			show: sinon.stub(),
		};

		const createTerminal = sinon.stub().returns(terminal);
		const existsSync = sinon.stub().returns(false);

		const deps = {
			window: {
				showQuickPick: sinon.stub(),
				showInputBox: sinon.stub(),
				createTerminal,
			} as any,
			fs: { existsSync } as any,
			getFrontendSourcesPath: () => 'C:/frontend',
			getOpenedScreenId: () => 'SM201000',
			getScreenAppPath: () => 'C:/frontend/screen',
			getScreensSrcPath: () => 'C:/frontend/screen/src/screens',
		};

		const cache = await buildScreens({ currentScreen: true, devMode: true, watch: true }, deps);

		assert.deepStrictEqual(sentCommands, [
			'cd C:/frontend',
			'npm run getmodules',
			'cd C:/frontend/screen/src/screens',
			'npm run watch-dev --- --env screenIds="SM201000"',
		]);
		assert.deepStrictEqual(cache, { currentScreen: true, byNames: false, byModules: false });
	});

	it('buildScreens reuses cached names without prompting', async () => {
		const sentCommands: string[] = [];
		const terminal = {
			sendText: (value: string) => sentCommands.push(value),
			show: sinon.stub(),
		};

		const createTerminal = sinon.stub().returns(terminal);
		const showInputBox = sinon.stub().throws(new Error('should not prompt when noPrompt=true'));

		const deps = {
			window: {
				showQuickPick: sinon.stub(),
				showInputBox,
				createTerminal,
			} as any,
			fs: { existsSync: () => true } as any,
			getFrontendSourcesPath: () => 'C:/frontend',
			getOpenedScreenId: () => 'SM201000',
			getScreenAppPath: () => 'C:/frontend/screen',
			getScreensSrcPath: () => 'C:/frontend/screen/src/screens',
		};

		const cache = await buildScreens({ byNames: true, noPrompt: true, cache: { lastEnteredNames: 'SM201000,AR201000' } }, deps);

		assert.deepStrictEqual(sentCommands, [
			'cd C:/frontend/screen/src/screens',
			'npm run build --- --env screenIds="SM201000,AR201000"',
		]);
		assert.deepStrictEqual(cache, {
			lastEnteredNames: 'SM201000,AR201000',
			byNames: true,
			byModules: false,
		});
	});
});
