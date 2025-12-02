import * as path from 'path';
import * as assert from 'assert';
import { describe, it, beforeEach, before } from 'mocha';
import vscode from 'vscode';
import { validateHtmlFile } from '../../validation/htmlValidation/html-validation';
import { AcuMateContext } from '../../plugin-context';
import { ensureClientControlsFixtures } from '../utils/clientControlsFixtures';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/html');
const screenFixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/screens');
const screenExtensionFixture = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_AddBlanketOrderLine.html'
);
const screenSelectorExtensionFixture = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_FieldSelectors.html'
);

async function openFixtureDocument(fileName: string) {
	const fullPath = path.join(fixturesRoot, fileName);
	return vscode.workspace.openTextDocument(fullPath);
}

describe('HTML validation diagnostics', () => {
	before(function () {
		this.timeout(20000);
		return ensureClientControlsFixtures();
	});

	before(() => {
		if (!AcuMateContext.HtmlValidator) {
			AcuMateContext.HtmlValidator = vscode.languages.createDiagnosticCollection('htmlValidatorTest');
		}
	});

	beforeEach(() => {
		AcuMateContext.HtmlValidator?.clear();
	});

	it('reports missing view binding', async () => {
		const document = await openFixtureDocument('InvalidScreen.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(diagnostics.some(d => d.message.includes('qp-fieldset')));
	});

	it('ignores views declared only in imported files', async () => {
		const document = await openFixtureDocument('TestScreenImported.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('qp-fieldset')),
			'Expected diagnostic when view.bind references view outside owning screen files'
		);
	});

	it('reports missing field name', async () => {
		const document = await openFixtureDocument('InvalidScreen.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(diagnostics.some(d => d.message.includes('field "')));
	});

	it('reports missing field when using container overrides view', async () => {
		const document = await openFixtureDocument('InvalidScreenUsing.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		const fieldDiagnostics = diagnostics.filter(d => d.message.includes('field "'));
		assert.ok(fieldDiagnostics.length >= 1, 'Expected invalid field diagnostic for using view');
	});

	it('reports invalid view on using container', async () => {
		const document = await openFixtureDocument('InvalidScreenUsingView.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(diagnostics.some(d => d.message.includes('<using>')), 'Expected invalid using view diagnostic');
	});

	it('accepts valid screen extension html by combining screen metadata', async () => {
		const document = await vscode.workspace.openTextDocument(screenExtensionFixture);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for valid screen extension html');
	});

	it('accepts valid screen extension html when filename has double dot', async () => {
		const document = await vscode.workspace.openTextDocument(
			path.join(
				screenFixturesRoot,
				'SO',
				'SO301000',
				'extensions',
				'SO301000_CreatePrepaymentInvoice..html'
			)
		);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for double-dot extension html');
	});

	it('accepts html that relies on PXView mixin fields', async () => {
		const document = await vscode.workspace.openTextDocument(
			path.join(
				screenFixturesRoot,
				'SO',
				'SO301000',
				'extensions',
				'SO301000_PaymentLinks.html'
			)
		);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for PXView mixin html');
	});

	it('ignores fake fields marked unbound replace-content', async () => {
		const document = await openFixtureDocument('TestScreenUnboundField.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for unbound replace-content fields');
	});

	it('reports invalid PXAction references in state.bind attributes', async () => {
		const document = await openFixtureDocument('InvalidActionScreen.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('PXAction')),
			'Expected diagnostic for invalid PXAction reference'
		);
	});

	it('accepts qp-panel ids that map to known views', async () => {
		const document = await openFixtureDocument('TestPanelValid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(
			diagnostics.filter(d => d.message.includes('<qp-panel> id')).length,
			0,
			'Expected no diagnostics for qp-panel ids bound to known views'
		);
	});

	it('reports qp-panel ids that do not resolve to views', async () => {
		const document = await openFixtureDocument('TestPanelInvalid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('<qp-panel> id must reference a valid view')),
			'Expected diagnostic for qp-panel id that does not match a view'
		);
	});

	it('allows suppressing html diagnostics via acumate-disable-next-line directives', async () => {
		const document = await openFixtureDocument('TestPanelInvalidSuppressed.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected suppression directive to silence qp-panel warning');
	});

	it('allows suppressing html diagnostics via acumate-disable-file directives', async () => {
		const document = await openFixtureDocument('TestPanelInvalidFileSuppressed.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected acumate-disable-file to silence all html diagnostics in the file');
	});

	it('accepts qp-panel footer buttons that bind to the panel view actions', async () => {
		const document = await openFixtureDocument('TestPanelActionValid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(
			diagnostics.filter(d => d.message.includes('state.bind attribute must reference a valid PXAction')).length,
			0,
			'Expected no invalid PXAction diagnostics when binding to qp-panel view actions'
		);
	});

	it('reports qp-panel footer buttons that reference unknown view actions', async () => {
		const document = await openFixtureDocument('TestPanelActionInvalid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('state.bind attribute must reference a valid PXAction')),
			'Expected invalid PXAction diagnostic when qp-panel footer button references unknown action'
		);
	});

	it('accepts qp-include markup when required parameters are satisfied', async () => {
		const document = await openFixtureDocument('TestIncludeHost.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for valid qp-include');
	});

	it('reports missing required qp-include parameters', async () => {
		const document = await openFixtureDocument('TestIncludeHostMissingParam.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('missing required parameter "contact-view"')),
			'Expected diagnostic for missing qp-include parameter'
		);
	});

	it('reports qp-include attributes that are not declared by the include file', async () => {
		const document = await openFixtureDocument('TestIncludeHostUnknownParam.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('not defined by the include template')),
			'Expected diagnostic for unknown qp-include parameter'
		);
	});

	it('accepts qp-template name values defined by ScreenTemplates', async () => {
		const document = await openFixtureDocument('TestQpTemplate.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(
			diagnostics.filter(d => d.message.includes('qp-template name')).length,
			0,
			'Expected no qp-template diagnostics for valid names'
		);
	});

	it('reports qp-template names that are not registered', async () => {
		const document = await openFixtureDocument('TestQpTemplateInvalid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('qp-template name')),
			'Expected diagnostic for invalid qp-template name'
		);
	});

	it('accepts qp-field control-state bindings when view + field exist', async () => {
		const document = await openFixtureDocument('TestScreen.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(
			diagnostics.filter(d => d.message.includes('control-state.bind')).length,
			0,
			'Expected no control-state diagnostics for valid markup'
		);
	});

	it('reports malformed qp-field control-state bindings', async () => {
		const document = await openFixtureDocument('TestScreenInvalidControlState.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('<view>.<field> format')),
			'Expected diagnostic for malformed control-state format'
		);
		assert.ok(
			diagnostics.some(d => d.message.includes('unknown view')),
			'Expected diagnostic for missing control-state view'
		);
		assert.ok(
			diagnostics.some(d => d.message.includes('unknown field')),
			'Expected diagnostic for missing control-state field'
		);
	});

	it('accepts qp-button config.bind when config matches schema', async () => {
		const document = await openFixtureDocument('TestConfigBindingValid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for valid config.bind');
	});

	it('reports qp-button config.bind issues from control metadata', async () => {
		const document = await openFixtureDocument('TestConfigBindingInvalid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('missing required property "enabled"')),
			'Expected diagnostic for missing required config property'
		);
		assert.ok(
			diagnostics.some(d => d.message.includes('property "bogus"')),
			'Expected diagnostic for unknown config property'
		);
		assert.ok(
			diagnostics.some(d => d.message.includes('must be valid JSON')),
			'Expected diagnostic for invalid config JSON'
		);
	});

	it('accepts field control-type values defined by client controls metadata', async () => {
		const document = await openFixtureDocument('TestControlTypeValid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(diagnostics.length, 0, 'Expected no diagnostics for known control-type values');
	});

	it('reports field control-type values that are not recognized', async () => {
		const document = await openFixtureDocument('TestControlTypeInvalid.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('control-type value')),
			'Expected diagnostic for unknown control-type value'
		);
	});

	it('validates customization selectors against the base screen HTML', async () => {
		const document = await vscode.workspace.openTextDocument(screenSelectorExtensionFixture);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('does not match any elements')),
			'Expected diagnostic when selector does not resolve in base screen HTML'
		);
		assert.ok(
			diagnostics.some(d => d.message.includes('not a valid CSS selector')),
			'Expected diagnostic for invalid CSS selector'
		);
	});

	it('derives view metadata from selector targets when <field> lacks a parent view', async () => {
		const document = await vscode.workspace.openTextDocument(screenSelectorExtensionFixture);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(
			diagnostics.some(d => d.message.includes('"AMUnknownField"')),
			'Expected diagnostic referencing unknown selector field name'
		);
		assert.ok(
			!diagnostics.some(d => d.message.includes('"AMCuryEstimateTotal"')),
			'Valid selector field should not produce field diagnostics'
		);
	});
});
