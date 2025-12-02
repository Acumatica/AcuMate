import * as path from 'path';
import * as assert from 'assert';
import vscode from 'vscode';
import { describe, it, before, beforeEach } from 'mocha';
import { provideTSCompletionItems } from '../../completionItemProviders/ts-completion-provider';
import { AcuMateContext } from '../../plugin-context';
import { collectGraphInfoDiagnostics } from '../../validation/tsValidation/graph-info-validation';
import { IAcuMateApiClient } from '../../api/acu-mate-api-client';
import { GraphModel } from '../../model/graph-model';
import { GraphStructure } from '../../model/graph-structure';
import { FeatureModel } from '../../model/FeatureModel';
import { clearFeatureMetadataCache } from '../../services/feature-metadata-service';
import { provideTSFieldHover } from '../../providers/ts-hover-provider';

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
const extensionFixture = path.resolve(
	__dirname,
	'../../../src/test/fixtures/screens/AR/AR201000/extensions/AR201000_Extension.ts'
);
const linkCommandInvalidFixture = path.join(fixturesRoot, 'GraphInfoLinkCommandInvalid.ts');
const linkCommandValidFixture = path.join(fixturesRoot, 'GraphInfoLinkCommandValid.ts');
const suppressedFileFixture = path.join(fixturesRoot, 'GraphInfoScreenFileSuppressed.ts');
const featureDecoratorFixture = path.join(fixturesRoot, 'FeatureInstalledDecorator.ts');
const featureDisabledFixture = path.join(fixturesRoot, 'GraphInfoScreenMismatchFeatureDisabled.ts');

const backendGraphName = 'PX.SM.ProjectNewUiFrontendFileMaintenance';
const backendFeatureName = 'PX.Objects.CS.FeaturesSet+AcumaticaPayments';

const sampleGraphs: GraphModel[] = [
	{ name: backendGraphName, text: 'Frontend Maint' }
];

const sampleFeatures: FeatureModel[] = [
	{ featureName: backendFeatureName, enabled: true },
	{ featureName: 'PX.Objects.CS.FeaturesSet+CommerceIntegration', enabled: false },
	{ featureName: 'PX.Objects.CS.FeaturesSet+VATRecognitionOnPrepaymentsAR', enabled: false }
];

class MockApiClient implements IAcuMateApiClient {
	constructor(
		private readonly structures: Record<string, GraphStructure | undefined> = {},
		private readonly features: FeatureModel[] = []
	) {}

	async getGraphs(): Promise<GraphModel[] | undefined> {
		return sampleGraphs;
	}

	async getGraphStructure(graphName: string): Promise<GraphStructure | undefined> {
		return this.structures[graphName];
	}

	async getFeatures(): Promise<FeatureModel[] | undefined> {
		return this.features;
	}
}

describe('graphInfo decorator assistance', () => {
	before(() => {
		AcuMateContext.ApiService = new MockApiClient();
	});

	beforeEach(() => {
		clearFeatureMetadataCache();
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

	it('suggests backend feature names for featureInstalled decorator', async () => {
		AcuMateContext.ApiService = new MockApiClient({}, sampleFeatures);

		const document = await vscode.workspace.openTextDocument(featureDecoratorFixture);
		const marker = 'featureInstalled("';
		const caret = document.positionAt(document.getText().indexOf(marker) + marker.length);
		const completions = await provideTSCompletionItems(
			document,
			caret,
			new vscode.CancellationTokenSource().token,
			{ triggerKind: vscode.CompletionTriggerKind.Invoke } as vscode.CompletionContext
		);
		const labels = (completions ?? []).map(item => item.label);
		assert.ok(labels.includes(backendFeatureName), 'featureInstalled completion should include backend feature names');
	});

	it('validates featureInstalled decorators against backend features', async () => {
		AcuMateContext.ApiService = new MockApiClient({}, sampleFeatures);
		const document = await vscode.workspace.openTextDocument(featureDecoratorFixture);
		const diagnostics = await collectGraphInfoDiagnostics(document, sampleGraphs);
		assert.ok(
			diagnostics.some(diag => diag.message.includes('MissingFeature')),
			'Expected diagnostic when featureInstalled references unknown feature'
		);
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

	it('skips backend diagnostics when the PXScreen is gated by a disabled feature', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'SaveAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure }, sampleFeatures);

		const document = await vscode.workspace.openTextDocument(featureDisabledFixture);
		const diagnostics = await collectGraphInfoDiagnostics(document, sampleGraphs);
		assert.strictEqual(
			diagnostics.length,
			0,
			'expected metadata diagnostics to be skipped when class is feature-gated by disabled feature'
		);
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

		it('shows backend field metadata when hovering PXView fields', async () => {
			const graphStructure: GraphStructure = {
				name: backendGraphName,
				views: {
					Document: {
						name: 'Document',
						fields: {
							OrderNbr: {
								name: 'OrderNbr',
								displayName: 'Order Number',
								typeName: 'System.String',
								defaultControlType: 'qp-text-box'
							}
						}
					}
				}
			};
			AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

			const document = await vscode.workspace.openTextDocument(viewFieldMatchFixture);
			const marker = 'OrderNbr';
			const offset = document.getText().indexOf(marker);
			assert.ok(offset >= 0, 'hover marker not found');
			const position = document.positionAt(offset);
			const hover = await provideTSFieldHover(document, position);
			assert.ok(hover, 'expected hover result');
			const contents = Array.isArray(hover!.contents) ? hover!.contents : [hover!.contents];
			const first = contents[0];
			const value = first instanceof vscode.MarkdownString ? first.value : `${first}`;
			assert.ok(/Order Number/.test(value), 'hover should show display name');
			assert.ok(/System\.String/.test(value), 'hover should show backend type name');
			assert.ok(/qp-text-box/.test(value), 'hover should show default control type');
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

	it('validates linkCommand decorators against backend actions', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'ExistingBackendAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const invalidDocument = await vscode.workspace.openTextDocument(linkCommandInvalidFixture);
		const invalidDiagnostics = await collectGraphInfoDiagnostics(invalidDocument, sampleGraphs);
		assert.ok(
			invalidDiagnostics.some(diag => diag.message.includes('@linkCommand')),
			'Expected diagnostic when @linkCommand references missing backend action'
		);

		const validDocument = await vscode.workspace.openTextDocument(linkCommandValidFixture);
		const validDiagnostics = await collectGraphInfoDiagnostics(validDocument, sampleGraphs);
		assert.strictEqual(
			validDiagnostics.length,
			0,
			'Expected no diagnostics when @linkCommand targets backend action'
		);
	});

	it('validates linkCommand decorators inside screen extension files', async () => {
		const graphStructure: GraphStructure = {
			name: backendGraphName,
			views: {
				Document: { name: 'Document' }
			},
			actions: [{ name: 'ExistingBackendAction' }]
		};
		AcuMateContext.ApiService = new MockApiClient({ [backendGraphName]: graphStructure });

		const extensionDocument = await vscode.workspace.openTextDocument(extensionFixture);
		const diagnostics = await collectGraphInfoDiagnostics(extensionDocument, sampleGraphs);
		assert.ok(
			diagnostics.some(diag => diag.message.includes('MissingBackendAction')),
			'Expected linkCommand diagnostic inside screen extension file'
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
