import vscode from 'vscode';
import path from 'path';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
	findViewNameAtOrAbove,
	HtmlAttributeContext,
} from './html-shared';
import {
	getRelatedTsFiles,
	loadClassInfosFromFiles,
	filterClassesBySource,
	createClassInfoLookup,
	filterScreenLikeClasses,
	resolveViewBinding,
	CollectedClassInfo,
} from '../utils';
import { loadBackendFieldsForView } from './html-backend-utils';
import { BackendFieldMetadata, normalizeMetaName } from '../backend-metadata-utils';
import { resolveIncludeFilePath } from '../services/include-service';
import {
	BaseScreenDocument,
	getBaseScreenDocument,
	getCustomizationSelectorAttributes,
	loadHtmlDocument,
	queryBaseScreenElements,
} from '../services/screen-html-service';

interface FieldHoverResolution {
	fieldName: string;
	viewName: string;
	backendScreenClasses: CollectedClassInfo[];
}

interface IncludeFieldHoverContext {
	classInfoLookup: Map<string, CollectedClassInfo>;
	screenClasses: CollectedClassInfo[];
	backendScreenClasses: CollectedClassInfo[];
	templateDocument?: BaseScreenDocument;
	parameterValues: Map<string, string>;
}

export function registerHtmlHoverProvider(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerHoverProvider(
		{ language: 'html', scheme: 'file' },
		new HtmlHoverProvider()
	);
	context.subscriptions.push(provider);
}

export class HtmlHoverProvider implements vscode.HoverProvider {
	async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
		return provideHtmlFieldHover(document, position);
	}
}

export async function provideHtmlFieldHover(
	document: vscode.TextDocument,
	position: vscode.Position
): Promise<vscode.Hover | undefined> {
	const dom = parseDocumentDom(document.getText());
	if (!dom) {
		return undefined;
	}

	const offset = document.offsetAt(position);
	const node = findNodeAtOffset(dom, offset);
	if (!node) {
		return undefined;
	}

	const elementNode = elevateToElementNode(node);
	if (!elementNode) {
		return undefined;
	}

	const attributeContext = getAttributeContext(document, offset, elementNode);
	if (!attributeContext || !isFieldNameAttribute(attributeContext)) {
		return undefined;
	}

	return buildFieldHover(document.uri.fsPath, attributeContext, elementNode);
}

function isFieldNameAttribute(attribute: HtmlAttributeContext): boolean {
	if (attribute.attributeName !== 'name') {
		return false;
	}

	const tagName = attribute.tagName?.toLowerCase();
	return tagName === 'field' || tagName === 'qp-field';
}

async function buildFieldHover(
	htmlFilePath: string,
	attributeContext: HtmlAttributeContext,
	elementNode: any
): Promise<vscode.Hover | undefined> {
	const fieldName = attributeContext.value?.trim();
	if (!fieldName) {
		return undefined;
	}

	const tsFilePaths = getRelatedTsFiles(htmlFilePath);
	if (!tsFilePaths.length) {
		return undefined;
	}

	const classInfos = loadClassInfosFromFiles(tsFilePaths);
	if (!classInfos.length) {
		return undefined;
	}

	const relevantClassInfos = filterClassesBySource(classInfos, tsFilePaths);
	if (!relevantClassInfos.length) {
		return undefined;
	}

	const screenClasses = filterScreenLikeClasses(relevantClassInfos);
	if (!screenClasses.length) {
		return undefined;
	}

	const classInfoLookup = createClassInfoLookup(classInfos);
	const fieldReference = parseFieldName(fieldName);
	const hoverResolution =
		resolveIncludeFieldHover(htmlFilePath, elementNode, tsFilePaths, screenClasses, fieldReference) ??
		resolveHostFieldHover(htmlFilePath, elementNode, screenClasses, classInfoLookup, fieldReference);
	if (!hoverResolution) {
		return undefined;
	}

	const backendFields = await loadBackendFieldsForView(
		hoverResolution.viewName,
		hoverResolution.backendScreenClasses
	);
	if (!backendFields?.size) {
		return undefined;
	}

	const normalizedFieldName = normalizeMetaName(hoverResolution.fieldName);
	if (!normalizedFieldName) {
		return undefined;
	}

	const backendField = backendFields.get(normalizedFieldName);
	if (!backendField) {
		return undefined;
	}

	const markdown = buildFieldMarkdown(backendField, hoverResolution.fieldName, hoverResolution.viewName);
	if (!markdown) {
		return undefined;
	}

	return new vscode.Hover(markdown, attributeContext.valueRange);
}

function resolveHostFieldHover(
	htmlFilePath: string,
	elementNode: any,
	screenClasses: CollectedClassInfo[],
	classInfoLookup: Map<string, CollectedClassInfo>,
	fieldReference: FieldReference
): FieldHoverResolution | undefined {
	const viewName =
		fieldReference.viewName ??
		findParentViewName(elementNode) ??
		getViewNameFromCustomizationSelectors(elementNode, getBaseScreenDocument(htmlFilePath));
	if (!viewName || hasTemplateExpression(viewName) || hasTemplateExpression(fieldReference.fieldName)) {
		return undefined;
	}

	const resolution = resolveViewBinding(viewName, screenClasses, classInfoLookup);
	if (!resolution) {
		return undefined;
	}

	return {
		fieldName: fieldReference.fieldName,
		viewName,
		backendScreenClasses: screenClasses,
	};
}

function resolveIncludeFieldHover(
	htmlFilePath: string,
	elementNode: any,
	hostTsFilePaths: string[],
	hostScreenClasses: CollectedClassInfo[],
	fieldReference: FieldReference
): FieldHoverResolution | undefined {
	const context = getIncludeFieldHoverContext(
		htmlFilePath,
		elementNode,
		hostTsFilePaths,
		hostScreenClasses
	);
	if (!context) {
		return undefined;
	}

	const viewName =
		fieldReference.viewName ??
		resolveTemplateValue(
			getViewNameFromCustomizationSelectors(elementNode, context.templateDocument),
			context.parameterValues
		) ??
		findViewNameContainingField(fieldReference.fieldName, context);
	if (!viewName || hasTemplateExpression(viewName) || hasTemplateExpression(fieldReference.fieldName)) {
		return undefined;
	}

	const resolution = resolveViewBinding(viewName, context.screenClasses, context.classInfoLookup);
	if (!resolution) {
		return undefined;
	}

	return {
		fieldName: fieldReference.fieldName,
		viewName,
		backendScreenClasses: context.backendScreenClasses,
	};
}

function getIncludeFieldHoverContext(
	htmlFilePath: string,
	elementNode: any,
	hostTsFilePaths: string[],
	hostScreenClasses: CollectedClassInfo[]
): IncludeFieldHoverContext | undefined {
	const includeNode = findNearestIncludeNode(elementNode);
	const includeUrl = includeNode?.attribs?.url;
	if (typeof includeUrl !== 'string' || !includeUrl.length) {
		return undefined;
	}

	const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath);
	const includePath = resolveIncludeFilePath(includeUrl, htmlFilePath, workspaceRoots);
	if (!includePath) {
		return undefined;
	}

	const includeTsFilePaths = getRelatedTsFiles(includePath);
	const combinedTsFilePaths = dedupeFilePaths([...hostTsFilePaths, ...includeTsFilePaths]);
	const classInfos = combinedTsFilePaths.length ? loadClassInfosFromFiles(combinedTsFilePaths) : [];
	const relevantClassInfos = filterClassesBySource(classInfos, includeTsFilePaths);
	const screenClasses = filterScreenLikeClasses(relevantClassInfos);
	if (!screenClasses.length) {
		return undefined;
	}

	return {
		classInfoLookup: createClassInfoLookup(classInfos),
		screenClasses,
		backendScreenClasses: hostScreenClasses,
		templateDocument: loadHtmlDocument(includePath),
		parameterValues: getIncludeParameterValues(includeNode),
	};
}

interface FieldReference {
	viewName?: string;
	fieldName: string;
}

function parseFieldName(rawFieldName: string): FieldReference {
	const trimmed = rawFieldName.trim();
	const dotIndex = trimmed.indexOf('.');
	if (dotIndex === -1) {
		return { fieldName: trimmed };
	}

	const viewName = trimmed.substring(0, dotIndex).trim();
	const fieldName = trimmed.substring(dotIndex + 1).trim();
	return { viewName, fieldName };
}

function getViewNameFromCustomizationSelectors(
	node: any,
	document: BaseScreenDocument | undefined
): string | undefined {
	if (!document?.dom?.length) {
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
		if (!normalizedValue.length || hasTemplateExpression(normalizedValue)) {
			continue;
		}

		const { nodes, error } = queryBaseScreenElements(document, normalizedValue);
		if (error || !nodes.length) {
			continue;
		}

		for (const target of nodes) {
			const viewName = findViewNameAtOrAbove(target);
			if (viewName) {
				return viewName;
			}
		}
	}

	return undefined;
}

function findViewNameContainingField(
	fieldName: string,
	context: IncludeFieldHoverContext
): string | undefined {
	for (const screenClass of context.screenClasses) {
		for (const propertyName of screenClass.properties.keys()) {
			const resolution = resolveViewBinding(propertyName, [screenClass], context.classInfoLookup);
			const fieldProperty = resolution?.viewClass?.properties.get(fieldName);
			if (fieldProperty?.kind === 'field') {
				return propertyName;
			}
		}
	}

	return undefined;
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

function resolveTemplateValue(value: string | undefined, parameterValues: Map<string, string>): string | undefined {
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

function dedupeFilePaths(filePaths: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const filePath of filePaths) {
		const normalized = path.normalize(filePath);
		if (seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		result.push(filePath);
	}
	return result;
}

function buildFieldMarkdown(
	metadata: BackendFieldMetadata,
	fieldName: string,
	viewName: string
): vscode.MarkdownString | undefined {
	const title = metadata.field.displayName ?? fieldName;
	if (!title) {
		return undefined;
	}

	const lines: string[] = [`**${title}**`];
	if (metadata.field.typeName) {
		lines.push(`- Type: \`${metadata.field.typeName}\``);
	}
	lines.push(`- Field: \`${metadata.fieldName}\``);
	lines.push(`- View: \`${viewName}\``);
	if (metadata.field.defaultControlType) {
		lines.push(`- Default control: \`${metadata.field.defaultControlType}\``);
	}

	const markdown = new vscode.MarkdownString(lines.join('\n'));
	markdown.isTrusted = false;
	return markdown;
}
