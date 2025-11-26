import * as path from 'path';
import * as assert from 'assert';
import { describe, it, beforeEach, before } from 'mocha';
import vscode from 'vscode';
import { validateHtmlFile } from '../../validation/htmlValidation/html-validation';
import { AcuMateContext } from '../../plugin-context';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/html');

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
});
