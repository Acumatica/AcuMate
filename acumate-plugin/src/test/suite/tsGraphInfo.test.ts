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
const viewFieldMismatchFixture = path.join(fixturesRoot, 'GraphInfoViewFieldMismatch.ts');
const viewFieldMatchFixture = path.join(fixturesRoot, 'GraphInfoViewFieldMatch.ts');
const viewFieldCompletionFixture = path.join(fixturesRoot, 'GraphInfoViewFieldCompletion.ts');
const caseInsensitiveFixture = path.join(fixturesRoot, 'GraphInfoScreenCaseInsensitive.ts');
const suppressedFixture = path.join(fixturesRoot, 'GraphInfoScreenSuppressed.ts');
const suppressedFileFixture = path.join(fixturesRoot, 'GraphInfoScreenFileSuppressed.ts');

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

	it('treats backend metadata names case-insensitively', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				document: { name: 'document' }
			},
			actions: [{ name: 'overrideblankettaxzone' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const caseDocument = await vscode.workspace.openTextDocument(caseInsensitiveFixture);
		const diagnostics = await collectGraphInfoDiagnostics(caseDocument, sampleGraphs);
		assert.strictEqual(
			diagnostics.length,
			0,
			'expected no diagnostics when backend metadata differs by casing only'
		);
	});

	it('validates PXView fields against backend metadata', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: {
					name: 'Document',
					fields: {
						OrderNbr: { name: 'OrderNbr' }
					}
				}
			},
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const mismatchDocument = await vscode.workspace.openTextDocument(viewFieldMismatchFixture);
		const mismatchDiagnostics = await collectGraphInfoDiagnostics(mismatchDocument, sampleGraphs);
		assert.ok(
			mismatchDiagnostics.some(diag => diag.message.includes('MissingBackendField')),
			'should detect PXView fields that are not part of backend metadata'
		);

		const matchDocument = await vscode.workspace.openTextDocument(viewFieldMatchFixture);
		const matchDiagnostics = await collectGraphInfoDiagnostics(matchDocument, sampleGraphs);
		assert.strictEqual(matchDiagnostics.length, 0, 'expected no diagnostics when PXView fields align with backend metadata');
	});

	it('suggests PXFieldState declarations for PXView classes from backend metadata', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: {
					name: 'Document',
					fields: {
						ExistingField: { name: 'ExistingField' },
						SuggestedField: { name: 'SuggestedField', displayName: 'Suggested Field' }
					}
				}
			},
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const document = await vscode.workspace.openTextDocument(viewFieldCompletionFixture);
		const marker = '// completion-marker';
		const markerIndex = document.getText().indexOf(marker);
		assert.ok(markerIndex >= 0, 'completion marker not found');
		const caret = document.positionAt(markerIndex);
		const completions = await provideTSCompletionItems(
			document,
			caret,
			new vscode.CancellationTokenSource().token,
			{ triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
		);
		const labels = (completions ?? []).map(item => item.label);
		assert.ok(labels.includes('SuggestedField'), 'PXView field completion should include backend fields not yet declared');
		assert.ok(!labels.includes('ExistingField'), 'existing PXView fields should not be suggested again');
	});

	it('respects acumate-disable-next-line directives for graphInfo diagnostics', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'SaveAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const suppressedDocument = await vscode.workspace.openTextDocument(suppressedFixture);
		const suppressedDiagnostics = await collectGraphInfoDiagnostics(suppressedDocument, sampleGraphs);
		assert.strictEqual(
			suppressedDiagnostics.length,
			0,
			'Expected acumate-disable-next-line to suppress graphInfo diagnostics'
		);
	});

	it('respects acumate-disable-file directives for graphInfo diagnostics', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'SaveAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const suppressedDocument = await vscode.workspace.openTextDocument(suppressedFileFixture);
		const diagnostics = await collectGraphInfoDiagnostics(suppressedDocument, sampleGraphs);
		assert.strictEqual(
			diagnostics.length,
			0,
			'Expected acumate-disable-file to suppress graphInfo diagnostics in the entire document'
		);
	});
});
