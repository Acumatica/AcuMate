import vscode from 'vscode';
import ts from 'typescript';
const fs = require('fs');

import {
	getCorrespondingTsFile,
	getClassPropertiesFromTs,
	CollectedClassInfo,
	ClassPropertyInfo,
	createClassInfoLookup,
	resolveViewBinding,
} from '../utils';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
} from './html-shared';

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
		// Resolved metadata lets us jump from HTML bindings directly to the backing TypeScript symbol.

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
			// Field names dereference through the closest parent view to locate the property in TS.
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
