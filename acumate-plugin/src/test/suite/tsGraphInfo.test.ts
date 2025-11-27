import * as path from 'path';
import * as assert from 'assert';
import vscode from 'vscode';
import { describe, it, before } from 'mocha';
import { provideTSCompletionItems } from '../../completionItemProviders/ts-completion-provider';
import { AcuMateContext } from '../../plugin-context';
import { collectGraphInfoDiagnostics } from '../../validation/tsValidation/graph-info-validation';
import { IAcuMateApiClient } from '../../api/acu-mate-api-client';
import { GraphModel } from '../../model/graph-model';
import { GraphStructure } from '../../model/graph-structure';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/typescript');
const completionFixture = path.join(fixturesRoot, 'GraphInfoScreen.ts');
const invalidFixture = path.join(fixturesRoot, 'GraphInfoScreenInvalid.ts');
const validFixture = path.join(fixturesRoot, 'GraphInfoScreenValid.ts');
const mismatchFixture = path.join(fixturesRoot, 'GraphInfoScreenMismatch.ts');
const matchFixture = path.join(fixturesRoot, 'GraphInfoScreenMatch.ts');

const backendGraphName = 'PX.SM.ProjectNewUiFrontendFileMaintenance';

const sampleGraphs: GraphModel[] = [
	{ name: backendGraphName, text: 'Frontend Maint' }
];

class MockApiClient implements IAcuMateApiClient {
	constructor(private readonly structures: Record<string, GraphStructure | undefined> = {}) {}

	async getGraphs(): Promise<GraphModel[] | undefined> {
		return sampleGraphs;
	}

	async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
		return this.structures[graphName];
	}
}

describe('graphInfo decorator assistance', () => {
	before(() => {
		AcuMateContext.ApiService = new MockApiClient();
	});

	it('suggests backend graph names for graphType', async () => {
		const document = await vscode.workspace.openTextDocument(completionFixture);
		const marker = 'graphType: "';
		const caret = document.positionAt(document.getText().indexOf(marker) + marker.length);
		const completions = await provideTSCompletionItems(
			document,
			caret,
			new vscode.CancellationTokenSource().token,
			{ triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
		);
		const labels = (completions ?? []).map(item => item.label);
		assert.ok(labels.includes('PX.SM.ProjectNewUiFrontendFileMaintenance'), 'graph list did not include backend graph');
	});

	it('reports diagnostics for unknown graphType values', async () => {
		const document = await vscode.workspace.openTextDocument(invalidFixture);
		const diagnostics = await collectGraphInfoDiagnostics(document, sampleGraphs);
		assert.ok(diagnostics.some(diag => diag.message.includes('not available')));
	});

	it('accepts graphType values returned by backend', async () => {
		const document = await vscode.workspace.openTextDocument(validFixture);
		const diagnostics = await collectGraphInfoDiagnostics(document, [{ name: 'PX.ValidGraph' }]);
		assert.strictEqual(diagnostics.length, 0, 'expected no diagnostics for valid graphType');
	});

	it('validates PXScreen views and actions against backend metadata', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'SaveAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const mismatchDocument = await vscode.workspace.openTextDocument(mismatchFixture);
		const mismatchDiagnostics = await collectGraphInfoDiagnostics(mismatchDocument, sampleGraphs);
		assert.ok(
			mismatchDiagnostics.some(diag => diag.message.includes('view "WrongView"')),
			'should detect missing backend view'
		);
		assert.ok(
			mismatchDiagnostics.some(diag => diag.message.includes('action "WrongAction"')),
			'should detect missing backend action'
		);

		const matchDocument = await vscode.workspace.openTextDocument(matchFixture);
		const matchDiagnostics = await collectGraphInfoDiagnostics(matchDocument, sampleGraphs);
		assert.strictEqual(matchDiagnostics.length, 0, 'expected no diagnostics when view/action names match backend metadata');
	});
});
