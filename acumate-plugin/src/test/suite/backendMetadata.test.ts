import * as assert from 'assert';
import { describe, it } from 'mocha';
import { buildBackendViewMap } from '../../backend-metadata-utils';
import { GraphStructure } from '../../model/graph-structure';
import { View } from '../../model/view';

describe('backend metadata utilities', () => {
	it('merges duplicate backend views and preserves the first metadata instance', () => {
		const baseTransactionsView: View = {
			name: 'transactions',
			cacheName: 'Purchase Receipt Line',
			cacheType: 'POReceiptLine',
			fields: {
				ReceiptNbr: { name: 'ReceiptNbr' },
			},
		};

		const secondaryTransactionsView: View = {
			name: 'Transactions',
			cacheName: 'Purchase Receipt Line (Alt)',
			cacheType: 'POReceiptLine',
			fields: {
				ReceiptDate: { name: 'ReceiptDate' },
			},
		};

		const structure: GraphStructure = {
			name: 'PX.Objects.PO.POReceiptEntry',
			views: {
				transactions: baseTransactionsView,
				transactionsPOLine: secondaryTransactionsView,
			},
		};

		const backendViewMap = buildBackendViewMap(structure);
		const canonical = backendViewMap.get('transactions');
		assert.ok(canonical, 'Expected canonical transactions view metadata');
		assert.strictEqual(canonical.view, baseTransactionsView, 'First view definition should be preserved');
		assert.ok(canonical.fields.has('receiptnbr'), 'Original field should remain');
		assert.ok(canonical.fields.has('receiptdate'), 'Fields from duplicate view should be merged');

		const aliasMetadata = backendViewMap.get('transactionspoline');
		assert.strictEqual(aliasMetadata, canonical, 'Alternate view keys should reference the canonical metadata');
	});
});
