import * as assert from 'assert';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as vscode from 'vscode';
import { createScreenExtension } from '../../scaffolding/create-screen-extension/create-screen-extension';
import * as selectActionsModule from '../../scaffolding/common/select-actions';
import * as selectFieldsModule from '../../scaffolding/common/select-fields';
import * as selectViewsModule from '../../scaffolding/common/select-views';
import * as setViewTypesModule from '../../scaffolding/common/set-view-types';
import * as setScreenExtensionNameModule from '../../scaffolding/create-screen-extension/set-screen-extension-name';
import * as utils from '../../utils';
import { View, Action } from '../../types';
import { Field } from '../../model/view';
import { AcuMateContext } from '../../plugin-context';

function stubWorkspaceFolders(folderPath: string) {
	const workspaceFolder = { uri: vscode.Uri.file(folderPath) } as any;
	sinon.stub(vscode.workspace, 'workspaceFolders').get(() => [workspaceFolder]);
	return workspaceFolder;
}

function stubActiveEditor(filePath: string) {
	const document = {
		uri: vscode.Uri.file(filePath),
		fileName: filePath,
		getText: () => 'graphInfo({ graphType: "SOOrderEntry" })',
	} as any;
	sinon.stub(vscode.window, 'activeTextEditor').get(() => ({ document } as any));
	return document;
}

describe('createScreenExtension scaffolding', () => {
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

	it('requires the active editor to point to a screen file', async () => {
		sinon.stub(vscode.window, 'activeTextEditor').get(() => ({
			document: {
				uri: vscode.Uri.file('C:/repo/not-a-screen.ts'),
				fileName: 'C:/repo/not-a-screen.ts',
				getText: () => '',
			},
		}));

		const errorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined as any);
		const selectViewsStub = sinon.stub(selectViewsModule, 'selectViews');

		await createScreenExtension();

		assert.ok(errorStub.calledOnce);
		assert.strictEqual(selectViewsStub.called, false);
	});

	it('creates screen extension artifacts when inputs are provided', async () => {
		stubWorkspaceFolders('C:/repo');
		stubActiveEditor('C:/repo/screen/src/screens/SO/SO301000/SO301000.ts');

		sinon.stub(setScreenExtensionNameModule, 'setScreenExtensionName').resolves('SO301000Ext');
		sinon.stub(utils, 'tryGetGraphType').returns('SOOrderEntry');

		const view = new View('Details');
		view.dacname = 'PX.Objects.SO.SOOrder';
		view.type = 'entity';
		view.fields = [{ name: 'OrderNbr', displayName: 'Order Nbr' } as Field];

		sinon.stub(selectViewsModule, 'selectViews').resolves([view]);
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
		const tsUri = vscode.Uri.file('C:/repo/screen/src/screens/SO/SO301000/extensions/SO301000Ext.ts');
		const createFileStub = sinon.stub(utils, 'createFile');
		createFileStub.onCall(0).resolves(tsUri);
		createFileStub.onCall(1).resolves(undefined);

		const runNpmCommandStub = sinon.stub(utils, 'runNpmCommand').resolves();
		sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
		const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as any);
		const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
		const warningStub = sinon.stub(vscode.window, 'showWarningMessage');

		await createScreenExtension();

		const folderPath = 'screen\\src\\screens\\SO\\SO301000\\extensions';
		assert.strictEqual(createFileStub.callCount, 2);
		assert.strictEqual(createFileStub.getCall(0).args[0], folderPath);
		assert.strictEqual(createFileStub.getCall(0).args[1], 'SO301000Ext.ts');
		assert.match(createFileStub.getCall(0).args[2] as string, /export class SO301000Ext/);
		assert.strictEqual(createFileStub.getCall(1).args[1], 'SO301000Ext.html');

		assert.ok(runNpmCommandStub.calledOnce);
		assert.strictEqual(runNpmCommandStub.firstCall.args[0], 'prettier . --write');
		assert.ok(showTextDocumentStub.calledOnce);
		assert.ok(executeCommandStub.calledOnceWithExactly('editor.action.organizeImports'));
		assert.strictEqual(warningStub.called, false);
	});

	it('aborts when backend usage is disabled', async () => {
		AcuMateContext.ConfigurationService = {
			useBackend: false,
		} as any;

		const infoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined as any);
		const nameStub = sinon.stub(setScreenExtensionNameModule, 'setScreenExtensionName');

		await createScreenExtension();

		assert.ok(infoStub.calledOnce);
		assert.strictEqual(nameStub.called, false);
	});
});
