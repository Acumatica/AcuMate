import * as assert from 'assert';
import sinon from 'sinon';
import { afterEach, beforeEach, describe, it } from 'mocha';
import * as vscode from 'vscode';
import { selectFields } from '../../scaffolding/common/select-fields';
import { selectActions } from '../../scaffolding/common/select-actions';
import { selectViews } from '../../scaffolding/common/select-views';
import { setViewTypes } from '../../scaffolding/common/set-view-types';
import { selectGraphType } from '../../scaffolding/create-screen/select-graph-type';
import { setPrimaryView } from '../../scaffolding/create-screen/set-primary-view';
import { setScreenName } from '../../scaffolding/create-screen/set-screen-name';
import { View } from '../../types';
import { Field } from '../../model/view';
import { AcuMateContext } from '../../plugin-context';

describe('scaffolding helpers', () => {
	const originalApiService = AcuMateContext.ApiService;

	beforeEach(() => {
		sinon.restore();
	});

	afterEach(() => {
		AcuMateContext.ApiService = originalApiService;
		sinon.restore();
	});

	describe('selectFields', () => {
		it('filters view fields to the quick pick selection', async () => {
			const view = new View('Details');
			view.fields = [
				{ name: 'OrderNbr', displayName: 'Order Nbr', typeName: 'string' } as Field,
				{ name: 'CustomerID', displayName: 'Customer', typeName: 'string' } as Field,
			];

			const quickPickStub = sinon
				.stub(vscode.window, 'showQuickPick')
				.resolves([{ label: 'CustomerID' }] as any);

			await selectFields([view]);

			assert.deepStrictEqual(view.fields?.map(field => field.name), ['CustomerID']);
			assert.ok(quickPickStub.calledOnce, 'expected quick pick to be shown');
		});
	});

	describe('selectActions', () => {
		it('returns Action objects for selected backend actions', async () => {
			const backendActions = [
				{ name: 'AddNew', displayName: 'Add New' },
				{ name: 'Release', displayName: 'Release' },
			];

			AcuMateContext.ApiService = {
				getGraphStructure: sinon.stub().resolves({ actions: backendActions }),
			} as any;

			const quickPickStub = sinon
				.stub(vscode.window, 'showQuickPick')
				.resolves([
					{ label: 'AddNew' },
					{ label: 'Release' },
				] as any);

			const actions = await selectActions('SO301000');

			assert.deepStrictEqual(actions?.map(action => action.name), ['AddNew', 'Release']);
			assert.ok(quickPickStub.calledOnce, 'expected quick pick to be shown');
		});

		it('shows backend error message when graph retrieval fails', async () => {
			const error = new Error('offline');
			AcuMateContext.ApiService = {
				getGraphStructure: sinon.stub().rejects(error),
			} as any;

			const errorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

			const result = await selectActions('SO301000');

			assert.strictEqual(result, undefined);
			assert.ok(errorStub.calledOnce, 'expected an error notification to be shown');
		});
	});

	describe('selectViews', () => {
		it('returns view metadata with flattened fields', async () => {
			const graphStructure = {
				views: {
					Details: {
						cacheType: 'PX.Objects.SO.SOOrder',
						cacheName: 'SOOrderCache',
						extension: '',
						fields: {
							OrderNbr: { name: 'OrderNbr', displayName: 'Order Nbr' },
							CustomerID: { name: 'CustomerID', displayName: 'Customer' },
						},
					},
					Summary: {
						cacheType: 'PX.Objects.SO.Summary',
						cacheName: 'SOSummary',
						extension: 'Extension',
						fields: undefined,
					},
				},
			};

			AcuMateContext.ApiService = {
				getGraphStructure: sinon.stub().resolves(graphStructure),
			} as any;

			const quickPickStub = sinon
				.stub(vscode.window, 'showQuickPick')
				.resolves([
					{ label: 'Details' },
					{ label: 'Summary' },
				] as any);

			const views = await selectViews('SO301000');

			assert.deepStrictEqual(views?.map(v => v.name), ['Details', 'Summary']);
			assert.deepStrictEqual(views?.[0].fields?.map(field => field?.name), ['OrderNbr', 'CustomerID']);
			assert.strictEqual(views?.[0].dacname, 'PX.Objects.SO.SOOrder');
			assert.ok(quickPickStub.calledOnce, 'expected quick pick to be shown');
		});

		it('returns undefined when backend view lookup fails', async () => {
			const error = new Error('down');
			AcuMateContext.ApiService = {
				getGraphStructure: sinon.stub().rejects(error),
			} as any;

			const errorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

			const result = await selectViews('SO301000');

			assert.strictEqual(result, undefined);
			assert.ok(errorStub.calledOnce);
		});
	});

	describe('setViewTypes', () => {
		it('assigns a type to each view', async () => {
			const views = [new View('Details'), new View('Summary')];

			const quickPickStub = sinon.stub(vscode.window, 'showQuickPick');
			quickPickStub.onCall(0).resolves({ label: 'entity' } as any);
			quickPickStub.onCall(1).resolves({ label: 'grid' } as any);

			await setViewTypes(views);

			assert.deepStrictEqual(views.map(view => view.type), ['entity', 'grid']);
			assert.strictEqual(quickPickStub.callCount, 2);
		});
	});

	describe('selectGraphType', () => {
		it('returns the label of the selected graph', async () => {
			AcuMateContext.ApiService = {
				getGraphs: sinon.stub().resolves([{ name: 'SOOrderEntry', text: 'SO Order Entry' }]),
			} as any;

			const quickPickStub = sinon
				.stub(vscode.window, 'showQuickPick')
				.resolves({ label: 'SOOrderEntry' } as any);

			const result = await selectGraphType();

			assert.strictEqual(result, 'SOOrderEntry');
			assert.ok(quickPickStub.calledOnce);
		});

		it('re-prompts when validation fails', async () => {
			AcuMateContext.ApiService = {
				getGraphs: sinon.stub().resolves([{ name: 'SOOrderEntry', text: 'SO Order Entry' }]),
			} as any;

			const quickPickStub = sinon.stub(vscode.window, 'showQuickPick');
			quickPickStub.onCall(0).resolves({ label: '' } as any);
			quickPickStub.onCall(1).resolves({ label: 'SOOrderEntry' } as any);

			const errorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

			const result = await selectGraphType();

			assert.strictEqual(result, 'SOOrderEntry');
			assert.strictEqual(errorStub.callCount, 1);
			assert.strictEqual(quickPickStub.callCount, 2);
		});

		it('returns undefined when graph retrieval fails', async () => {
			AcuMateContext.ApiService = {
				getGraphs: sinon.stub().rejects(new Error('offline')),
			} as any;

			const errorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

			const result = await selectGraphType();

			assert.strictEqual(result, undefined);
			assert.ok(errorStub.calledOnce);
		});
	});

	describe('setPrimaryView', () => {
		it('retries until a primary view is selected', async () => {
			const views = [new View('Details'), new View('Summary')];

			const quickPickStub = sinon.stub(vscode.window, 'showQuickPick');
			quickPickStub.onCall(0).resolves(undefined);
			quickPickStub.onCall(1).resolves({ label: 'Summary' } as any);

			const errorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

			const result = await setPrimaryView(views);

			assert.strictEqual(result, 'Summary');
			assert.strictEqual(errorStub.callCount, 1);
		});
	});

	describe('setScreenName', () => {
		it('validates screen id format before returning result', async () => {
			const showInputStub = sinon.stub(vscode.window, 'showInputBox').callsFake(async options => {
				assert.ok(options?.validateInput, 'validateInput hook should be provided');
				const validator = options?.validateInput!;
				assert.strictEqual(validator(''), 'Enter Screen ID');
				assert.strictEqual(validator('SO30'), 'Screen ID should consist of 8 characters');
				assert.strictEqual(validator('SO301000'), undefined);
				return 'SO301000';
			});

			const result = await setScreenName();

			assert.strictEqual(result, 'SO301000');
			assert.ok(showInputStub.calledOnce);
		});
	});
});
