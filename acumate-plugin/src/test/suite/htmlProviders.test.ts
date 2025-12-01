import * as path from 'path';
import * as assert from 'assert';
import { before, describe, it } from 'mocha';
import vscode from 'vscode';
import { HtmlCompletionProvider } from '../../providers/html-completion-provider';
import { HtmlDefinitionProvider } from '../../providers/html-definition-provider';
import { ensureClientControlsFixtures } from '../utils/clientControlsFixtures';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/html');
const usingFixturePath = path.join(fixturesRoot, 'TestScreenUsing.html');
const qpTemplateFixturePath = path.join(fixturesRoot, 'TestQpTemplate.html');
const includeHostPath = path.join(fixturesRoot, 'TestIncludeHost.html');
const importedFixturePath = path.join(fixturesRoot, 'TestScreenImported.html');
const configCompletionPath = path.join(fixturesRoot, 'TestConfigBindingCompletion.html');
const screenFixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/screens');
const screenExtensionHtmlPath = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_AddBlanketOrderLine.html'
);
const screenExtensionDoubleDotHtmlPath = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_CreatePrepaymentInvoice..html'
);
const screenPaymentLinksHtmlPath = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_PaymentLinks.html'
);
const screenSelectorHtmlPath = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_FieldSelectors.html'
);

before(function () {
	this.timeout(20000);
	return ensureClientControlsFixtures();
});

function positionAt(document: vscode.TextDocument, search: string, delta = 0, fromIndex = 0): vscode.Position {
	const text = document.getText();
	const index = text.indexOf(search, fromIndex);
	if (index === -1) {
		throw new Error(`Unable to find marker: ${search}`);
	}
	return document.positionAt(index + delta);
}

function positionAtLast(document: vscode.TextDocument, search: string, delta = 0): vscode.Position {
	const text = document.getText();
	const index = text.lastIndexOf(search);
	if (index === -1) {
		throw new Error(`Unable to find marker: ${search}`);
	}
	return document.positionAt(index + delta);
}

describe('HTML completion provider integration', () => {
	it('suggests view names when view.bind value is empty', async () => {
		const htmlPath = path.join(fixturesRoot, 'TestScreenEmpty.html');
		const document = await vscode.workspace.openTextDocument(htmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'view.bind=""', 'view.bind="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('formView'), 'formView not suggested');
	});

	it('does not suggest views declared only in imported files', async () => {
		const document = await vscode.workspace.openTextDocument(importedFixturePath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'view.bind="Document"', 'view.bind="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'Expected host view completions');
		const labels = completions.map(item => item.label);
		assert.ok(!labels.includes('Document'), 'Imported view name should not be suggested');
		assert.ok(labels.includes('Actual'), 'Actual host view should be suggested');
	});

	it('suggests field names scoped to parent view', async () => {
		const htmlPath = path.join(fixturesRoot, 'TestScreenEmpty.html');
		const document = await vscode.workspace.openTextDocument(htmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAtLast(document, 'name=""', 'name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No field completions returned');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('gridField'), 'gridField not suggested');
	});

	it('suggests view names for using view attribute', async () => {
		const document = await vscode.workspace.openTextDocument(usingFixturePath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'view="ItemConfiguration"', 'view="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No view completions returned for using view attribute');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('ItemConfiguration'), 'ItemConfiguration not suggested');
	});

	it('suggests view names for screen extensions', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'view.bind="BaseView"', 'view.bind="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for screen extension');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('BlanketSplits'), 'BlanketSplits not suggested');
		assert.ok(labels.includes('BaseView'), 'BaseView not suggested');
	});

	it('suggests field names for screen extension views', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'name="BlanketLineField"', 'name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No field completions returned for screen extension');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('BlanketLineField'), 'BlanketLineField not suggested');
	});

	it('suggests view names for screen extensions with double-dot html names', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionDoubleDotHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'view.bind="QuickPrepaymentInvoice"', 'view.bind="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for double-dot extension');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('QuickPrepaymentInvoice'), 'QuickPrepaymentInvoice not suggested');
	});

	it('suggests field names for screen extensions with double-dot html names', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionDoubleDotHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'name="CuryPrepaymentAmt"', 'name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No field completions returned for double-dot extension');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('CuryPrepaymentAmt'), 'CuryPrepaymentAmt not suggested');
	});

	it('suggests fields injected into PXView mixins', async () => {
		const document = await vscode.workspace.openTextDocument(screenPaymentLinksHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'name="ProcessingCenterID"', 'name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for mixin fields');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('ProcessingCenterID'), 'ProcessingCenterID not suggested');
		assert.ok(labels.includes('DeliveryMethod'), 'DeliveryMethod not suggested');
	});

	it('suggests fields from using views defined in mixins', async () => {
		const document = await vscode.workspace.openTextDocument(screenPaymentLinksHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'name="Url"', 'name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for mixin view fields');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('Url'), 'Url not suggested');
		assert.ok(labels.includes('LinkStatus'), 'LinkStatus not suggested');
	});

	it('suggests PXAction names for state.bind attributes', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionHtmlPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'state.bind=""', 'state.bind="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for state.bind');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('AddBlanketLineOK'), 'AddBlanketLineOK action not suggested');
	});

	it('suggests field names for using containers inheriting parent views', async () => {
		const document = await vscode.workspace.openTextDocument(usingFixturePath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'wg-test="no-view" name="', 'wg-test="no-view" name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No field completions returned for using container');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('CuryVatExemptTotal'), 'CuryVatExemptTotal not suggested');
	});

	it('suggests field names for using containers that specify view attribute', async () => {
		const document = await vscode.workspace.openTextDocument(usingFixturePath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'wg-test="with-view" name="', 'wg-test="with-view" name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No field completions returned for using view attribute');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('ConfigurationID'), 'ConfigurationID not suggested');
	});

	it('suggests qp-include parameters declared by referenced file', async () => {
		const document = await vscode.workspace.openTextDocument(includeHostPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, '	></qp-include>', 1);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No parameter completions returned for qp-include');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('override-fieldname'), 'override-fieldname not suggested');
		assert.ok(labels.includes('override-wg-container'), 'override-wg-container not suggested');
	});

	it('suggests qp-template names sourced from ScreenTemplates', async () => {
		const document = await vscode.workspace.openTextDocument(qpTemplateFixturePath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'name=""', 'name="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for qp-template name');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('17-17-14'), '17-17-14 template not suggested');
	});

	it('suggests view + field pairs for control-state.bind', async () => {
		const document = await vscode.workspace.openTextDocument(path.join(fixturesRoot, 'TestScreen.html'));
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, 'control-state.bind=""', 'control-state.bind="'.length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for control-state.bind');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('mainView.customerName'), 'mainView.customerName not suggested');
	});

	it('suggests config properties for client controls', async () => {
		const document = await vscode.workspace.openTextDocument(configCompletionPath);
		const provider = new HtmlCompletionProvider();
		const caret = positionAt(document, "config.bind='{  }'", "config.bind='{ ".length);
		const completions = await provider.provideCompletionItems(document, caret);
		assert.ok(completions && completions.length > 0, 'No completions returned for config.bind');
		const labels = completions.map(item => item.label);
		assert.ok(labels.includes('enabled'), 'enabled config property not suggested');
		assert.ok(labels.includes('dialogResult'), 'dialogResult config property not suggested');
	});
});

describe('HTML definition provider integration', () => {
	it('navigates from view.bind to PXView property and class', async () => {
		const htmlPath = path.join(fixturesRoot, 'TestScreen.html');
		const document = await vscode.workspace.openTextDocument(htmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'view.bind="mainView"', 'view.bind="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreen.ts')),
			'Expected definition inside TestScreen.ts'
		);
	});

	it('navigates from field name to PXField property', async () => {
		const htmlPath = path.join(fixturesRoot, 'TestScreen.html');
		const document = await vscode.workspace.openTextDocument(htmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="customerName"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreen.ts')),
			'Expected field definition inside TestScreen.ts'
		);
	});

	it('navigates from field inside using container with custom view', async () => {
		const document = await vscode.workspace.openTextDocument(usingFixturePath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="ConfigurationID"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreenUsing.ts')),
			'Expected definition inside TestScreenUsing.ts'
		);
	});

	it('navigates from field inside using container inheriting parent view', async () => {
		const document = await vscode.workspace.openTextDocument(usingFixturePath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="CuryVatExemptTotal"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreenUsing.ts')),
			'Expected definition inside TestScreenUsing.ts'
		);
	});

	it('navigates from using view attribute to PXView property/class', async () => {
		const document = await vscode.workspace.openTextDocument(usingFixturePath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'view="ItemConfiguration"', 'view="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreenUsing.ts')),
			'Expected definition inside TestScreenUsing.ts'
		);
	});

	it('navigates from extension view binding to TS property', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'view.bind="BlanketSplits"', 'view.bind="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_AddBlanketOrderLine.ts')),
			'Expected definition inside screen extension TS file'
		);
	});

	it('navigates from extension field to PXField property', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="BlanketLineField"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_AddBlanketOrderLine.ts')),
			'Expected field definition inside screen extension TS file'
		);
	});

	it('navigates from double-dot extension view binding to TS property', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionDoubleDotHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'view.bind="QuickPrepaymentInvoice"', 'view.bind="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_CreatePrepaymentInvoice.ts')),
			'Expected definition inside double-dot extension TS file'
		);
	});

	it('navigates from double-dot extension field to PXField property', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionDoubleDotHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="PrepaymentPct"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_CreatePrepaymentInvoice.ts')),
			'Expected field definition inside double-dot extension TS file'
		);
	});

	it('navigates from mixin field to its TypeScript definition', async () => {
		const document = await vscode.workspace.openTextDocument(screenPaymentLinksHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="ProcessingCenterID"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_PaymentLinks.ts')),
			'Expected definition inside PaymentLinks mixin file'
		);
	});

	it('navigates from using mixin view to TypeScript definition', async () => {
		const document = await vscode.workspace.openTextDocument(screenPaymentLinksHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="Url"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_PaymentLinks.ts')),
			'Expected definition inside PaymentLinks mixin file'
		);
	});

	it('navigates from state.bind attribute to PXAction definition', async () => {
		const document = await vscode.workspace.openTextDocument(path.join(fixturesRoot, 'TestScreen.html'));
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'state.bind="SaveAction"', 'state.bind="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreen.ts')),
			'Expected action definition inside TestScreen.ts'
		);
	});

	it('navigates from qp-include url to referenced file', async () => {
		const document = await vscode.workspace.openTextDocument(includeHostPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(
			document,
			'url="src/test/fixtures/includes/form-contact-document.html"',
			'url="'.length + 1
		);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('form-contact-document.html')),
			'Expected navigation to include template file'
		);
	});

	it('navigates from customization selector attributes to base screen HTML', async () => {
		const document = await vscode.workspace.openTextDocument(screenSelectorHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(
			document,
			"before=\"#fsOrderTotals-Totals [name='CuryGoodsExtPriceTotal']\"",
			"before=\"".length + 1
		);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned for customization selector');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000.html')),
			'Expected navigation to base screen HTML'
		);
	});

	it('navigates from selector-injected field name to TS definition', async () => {
		const document = await vscode.workspace.openTextDocument(screenSelectorHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'name="AMCuryEstimateTotal"', 'name="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned for selector field');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000.ts')),
			'Expected field definition inside base screen TS file'
		);
	});

	it('navigates from qp-panel id to PXView definition', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionDoubleDotHtmlPath);
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'id="QuickPrepaymentInvoice"', 'id="'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned for qp-panel id');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('SO301000_CreatePrepaymentInvoice.ts')),
			'Expected navigation to screen extension TS file'
		);
	});

	it('navigates from control-state.bind to PXField property', async () => {
		const document = await vscode.workspace.openTextDocument(path.join(fixturesRoot, 'TestScreen.html'));
		const provider = new HtmlDefinitionProvider();
		const caret = positionAt(document, 'control-state.bind="mainView.customerName"', 'control-state.bind="'.length + 'mainView.'.length + 1);
		const definition = await provider.provideDefinition(document, caret);
		const locations = Array.isArray(definition) ? definition : definition ? [definition] : [];
		assert.ok(locations.length >= 1, 'No definitions returned');
		assert.ok(
			locations.some(loc => loc.uri.fsPath.endsWith('TestScreen.ts')),
			'Expected control-state definition inside TestScreen.ts'
		);
	});
});
