import vscode from 'vscode';
import ts from 'typescript';

import {
	getRelatedTsFiles,
	loadClassInfosFromFiles,
	CollectedClassInfo,
	ClassPropertyInfo,
	createClassInfoLookup,
	resolveViewBinding,
	filterScreenLikeClasses,
	collectActionProperties,
} from '../utils';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
} from './html-shared';

// Hooks VS Code so view/field bindings support "Go to Definition" directly from HTML.
export function registerHtmlDefinitionProvider(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerDefinitionProvider(
		{ language: 'html', scheme: 'file' },
		new HtmlDefinitionProvider()
	);

	context.subscriptions.push(provider);
}

export class HtmlDefinitionProvider implements vscode.DefinitionProvider {
	// Resolves the active attribute and maps it to the appropriate TS symbol.
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

		const tsFilePaths = getRelatedTsFiles(document.uri.fsPath);
		if (!tsFilePaths.length) {
			return;
		}

		const classInfos = loadClassInfosFromFiles(tsFilePaths);
		if (!classInfos.length) {
			return;
		}

		const classInfoLookup = createClassInfoLookup(classInfos);
		const screenClasses = filterScreenLikeClasses(classInfos);
		// Resolved metadata lets us jump from HTML bindings directly to the backing TypeScript symbol.

		if (attributeContext.attributeName === 'view.bind' || (attributeContext.attributeName === 'view' && attributeContext.tagName === 'using')) {
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

		if (attributeContext.attributeName === 'state.bind') {
			const actionProperty = findActionProperty(attributeContext.value, screenClasses);
			if (!actionProperty) {
				return;
			}
			return createLocationFromProperty(actionProperty);
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

function findActionProperty(actionName: string | undefined, screenClasses: CollectedClassInfo[]): ClassPropertyInfo | undefined {
	if (!actionName) {
		return undefined;
	}
	const actions = collectActionProperties(screenClasses);
	return actions.get(actionName);
}

// Converts a collected property back into a VS Code location for navigation.
function createLocationFromProperty(property: ClassPropertyInfo): vscode.Location {
	return createLocationFromTsNode(property.sourceFile, property.node);
}

// Same as above but for class declarations (view types).
function createLocationFromClass(classInfo: CollectedClassInfo): vscode.Location {
	return createLocationFromTsNode(classInfo.sourceFile, classInfo.node.name ?? classInfo.node);
}

// Normalizes a TS node's span to a VS Code range.
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
