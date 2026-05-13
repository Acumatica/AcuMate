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
	filterClassesBySource,
	getLineAndColumnFromIndex,
	resolveClassInfoForProperty,
} from '../utils';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
	findViewNameAtOrAbove,
} from './html-shared';
import { resolveIncludeFilePath } from '../services/include-service';
import {
	getBaseScreenDocument,
	isCustomizationSelectorAttribute,
	queryBaseScreenElements,
	BaseScreenDocument,
	getCustomizationSelectorAttributes,
	loadHtmlDocument,
	getDocumentForNode,
} from '../services/screen-html-service';

interface DefinitionMetadataContext {
	classInfoLookup: Map<string, CollectedClassInfo>;
	screenClasses: CollectedClassInfo[];
}

interface IncludeDefinitionContext extends DefinitionMetadataContext {
	templateDocument?: BaseScreenDocument;
	parameterValues: Map<string, string>;
}

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
		const includeContext = getIncludeDefinitionContext(elementNode, document.uri.fsPath, workspaceRoots);

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

		const tsFilePaths = getRelatedTsFiles(document.uri.fsPath);
		if (!tsFilePaths.length) {
			return;
		}

		const classInfos = loadClassInfosFromFiles(tsFilePaths);
		if (!classInfos.length) {
			return;
		}

		const relevantClassInfos = filterClassesBySource(classInfos, tsFilePaths);
		if (!relevantClassInfos.length) {
			return;
		}

		const classInfoLookup = createClassInfoLookup(classInfos);
		const screenClasses = filterScreenLikeClasses(relevantClassInfos);
		const documentMetadataContext: DefinitionMetadataContext = { classInfoLookup, screenClasses };
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
			const actionProperty =
				findActionProperty(attributeContext.value, screenClasses) ??
				findViewActionProperty(attributeContext.value, elementNode, documentMetadataContext);
			if (!actionProperty) {
				return;
			}
			return createLocationFromProperty(actionProperty);
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

function getIncludeDefinitionContext(
	elementNode: any,
	documentPath: string,
	workspaceRoots: string[] | undefined
): IncludeDefinitionContext | undefined {
	const includeNode = findNearestIncludeNode(elementNode);
	const includeUrl = includeNode?.attribs?.url;
	if (typeof includeUrl !== 'string' || !includeUrl.length) {
		return undefined;
	}

	const includePath = resolveIncludeFilePath(includeUrl, documentPath, workspaceRoots);
	if (!includePath) {
		return undefined;
	}

	const includeTsFilePaths = getRelatedTsFiles(includePath);
	const classInfos = includeTsFilePaths.length ? loadClassInfosFromFiles(includeTsFilePaths) : [];
	const relevantClassInfos = filterClassesBySource(classInfos, includeTsFilePaths);

	return {
		classInfoLookup: createClassInfoLookup(classInfos),
		screenClasses: filterScreenLikeClasses(relevantClassInfos),
		templateDocument: loadHtmlDocument(includePath),
		parameterValues: getIncludeParameterValues(includeNode),
	};
}

function hasUnboundAttribute(elementNode: any): boolean {
	return Boolean(elementNode?.attribs && Object.prototype.hasOwnProperty.call(elementNode.attribs, 'unbound'));
}

function findNearestIncludeNode(node: any): any | undefined {
	let current = node;
	while (current) {
		if (current.type === 'tag' && current.name === 'qp-include') {
			return current;
		}

		current = current.parent ?? current.parentNode;
	}
	return undefined;
}

function getIncludeParameterValues(includeNode: any): Map<string, string> {
	const values = new Map<string, string>();
	const attributes = includeNode?.attribs ?? {};
	for (const [attributeName, attributeValue] of Object.entries(attributes)) {
		if (typeof attributeValue === 'string') {
			values.set(attributeName, attributeValue);
		}
	}
	return values;
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
	allowAnyViewFallback = false
): vscode.Location[] {
	if (!rawFieldName) {
		return [];
	}

	const parsed = parseFieldName(rawFieldName);
	let viewName = parsed.viewName;
	let fieldName = parsed.fieldName;
	let allowFallback = allowAnyViewFallback;

	if (!parsed.viewName) {
		viewName = findParentViewName(elementNode);
	}
	if (!viewName) {
		const selectorViewName = getViewNameFromCustomizationSelectors(elementNode, selectorDocument);
		allowFallback ||= hasTemplateExpression(selectorViewName);
		viewName = selectorViewName;
	}

	if (parameterValues) {
		allowFallback ||= hasTemplateExpression(viewName);
		viewName = resolveTemplateValue(viewName, parameterValues);
		fieldName = resolveTemplateValue(fieldName, parameterValues) ?? fieldName;
	}

	if (!fieldName) {
		return [];
	}

	if (viewName && !hasTemplateExpression(viewName)) {
		const resolution = resolveViewBinding(viewName, metadataContext.screenClasses, metadataContext.classInfoLookup);
		const fieldProperty = resolution?.viewClass?.properties.get(fieldName);
		if (fieldProperty?.kind === 'field') {
			return [createLocationFromProperty(fieldProperty)];
		}

		if (!allowFallback) {
			return [];
		}
	}

	if (!allowFallback) {
		return [];
	}

	return getFieldDefinitionsFromAnyView(fieldName, metadataContext);
}

function parseFieldName(rawFieldName: string): { viewName?: string; fieldName: string } {
	const trimmed = rawFieldName.trim();
	const dotIndex = trimmed.indexOf('.');
	if (dotIndex === -1) {
		return { fieldName: trimmed };
	}

	const viewName = trimmed.substring(0, dotIndex).trim();
	const fieldName = trimmed.substring(dotIndex + 1).trim();
	return { viewName, fieldName };
}

function getFieldDefinitionsFromAnyView(
	fieldName: string,
	metadataContext: DefinitionMetadataContext
): vscode.Location[] {
	const locations: vscode.Location[] = [];
	const seen = new Set<string>();

	for (const screenClass of metadataContext.screenClasses) {
		for (const property of screenClass.properties.values()) {
			if (property.kind !== 'view' && property.kind !== 'viewCollection') {
				continue;
			}

			const viewClass = resolveClassInfoForProperty(property, metadataContext.classInfoLookup);
			const fieldProperty = viewClass?.properties.get(fieldName);
			if (fieldProperty?.kind !== 'field') {
				continue;
			}

			const key = `${fieldProperty.sourceFile.fileName}:${fieldProperty.node.getStart()}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			locations.push(createLocationFromProperty(fieldProperty));
		}
	}

	return locations;
}

function resolveTemplateValue(
	value: string | undefined,
	parameterValues: Map<string, string>
): string | undefined {
	if (!value) {
		return value;
	}

	return value.replace(/{{\s*([^}\s]+)\s*}}/g, (match, parameterName: string) => {
		const parameterValue = parameterValues.get(parameterName)?.trim();
		return parameterValue || match;
	}).trim();
}

function hasTemplateExpression(value: string | undefined): boolean {
	return typeof value === 'string' && /{{\s*[^}]+\s*}}/.test(value);
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

function getViewNameFromCustomizationSelectors(
	node: any,
	baseDocument: BaseScreenDocument | undefined
): string | undefined {
	if (!baseDocument?.dom?.length) {
		return undefined;
	}

	const attributes = node?.attribs;
	if (!attributes) {
		return undefined;
	}

	for (const attributeName of getCustomizationSelectorAttributes()) {
		const rawValue = attributes[attributeName];
		if (typeof rawValue !== 'string') {
			continue;
		}
		const normalizedValue = rawValue.trim();
		if (!normalizedValue.length) {
			continue;
		}

		const { nodes, error } = queryBaseScreenElements(baseDocument, normalizedValue);
		if (error || !nodes.length) {
			continue;
		}

		for (const candidate of nodes) {
			const viewName = findViewNameAtOrAbove(candidate);
			if (viewName) {
				return viewName;
			}
		}
	}

	return undefined;
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
