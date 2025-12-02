import * as assert from 'assert';
import { describe, it } from 'mocha';
import vscode from 'vscode';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	readAttributeAtOffset,
	findParentViewName,
} from '../../providers/html-shared';

function extractOffset(template: string): { text: string; offset: number } {
	const marker = '|';
	const idx = template.indexOf(marker);
	if (idx === -1) {
		throw new Error('Template is missing offset marker');
	}
	const text = template.slice(0, idx) + template.slice(idx + marker.length);
	return { text, offset: idx };
}

describe('html-shared attribute parsing', () => {
	it('readAttributeAtOffset handles quoted empty values', () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind="|" />');
		const attr = readAttributeAtOffset(text, offset);
		assert.ok(attr, 'Attribute should be detected');
		assert.strictEqual(attr?.attributeName, 'view.bind');
		assert.strictEqual(attr?.value, '');
	});

	it('readAttributeAtOffset handles missing closing quote', () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind="Open|');
		const attr = readAttributeAtOffset(text, offset);
		assert.ok(attr, 'Attribute should be detected');
		assert.strictEqual(attr?.attributeName, 'view.bind');
		assert.strictEqual(attr?.value, 'Open');
	});

	it('readAttributeAtOffset handles unquoted empty values', () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind=|>');
		const attr = readAttributeAtOffset(text, offset);
		assert.ok(attr, 'Attribute should be detected');
		assert.strictEqual(attr?.attributeName, 'view.bind');
		assert.strictEqual(attr?.value, '');
	});

	it('readAttributeAtOffset handles caret on closing bracket', () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind=|>');
		const attr = readAttributeAtOffset(text, offset);
		assert.ok(attr, 'Attribute should be detected');
		assert.strictEqual(attr?.valueStart, attr?.valueEnd);
	});
});

describe('getAttributeContext integration', () => {
	it('returns context for unquoted view.bind', async () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind=|></qp-fieldset>');
		const document = await vscode.workspace.openTextDocument({ language: 'html', content: text });
		const dom = parseDocumentDom(text);
		assert.ok(dom);
		const node = findNodeAtOffset(dom!, offset);
		const element = elevateToElementNode(node);
		const context = getAttributeContext(document, offset, element);
		assert.ok(context);
		assert.strictEqual(context?.attributeName, 'view.bind');
		assert.strictEqual(context?.value, '');
	});
});

describe('findParentViewName', () => {
	it('returns using view attribute when present', async () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind="ProdItemSelected"><using view="ItemConfiguration"><field name="|"></field></using></qp-fieldset>');
		await vscode.workspace.openTextDocument({ language: 'html', content: text });
		const dom = parseDocumentDom(text);
		assert.ok(dom);
		const node = findNodeAtOffset(dom!, offset);
		const element = elevateToElementNode(node);
		const viewName = findParentViewName(element);
		assert.strictEqual(viewName, 'ItemConfiguration');
	});

	it('falls back to ancestor view.bind when using lacks view attribute', async () => {
		const { text, offset } = extractOffset('<qp-fieldset view.bind="CurrentDocument"><using><field name="|"></field></using></qp-fieldset>');
		await vscode.workspace.openTextDocument({ language: 'html', content: text });
		const dom = parseDocumentDom(text);
		assert.ok(dom);
		const node = findNodeAtOffset(dom!, offset);
		const element = elevateToElementNode(node);
		const viewName = findParentViewName(element);
		assert.strictEqual(viewName, 'CurrentDocument');
	});
});
