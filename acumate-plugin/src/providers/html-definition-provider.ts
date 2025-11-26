import vscode from 'vscode';
import ts from 'typescript';
import { Parser, DomHandler } from 'htmlparser2';
const fs = require('fs');

import {
	getCorrespondingTsFile,
	getClassPropertiesFromTs,
	CollectedClassInfo,
	ClassPropertyInfo,
	createClassInfoLookup,
	resolveViewBinding,
} from '../utils';

interface HtmlAttributeContext {
	attributeName: string;
	value: string;
	valueRange: vscode.Range;
	tagName: string;
	node: any;
}

export function registerHtmlDefinitionProvider(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerDefinitionProvider(
		{ language: 'html', scheme: 'file' },
		new HtmlDefinitionProvider()
	);

	context.subscriptions.push(provider);
}

class HtmlDefinitionProvider implements vscode.DefinitionProvider {
	async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Definition | undefined> {
		const offset = document.offsetAt(position);
		const dom = parseDocumentDom(document.getText());
		if (!dom) {
			return;
		}

		const node = findNodeAtOffset(dom, offset);
		if (!node) {
			return;
		}

		const elementNode = elevateToElementNode(node);
		if (!elementNode || elementNode.type !== 'tag') {
			return;
		}

		const attributeContext = getAttributeContext(document, offset, elementNode);
		if (!attributeContext) {
			return;
		}

		const tsFilePath = getCorrespondingTsFile(document.uri.fsPath);
		if (!tsFilePath || !fs.existsSync(tsFilePath)) {
			return;
		}

		const tsContent = fs.readFileSync(tsFilePath, 'utf-8');
		const classInfos = getClassPropertiesFromTs(tsContent, tsFilePath);
		if (!classInfos.length) {
			return;
		}

		const classInfoLookup = createClassInfoLookup(classInfos);
		const screenClasses = classInfos.filter(info => info.type === 'PXScreen');

		if (attributeContext.attributeName === 'view.bind') {
			const resolution = resolveViewBinding(attributeContext.value, screenClasses, classInfoLookup);
			if (!resolution) {
				return;
			}

			const targets: vscode.Location[] = [];
			targets.push(createLocationFromProperty(resolution.property));
			if (resolution.viewClass) {
				targets.push(createLocationFromClass(resolution.viewClass));
			}

			return targets;
		}

		if (attributeContext.attributeName === 'name' && attributeContext.tagName === 'field') {
			const viewName = findParentViewName(elementNode);
			if (!viewName) {
				return;
			}

			const resolution = resolveViewBinding(viewName, screenClasses, classInfoLookup);
			const viewClass = resolution?.viewClass;
			if (!viewClass) {
				return;
			}

			const fieldProperty = viewClass.properties.get(attributeContext.value);
			if (!fieldProperty || fieldProperty.kind !== 'field') {
				return;
			}

			return createLocationFromProperty(fieldProperty);
		}

		return undefined;
	}
}

function parseDocumentDom(content: string): any[] | undefined {
	let domTree: any[] | undefined;
	const handler = new DomHandler(
		(error, dom) => {
			if (!error) {
				domTree = dom;
			}
		},
		{ withStartIndices: true, withEndIndices: true }
	);
	const parser = new Parser(handler, { lowerCaseAttributeNames: false, lowerCaseTags: false });
	parser.write(content);
	parser.end();
	return domTree;
}

function findNodeAtOffset(dom: any[], offset: number): any | undefined {
	for (const node of dom) {
		const start = typeof node.startIndex === 'number' ? node.startIndex : undefined;
		const end = typeof node.endIndex === 'number' ? node.endIndex : undefined;
		if (start !== undefined && end !== undefined && start <= offset && offset <= end) {
			if (node.children?.length) {
				const childHit = findNodeAtOffset(node.children, offset);
				if (childHit) {
					return childHit;
				}
			}
			return node;
		}

		if (node.children?.length) {
			const descendant = findNodeAtOffset(node.children, offset);
			if (descendant) {
				return descendant;
			}
		}
	}

	return undefined;
}

function elevateToElementNode(node: any): any {
	let current: any = node;
	while (current && current.type !== 'tag') {
		current = current.parent;
	}
	return current;
}

function getAttributeContext(document: vscode.TextDocument, offset: number, node: any): HtmlAttributeContext | undefined {
	const text = document.getText();
	const rawAttr = readAttributeAtOffset(text, offset);
	if (!rawAttr) {
		return undefined;
	}

	if (!node.attribs || node.attribs[rawAttr.attributeName] !== rawAttr.value) {
		return undefined;
	}

	const valueRange = new vscode.Range(
		document.positionAt(rawAttr.valueStart),
		document.positionAt(rawAttr.valueEnd)
	);

	return {
		attributeName: rawAttr.attributeName,
		value: rawAttr.value,
		valueRange,
		tagName: node.name,
		node,
	};
}

function readAttributeAtOffset(text: string, offset: number) {
	const boundedOffset = Math.max(0, Math.min(offset, text.length));
	let left = boundedOffset;
	let right = boundedOffset;

	if (text[left] === '"') {
		left--;
	}
	if (text[right] === '"') {
		right++;
	}

	while (left >= 0 && text[left] !== '"') {
		left--;
	}
	if (left < 0) {
		return undefined;
	}

	while (right < text.length && text[right] !== '"') {
		right++;
	}
	if (right >= text.length) {
		return undefined;
	}

	const valueStart = left + 1;
	const valueEnd = right;
	if (boundedOffset < valueStart || boundedOffset > valueEnd) {
		return undefined;
	}

	let attrNameEnd = left - 1;
	while (attrNameEnd >= 0 && /\s/.test(text[attrNameEnd])) {
		attrNameEnd--;
	}
	if (attrNameEnd >= 0 && text[attrNameEnd] === '=') {
		attrNameEnd--;
		while (attrNameEnd >= 0 && /\s/.test(text[attrNameEnd])) {
			attrNameEnd--;
		}
	}
	if (attrNameEnd < 0) {
		return undefined;
	}

	let attrNameStart = attrNameEnd;
	while (attrNameStart >= 0 && /[A-Za-z0-9_.:-]/.test(text[attrNameStart])) {
		attrNameStart--;
	}

	const attributeName = text.substring(attrNameStart + 1, attrNameEnd + 1);
	const value = text.substring(valueStart, valueEnd);

	return {
		attributeName,
		value,
		valueStart,
		valueEnd,
	};
}

function findParentViewName(node: any): string | undefined {
	let current = node.parent;
	while (current) {
		if (current.attribs?.['view.bind']) {
			return current.attribs['view.bind'];
		}
		current = current.parent;
	}
	return undefined;
}

function createLocationFromProperty(property: ClassPropertyInfo): vscode.Location {
	return createLocationFromTsNode(property.sourceFile, property.node);
}

function createLocationFromClass(classInfo: CollectedClassInfo): vscode.Location {
	return createLocationFromTsNode(classInfo.sourceFile, classInfo.node.name ?? classInfo.node);
}

function createLocationFromTsNode(sourceFile: ts.SourceFile, node: ts.Node): vscode.Location {
	const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
	const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
	const uri = vscode.Uri.file(sourceFile.fileName);
	return new vscode.Location(
		uri,
		new vscode.Range(
			new vscode.Position(start.line, start.character),
			new vscode.Position(end.line, end.character)
		)
	);
}
