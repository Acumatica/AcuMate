import vscode from 'vscode';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
	HtmlAttributeContext,
} from './html-shared';
import {
	getRelatedTsFiles,
	loadClassInfosFromFiles,
	filterClassesBySource,
	createClassInfoLookup,
	filterScreenLikeClasses,
	resolveViewBinding,
} from '../utils';
import { loadBackendFieldsForView } from './html-backend-utils';
import { BackendFieldMetadata, normalizeMetaName } from '../backend-metadata-utils';

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

	const viewName = findParentViewName(elementNode);
	if (!viewName) {
		return undefined;
	}

	const classInfoLookup = createClassInfoLookup(classInfos);
	const resolution = resolveViewBinding(viewName, screenClasses, classInfoLookup);
	if (!resolution) {
		return undefined;
	}

	const backendFields = await loadBackendFieldsForView(viewName, screenClasses);
	if (!backendFields?.size) {
		return undefined;
	}

	const normalizedFieldName = normalizeMetaName(fieldName);
	if (!normalizedFieldName) {
		return undefined;
	}

	const backendField = backendFields.get(normalizedFieldName);
	if (!backendField) {
		return undefined;
	}

	const markdown = buildFieldMarkdown(backendField, fieldName, viewName);
	if (!markdown) {
		return undefined;
	}

	return new vscode.Hover(markdown, attributeContext.valueRange);
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