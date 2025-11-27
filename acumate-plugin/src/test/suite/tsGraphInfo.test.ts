import * as path from 'path';
import * as assert from 'assert';
import vscode from 'vscode';
import { describe, it, before } from 'mocha';
import { provideTSCompletionItems } from '../../completionItemProviders/ts-completion-provider';
import { AcuMateContext } from '../../plugin-context';
import { collectGraphInfoDiagnostics } from '../../validation/tsValidation/graph-info-validation';
import { IAcuMateApiClient } from '../../api/acu-mate-api-client';
import { GraphModel } from '../../model/graph-model';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/typescript');
const completionFixture = path.join(fixturesRoot, 'GraphInfoScreen.ts');
const invalidFixture = path.join(fixturesRoot, 'GraphInfoScreenInvalid.ts');
const validFixture = path.join(fixturesRoot, 'GraphInfoScreenValid.ts');

const sampleGraphs: GraphModel[] = [
	{ name: 'PX.SM.ProjectNewUiFrontendFileMaintenance', text: 'Frontend Maint' }
];

class MockApiClient implements IAcuMateApiClient {
	async getGraphs(): Promise<GraphModel[] | undefined> {
		return sampleGraphs;
	}

	async getGraphStructure(): Promise<any> {
		return undefined;
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
});
