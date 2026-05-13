import vscode from 'vscode';
import ts from 'typescript';

import {
	getRelatedTsFiles,
	loadClassInfosFromFiles,
	CollectedClassInfo,
	ClassPropertyInfo,
	resolveViewBinding,
	collectActionProperties,
	getLineAndColumnFromIndex,
} from '../utils';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
	isActionStateBindTag,
} from './html-shared';
import { resolveIncludeFilePath } from '../services/include-service';
import {
	getBaseScreenDocument,
	isCustomizationSelectorAttribute,
	queryBaseScreenElements,
	BaseScreenDocument,
	getDocumentForNode,
} from '../services/screen-html-service';
import {
	HtmlFieldMetadataContext,
	HtmlIncludeFieldContext,
	createHtmlFieldMetadataContext,
	findFieldsInAnyView,
	getIncludeFieldContext,
	parseFieldReference,
	resolveHtmlField,
} from '../services/html-field-context-service';

type DefinitionMetadataContext = HtmlFieldMetadataContext;
type IncludeDefinitionContext = HtmlIncludeFieldContext;

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

		const baseScreenDocument = getBaseScreenDocument(document.uri.fsPath);
		const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath);
		const hostTsFilePaths = getRelatedTsFiles(document.uri.fsPath);
		const includeContext = getIncludeFieldContext({
			documentPath: document.uri.fsPath,
			elementNode,
			hostTsFilePaths,
			workspaceRoots,
		});

		if (attributeContext.attributeName === 'url' && attributeContext.tagName === 'qp-include') {
			const includePath = resolveIncludeFilePath(attributeContext.value, document.uri.fsPath, workspaceRoots);
			if (!includePath) {
				return;
			}
			return new vscode.Location(vscode.Uri.file(includePath), new vscode.Position(0, 0));
		}

		if (isCustomizationSelectorAttribute(attributeContext.attributeName)) {
			const selector = attributeContext.value?.trim();
			if (!selector) {
				return;
			}

			const includeLocations = getSelectorLocations(includeContext?.templateDocument, selector);
			if (includeLocations.length) {
				return includeLocations;
			}

			const baseLocations = getSelectorLocations(baseScreenDocument, selector);
			if (baseLocations.length) {
				return baseLocations;
			}
		}

		if (
			attributeContext.attributeName === 'name' &&
			attributeContext.tagName === 'field' &&
			hasUnboundAttribute(elementNode)
		) {
			return;
		}

		if (attributeContext.attributeName === 'name' && attributeContext.tagName === 'field' && includeContext) {
			const includeLocations = getFieldDefinitionLocations(
				attributeContext.value,
				elementNode,
				includeContext,
				includeContext.templateDocument,
				includeContext.parameterValues,
				true
			);
			if (includeLocations.length) {
				return includeLocations;
			}
		}

		const tsFilePaths = hostTsFilePaths;
		if (!tsFilePaths.length) {
			return;
		}

		const classInfos = loadClassInfosFromFiles(tsFilePaths);
		if (!classInfos.length) {
			return;
		}

		const documentMetadataContext = createHtmlFieldMetadataContext(classInfos, tsFilePaths);
		const { classInfoLookup, screenClasses } = documentMetadataContext;
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

		if (attributeContext.attributeName === 'id' && attributeContext.tagName === 'qp-panel') {
			const panelViewName = attributeContext.value?.trim();
			if (!panelViewName) {
				return;
			}

			const resolution = resolveViewBinding(panelViewName, screenClasses, classInfoLookup);
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
			if (isActionStateBindTag(attributeContext.tagName)) {
				const actionProperty =
					findQualifiedViewActionProperty(attributeContext.value, documentMetadataContext) ??
					findActionProperty(attributeContext.value, screenClasses) ??
					findViewActionProperty(attributeContext.value, elementNode, documentMetadataContext);
				if (!actionProperty) {
					return;
				}
				return createLocationFromProperty(actionProperty);
			}

			const locations = getFieldDefinitionLocations(
				attributeContext.value,
				elementNode,
				documentMetadataContext,
				includeContext?.templateDocument ?? baseScreenDocument,
				includeContext?.parameterValues,
				false,
				false
			);
			if (locations.length) {
				return locations;
			}
		}

		if (attributeContext.attributeName === 'control-state.bind' && attributeContext.tagName === 'qp-field') {
			const parsed = parseControlStateBinding(attributeContext.value);
			if (!parsed) {
				return;
			}
			const resolution = resolveViewBinding(parsed.viewName, screenClasses, classInfoLookup);
			const fieldProperty = resolution?.viewClass?.properties.get(parsed.fieldName);
			if (!fieldProperty || fieldProperty.kind !== 'field') {
				return;
			}
			return createLocationFromProperty(fieldProperty);
		}

		if (attributeContext.attributeName === 'name' && attributeContext.tagName === 'field') {
			// Field names dereference through the closest parent view to locate the property in TS.
			const locations = getFieldDefinitionLocations(
				attributeContext.value,
				elementNode,
				documentMetadataContext,
				includeContext?.templateDocument ?? baseScreenDocument,
				includeContext?.parameterValues
			);
			if (locations.length) {
				return locations;
			}
		}

		return undefined;
	}
}

function hasUnboundAttribute(elementNode: any): boolean {
	return Boolean(elementNode?.attribs && Object.prototype.hasOwnProperty.call(elementNode.attribs, 'unbound'));
}

function getSelectorLocations(
	document: BaseScreenDocument | undefined,
	selector: string
): vscode.Location[] {
	if (!document) {
		return [];
	}

	const { nodes, matches, error } = queryBaseScreenElements(document, selector);
	if (error || !nodes.length) {
		return [];
	}

	const locations: vscode.Location[] = [];
	const seen = new Set<string>();
	const selectorMatches = matches.length
		? matches
		: nodes.map(node => ({ node, document: getDocumentForNode(document, node) }));
	for (const { node: nodeCandidate, document: sourceDocument } of selectorMatches) {
		const startIndex = typeof nodeCandidate.startIndex === 'number' ? nodeCandidate.startIndex : undefined;
		const key = startIndex === undefined ? undefined : `${sourceDocument.filePath}:${startIndex}`;
		if (key === undefined || seen.has(key)) {
			continue;
		}
		seen.add(key);
		const location = createLocationFromHtmlNode(sourceDocument, nodeCandidate);
		if (location) {
			locations.push(location);
		}
	}

	return locations;
}

function getFieldDefinitionLocations(
	rawFieldName: string | undefined,
	elementNode: any,
	metadataContext: DefinitionMetadataContext,
	selectorDocument?: BaseScreenDocument,
	parameterValues?: Map<string, string>,
	allowAnyViewFallback = false,
	useParentView = true
): vscode.Location[] {
	if (!rawFieldName) {
		return [];
	}

	const parsed = parseFieldReference(rawFieldName);
	const resolution = resolveHtmlField({
		fieldReference: parsed,
		elementNode,
		metadataContext,
		selectorDocument,
		parameterValues,
		allowAnyViewFallback,
		useParentView,
	});
	if (!resolution || resolution.hasTemplatedBinding) {
		return [];
	}

	if (resolution.fieldProperty?.kind === 'field' && !resolution.usedAnyViewFallback) {
		return [createLocationFromProperty(resolution.fieldProperty)];
	}

	if (!allowAnyViewFallback) {
		return [];
	}

	return findFieldsInAnyView(resolution.fieldName, metadataContext)
		.map(match => createLocationFromProperty(match.fieldProperty));
}

function findActionProperty(actionName: string | undefined, screenClasses: CollectedClassInfo[]): ClassPropertyInfo | undefined {
	if (!actionName) {
		return undefined;
	}
	const actions = collectActionProperties(screenClasses);
	return actions.get(actionName);
}

function findViewActionProperty(
	actionName: string | undefined,
	elementNode: any,
	metadataContext: DefinitionMetadataContext
): ClassPropertyInfo | undefined {
	if (!actionName) {
		return undefined;
	}

	const viewName = findParentViewName(elementNode);
	const viewClass = viewName
		? resolveViewBinding(viewName, metadataContext.screenClasses, metadataContext.classInfoLookup)?.viewClass
		: undefined;
	const actionProperty = viewClass?.properties.get(actionName);
	return actionProperty?.kind === 'action' ? actionProperty : undefined;
}

function findQualifiedViewActionProperty(
	actionBinding: string | undefined,
	metadataContext: DefinitionMetadataContext
): ClassPropertyInfo | undefined {
	const parsed = parseQualifiedActionBinding(actionBinding);
	if (!parsed) {
		return undefined;
	}

	const viewClass = resolveViewBinding(
		parsed.viewName,
		metadataContext.screenClasses,
		metadataContext.classInfoLookup
	)?.viewClass;
	const actionProperty = viewClass?.properties.get(parsed.actionName);
	return actionProperty?.kind === 'action' ? actionProperty : undefined;
}

function parseQualifiedActionBinding(value: string | undefined): { viewName: string; actionName: string } | undefined {
	if (!value) {
		return undefined;
	}

	const parts = value.split('.');
	if (parts.length !== 2) {
		return undefined;
	}

	const viewName = parts[0]?.trim();
	const actionName = parts[1]?.trim();
	if (!viewName || !actionName) {
		return undefined;
	}

	return { viewName, actionName };
}

function parseControlStateBinding(value: string | undefined): { viewName: string; fieldName: string } | undefined {
	if (!value) {
		return undefined;
	}
	const parts = value.split('.');
	if (parts.length !== 2) {
		return undefined;
	}
	const viewName = parts[0]?.trim();
	const fieldName = parts[1]?.trim();
	if (!viewName || !fieldName) {
		return undefined;
	}
	return { viewName, fieldName };
}

function createLocationFromHtmlNode(document: BaseScreenDocument, node: any): vscode.Location | undefined {
	if (typeof node.startIndex !== 'number' || typeof node.endIndex !== 'number') {
		return undefined;
	}

	const start = getLineAndColumnFromIndex(document.content, node.startIndex);
	const end = getLineAndColumnFromIndex(document.content, node.endIndex);
	return new vscode.Location(
		vscode.Uri.file(document.filePath),
		new vscode.Range(
			new vscode.Position(start.line, start.column),
			new vscode.Position(end.line, end.column)
		)
	);
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
