import * as path from 'path';
import * as assert from 'assert';
import { describe, it } from 'mocha';
import vscode from 'vscode';
import { HtmlCompletionProvider } from '../../providers/html-completion-provider';
import { HtmlDefinitionProvider } from '../../providers/html-definition-provider';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/html');
const usingFixturePath = path.join(fixturesRoot, 'TestScreenUsing.html');

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
});
