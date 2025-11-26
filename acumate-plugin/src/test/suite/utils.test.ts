import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
	getClassPropertiesFromTs,
	createClassInfoLookup,
	resolveViewBinding,
	CollectedClassInfo,
} from '../../utils';

const metadataFixture = `
class CustomerView extends PXView {
	customerName: PXFieldState;
}

class BaseMaint extends PXScreen {
	baseView: PXView<CustomerView>;
	orders: PXViewCollection<CustomerView>;
}

class ChildMaint extends BaseMaint {
	childField: PXFieldState;
}
`;

function buildMetadata() {
	const classInfos = getClassPropertiesFromTs(metadataFixture, 'fixture.ts');
	const lookup = createClassInfoLookup(classInfos);
	const screenClasses = classInfos.filter(info => info.type === 'PXScreen');
	return { classInfos, lookup, screenClasses };
}

describe('utils metadata collection', () => {
	it('collects inherited PXScreen properties', () => {
		const { classInfos } = buildMetadata();
		const child = classInfos.find(info => info.className === 'ChildMaint')!;
		assert.ok(child, 'ChildMaint metadata missing');
		assert.ok(child.properties.has('childField'), 'child field not recorded');
		assert.ok(child.properties.has('baseView'), 'inherited base view not recorded');
	});

	it('resolveViewBinding returns view + view class info', () => {
		const { classInfos, lookup, screenClasses } = buildMetadata();
		const resolution = resolveViewBinding('baseView', screenClasses, lookup);
		assert.ok(resolution, 'failed to resolve view binding');
		assert.strictEqual(resolution?.property.kind, 'view');
		assert.strictEqual(resolution?.viewClass?.className, 'CustomerView');
	});

	it('resolveViewBinding handles PXViewCollection bindings', () => {
		const { lookup, screenClasses } = buildMetadata();
		const resolution = resolveViewBinding('orders', screenClasses, lookup);
		assert.ok(resolution, 'failed to resolve collection binding');
		assert.strictEqual(resolution?.property.kind, 'viewCollection');
		assert.strictEqual(resolution?.viewClass?.className, 'CustomerView');
	});

	it('resolveViewBinding returns undefined for unknown names', () => {
		const { lookup, screenClasses } = buildMetadata();
		const resolution = resolveViewBinding('missingView', screenClasses, lookup);
		assert.strictEqual(resolution, undefined);
	});
});
