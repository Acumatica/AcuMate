import * as assert from 'assert';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as vscode from 'vscode';
import { createScreen } from '../../scaffolding/create-screen/create-screen';
import * as selectActionsModule from '../../scaffolding/common/select-actions';
import * as selectFieldsModule from '../../scaffolding/common/select-fields';
import * as selectViewsModule from '../../scaffolding/common/select-views';
import * as setViewTypesModule from '../../scaffolding/common/set-view-types';
import * as selectGraphTypeModule from '../../scaffolding/create-screen/select-graph-type';
import * as setPrimaryViewModule from '../../scaffolding/create-screen/set-primary-view';
import * as setScreenNameModule from '../../scaffolding/create-screen/set-screen-name';
import * as utils from '../../utils';
import { View, Action } from '../../types';
import { Field } from '../../model/view';
import { AcuMateContext } from '../../plugin-context';
import { USE_BACKEND_WARNING } from '../../constants';

function stubWorkspaceFolders(folderPath: string) {
	const workspaceFolder = { uri: vscode.Uri.file(folderPath) } as any;
	sinon.stub(vscode.workspace, 'workspaceFolders').get(() => [workspaceFolder]);
	return workspaceFolder;
}

describe('createScreen scaffolding', () => {
	const originalConfig = AcuMateContext.ConfigurationService;

	beforeEach(() => {
		sinon.restore();
		AcuMateContext.ConfigurationService = {
			useBackend: true,
			usePrettier: true,
			clearUsages: true,
		} as any;
	});

	afterEach(() => {
		AcuMateContext.ConfigurationService = originalConfig;
		sinon.restore();
	});

	it('shows backend warning when backend usage is disabled', async () => {
		AcuMateContext.ConfigurationService = {
			useBackend: false,
		} as any;

		const infoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined as any);
		const screenNameStub = sinon.stub(setScreenNameModule, 'setScreenName');

		await createScreen();

		assert.ok(infoStub.calledOnce);
		assert.strictEqual(infoStub.firstCall.args[0], USE_BACKEND_WARNING);
		assert.strictEqual(screenNameStub.called, false);
	});

	it('aborts when a screen already exists and the user cancels override', async () => {
		stubWorkspaceFolders('C:/repo');

		const screenNameStub = sinon.stub(setScreenNameModule, 'setScreenName').resolves('SO301000');
		sinon.stub(utils, 'checkFileExists').resolves(true);
		const warningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves('Cancel' as any);

		const selectGraphTypeStub = sinon.stub(selectGraphTypeModule, 'selectGraphType');
		const createFileStub = sinon.stub(utils, 'createFile');

		await createScreen();

		assert.ok(screenNameStub.calledOnce);
		assert.ok(warningStub.calledOnce);
		assert.strictEqual(selectGraphTypeStub.called, false, 'should not continue when user cancels override');
		assert.strictEqual(createFileStub.called, false);
	});

	it('creates screen artifacts, formats, and organizes imports on success', async () => {
		const workspaceFolder = stubWorkspaceFolders('C:/repo');

		sinon.stub(setScreenNameModule, 'setScreenName').resolves('SO301000');
		sinon.stub(selectGraphTypeModule, 'selectGraphType').resolves('SOOrderEntry');

		const view = new View('Details');
		view.dacname = 'PX.Objects.SO.SOOrder';
		view.type = 'entity';
		view.fields = [{ name: 'OrderNbr', displayName: 'Order Nbr' } as Field];

		sinon.stub(selectViewsModule, 'selectViews').resolves([view]);
		sinon.stub(setPrimaryViewModule, 'setPrimaryView').resolves('Details');
		sinon.stub(selectActionsModule, 'selectActions').resolves([new Action('Release')]);
		sinon
			.stub(setViewTypesModule, 'setViewTypes')
			.callsFake(async (views: View[]) => {
				views.forEach(v => {
					if (!v.type) {
						v.type = 'entity';
					}
				});
			});
		sinon.stub(selectFieldsModule, 'selectFields').resolves();

		sinon.stub(utils, 'checkFileExists').resolves(false);
		const tsUri = vscode.Uri.file('C:/repo/screen/src/screens/SO/SO301000/SO301000.ts');
		const createFileStub = sinon.stub(utils, 'createFile');
		createFileStub.onCall(0).resolves(tsUri);
		createFileStub.onCall(1).resolves(undefined);

		const runNpmCommandStub = sinon.stub(utils, 'runNpmCommand').resolves();
		sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
		const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as any);
		const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
		const infoStub = sinon.stub(vscode.window, 'showInformationMessage');
		const warningStub = sinon.stub(vscode.window, 'showWarningMessage');

		await createScreen();

		assert.strictEqual(createFileStub.callCount, 2);
		const folderPath = 'screen\\src\\screens\\SO\\SO301000';
		const tsCall = createFileStub.getCall(0);
		assert.strictEqual(tsCall.args[0], folderPath);
		assert.strictEqual(tsCall.args[1], 'SO301000.ts');
		const tsContent = tsCall.args[2] as string;
		assert.match(tsContent, /export class SO301000 extends PXScreen/);
		assert.match(tsContent, /graphType: "SOOrderEntry"/);
		assert.match(tsContent, /primaryView: "Details"/);

		const htmlCall = createFileStub.getCall(1);
		assert.strictEqual(htmlCall.args[0], folderPath);
		assert.strictEqual(htmlCall.args[1], 'SO301000.html');

		assert.ok(runNpmCommandStub.calledOnce);
		assert.strictEqual(runNpmCommandStub.firstCall.args[0], 'prettier ./*.ts --write');
		assert.ok(runNpmCommandStub.firstCall.args[1].includes('SO301000'));

		assert.ok(showTextDocumentStub.calledOnce);
		assert.ok(executeCommandStub.calledOnceWithExactly('editor.action.organizeImports'));
		assert.strictEqual(infoStub.called, false);
		assert.strictEqual(warningStub.called, false);
	});
});
