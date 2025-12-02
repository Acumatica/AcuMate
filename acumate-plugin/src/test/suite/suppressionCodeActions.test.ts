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

		assert.ok(actions && actions.length > 0, 'Expected suppression code action for html diagnostic');
		const editEntries = actions?.[0].edit?.entries() ?? [];
		assert.ok(editEntries.length > 0, 'Expected workspace edit for suppression action');
		const firstEdit = editEntries[0][1][0];
		assert.ok(
			firstEdit.newText.includes('<!-- acumate-disable-next-line htmlValidator -->'),
			'Expected html suppression directive in edit'
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

		assert.ok(actions && actions.length > 0, 'Expected suppression code action for graphInfo diagnostic');
		const editEntries = actions?.[0].edit?.entries() ?? [];
		const firstEdit = editEntries[0][1][0];
		assert.ok(
			firstEdit.newText.includes('// acumate-disable-next-line graphInfo'),
			'Expected ts suppression directive in edit'
		);
	});
});
