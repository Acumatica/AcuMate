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
});
