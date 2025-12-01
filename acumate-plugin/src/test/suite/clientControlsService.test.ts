import * as assert from 'assert';
import * as path from 'path';
import { before, describe, it } from 'mocha';
import { getClientControlsMetadata } from '../../services/client-controls-service';
import { ensureClientControlsFixtures } from '../utils/clientControlsFixtures';

describe('client-controls metadata discovery', () => {
const nodeModulesProjectRoot = path.resolve(__dirname, '../../../src/test/fixtures/client-controls-project');
const nodeModulesHtmlPath = path.join(nodeModulesProjectRoot, 'src', 'screens', 'Sample', 'Sample.html');

	const inlineProjectRoot = path.resolve(__dirname, '../../../src/test/fixtures/client-controls-inline-project');
	const inlineHtmlPath = path.join(inlineProjectRoot, 'src', 'screens', 'Sample', 'Sample.html');

	before(function () {
		this.timeout(20000);
		return ensureClientControlsFixtures();
	});

	it('collects qp-* custom elements with config info from node_modules package', () => {
		const controls = getClientControlsMetadata({
			startingPath: nodeModulesHtmlPath,
			workspaceRoots: [nodeModulesProjectRoot],
		});
		assertBarcodeControl(controls);
	});

	it('discovers controls when the package lives at the workspace root', () => {
		const controls = getClientControlsMetadata({
			startingPath: inlineHtmlPath,
			workspaceRoots: [inlineProjectRoot],
		});
		assertBarcodeControl(controls);
	});
});

function assertBarcodeControl(controls: ReturnType<typeof getClientControlsMetadata>) {
	const barcode = controls.find(control => control.tagName === 'qp-barcode-input');
	assert.ok(barcode, 'Expected qp-barcode-input control to be discovered');
	assert.strictEqual(barcode?.config?.typeName, 'IBarcodeInputControlConfig');
	const definition = barcode?.config?.definition;
	assert.ok(definition, 'Config definition should be resolved');
	const propNames = definition?.properties.map(prop => prop.name) ?? [];
	assert.ok(propNames.includes('soundControl'));
	assert.ok(propNames.includes('soundPath'));
}

