import * as path from 'path';
import * as assert from 'assert';
import vscode from 'vscode';
import { describe, it, before } from 'mocha';
import { SuppressionCodeActionProvider } from '../../providers/suppression-code-actions';
import { AcuMateContext } from '../../plugin-context';
import { validateHtmlFile } from '../../validation/htmlValidation/html-validation';
import { collectGraphInfoDiagnostics } from '../../validation/tsValidation/graph-info-validation';
import { IAcuMateApiClient } from '../../api/acu-mate-api-client';
import { GraphModel } from '../../model/graph-model';
import { GraphStructure } from '../../model/graph-structure';
import { FeatureModel } from '../../model/FeatureModel';

const htmlFixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/html');
const tsFixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/typescript');
const htmlInvalidPanel = path.join(htmlFixturesRoot, 'TestPanelInvalid.html');
const tsMismatch = path.join(tsFixturesRoot, 'GraphInfoScreenMismatch.ts');
const backendGraphName = 'PX.SM.ProjectNewUiFrontendFileMaintenance';

class MockApiClient implements IAcuMateApiClient {
	constructor(private readonly structures: Record<string, GraphStructure | undefined> = {}) {}

	async getGraphs(): Promise<GraphModel[] | undefined> {
		return [{ name: backendGraphName }];
	}

	async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
		return this.structures[graphName];
	}

	async getFeatures(): Promise<FeatureModel[] | undefined> {
		return [];
	}
}

describe('Suppression code actions', () => {
	before(() => {
		if (!AcuMateContext.HtmlValidator) {
			AcuMateContext.HtmlValidator = vscode.languages.createDiagnosticCollection('htmlValidatorTests');
		}
	});

	it('offers quick fix to suppress html diagnostics', async () => {
		const document = await vscode.workspace.openTextDocument(htmlInvalidPanel);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(diagnostics.length, 'Expected html diagnostics to exist');

		const provider = new SuppressionCodeActionProvider();
		const context: vscode.CodeActionContext = {
			diagnostics,
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};
		const actions = provider.provideCodeActions(
			document,
			diagnostics[0].range,
			context,
			new vscode.CancellationTokenSource().token
		);

		assert.ok(actions && actions.length >= 2, 'Expected suppression code actions for html diagnostic');
		const lineAction = actions?.find(action => action.title.includes('next-line'));
		const fileAction = actions?.find(action => action.title.includes('disable-file'));
		assert.ok(lineAction, 'Expected next-line suppression action');
		assert.ok(fileAction, 'Expected file suppression action');

		const lineEdits = lineAction?.edit?.entries() ?? [];
		assert.ok(lineEdits.length > 0, 'Expected workspace edit for line suppression action');
		const lineEdit = lineEdits[0][1][0];
		assert.ok(
			lineEdit.newText.includes('<!-- acumate-disable-next-line htmlValidator -->'),
			'Expected html next-line suppression directive in edit'
		);

		const fileEdits = fileAction?.edit?.entries() ?? [];
		assert.ok(fileEdits.length > 0, 'Expected workspace edit for file suppression action');
		const fileEdit = fileEdits[0][1][0];
		assert.ok(
			fileEdit.newText.includes('<!-- acumate-disable-file htmlValidator -->'),
			'Expected html file suppression directive in edit'
		);
	});

	it('offers quick fix to suppress graphInfo diagnostics', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'SaveAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const document = await vscode.workspace.openTextDocument(tsMismatch);
		const diagnostics = await collectGraphInfoDiagnostics(document, [{ name: backendGraphName }]);
		assert.ok(diagnostics.length, 'Expected graphInfo diagnostics to exist');

		const provider = new SuppressionCodeActionProvider();
		const context: vscode.CodeActionContext = {
			diagnostics,
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};
		const actions = provider.provideCodeActions(
			document,
			diagnostics[0].range,
			context,
			new vscode.CancellationTokenSource().token
		);

		assert.ok(actions && actions.length >= 2, 'Expected suppression code actions for graphInfo diagnostic');
		const lineAction = actions?.find(action => action.title.includes('next-line'));
		const fileAction = actions?.find(action => action.title.includes('disable-file'));
		assert.ok(lineAction, 'Expected next-line suppression action');
		assert.ok(fileAction, 'Expected file suppression action');

		const lineEdits = lineAction?.edit?.entries() ?? [];
		assert.ok(lineEdits.length > 0, 'Expected workspace edit for line suppression action');
		const lineEdit = lineEdits[0][1][0];
		assert.ok(
			lineEdit.newText.includes('// acumate-disable-next-line graphInfo'),
			'Expected ts next-line suppression directive in edit'
		);

		const fileEdits = fileAction?.edit?.entries() ?? [];
		assert.ok(fileEdits.length > 0, 'Expected workspace edit for file suppression action');
		const fileEdit = fileEdits[0][1][0];
		assert.ok(
			fileEdit.newText.includes('// acumate-disable-file graphInfo'),
			'Expected ts file suppression directive in edit'
		);
	});
});
