import * as path from 'path';
import * as assert from 'assert';
import { describe, it, beforeEach, before } from 'mocha';
import vscode from 'vscode';
import { validateHtmlFile } from '../../validation/htmlValidation/html-validation';
import { AcuMateContext } from '../../plugin-context';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/html');
const screenFixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/screens');
const screenExtensionFixture = path.join(
	screenFixturesRoot,
	'SO',
	'SO301000',
	'extensions',
	'SO301000_AddBlanketOrderLine.html'
);

async function openFixtureDocument(fileName: string) {
	const fullPath = path.join(fixturesRoot, fileName);
	return vscode.workspace.openTextDocument(fullPath);
}

describe('HTML validation diagnostics', () => {
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

	it('reports missing field name', async () => {
		const document = await openFixtureDocument('InvalidScreen.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.ok(diagnostics.some(d => d.message.includes('<field>')));
	});

	it('reports missing field when using container overrides view', async () => {
		const document = await openFixtureDocument('InvalidScreenUsing.html');
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		const fieldDiagnostics = diagnostics.filter(d => d.message.includes('<field>'));
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
});
