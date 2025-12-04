import vscode from 'vscode';
import * as path from 'path';
import {
	CollectedClassInfo,
	ClassPropertyInfo,
	getClassPropertiesFromTs,
	tryGetGraphType,
	tryGetGraphTypeFromExtension
} from '../utils';
import { AcuMateContext } from '../plugin-context';
import { GraphStructure } from '../model/graph-structure';
import {
	buildBackendViewMap,
	BackendFieldMetadata,
	BackendViewMetadata,
	buildBackendActionMap,
	normalizeMetaName
} from '../backend-metadata-utils';

export function registerTsHoverProvider(context: vscode.ExtensionContext) {
	const selector: vscode.DocumentSelector = [{ language: 'typescript', scheme: 'file' }];
	const provider = vscode.languages.registerHoverProvider(selector, {
		provideHover(document, position) {
			return provideTSFieldHover(document, position);
		}
	});
	context.subscriptions.push(provider);
}

export async function provideTSFieldHover(
	document: vscode.TextDocument,
	position: vscode.Position
): Promise<vscode.Hover | undefined> {
	if (!AcuMateContext.ApiService) {
		return undefined;
	}

	const documentText = document.getText();
	const classInfos = getClassPropertiesFromTs(documentText, document.fileName);
	if (!classInfos.length) {
		return undefined;
	}

	const offset = document.offsetAt(position);
	const hoverTarget = findHoverPropertyTarget(classInfos, document.fileName, offset);
	if (!hoverTarget) {
		return undefined;
	}

	const graphName = tryGetGraphType(documentText) ?? tryGetGraphTypeFromExtension(document.fileName);
	if (!graphName) {
		return undefined;
	}

	const graphStructure = await AcuMateContext.ApiService.getGraphStructure(graphName);
	if (!graphStructure) {
		return undefined;
	}

	const backendViews = buildBackendViewMap(graphStructure);

	const range = new vscode.Range(
		document.positionAt(hoverTarget.property.node.name.getStart()),
		document.positionAt(hoverTarget.property.node.name.getEnd())
	);

	if (hoverTarget.property.kind === 'field' && hoverTarget.classInfo.type === 'PXView') {
		const markdown = buildFieldHoverMarkdown(classInfos, hoverTarget, backendViews);
		if (markdown) {
			return new vscode.Hover(markdown, range);
		}
	}

	if (hoverTarget.property.kind === 'view' || hoverTarget.property.kind === 'viewCollection') {
		const markdown = buildViewHoverMarkdown(hoverTarget.property, backendViews);
		if (markdown) {
			return new vscode.Hover(markdown, range);
		}
	}

	if (hoverTarget.property.kind === 'action') {
		const markdown = buildActionHoverMarkdown(hoverTarget.property, graphStructure);
		if (markdown) {
			return new vscode.Hover(markdown, range);
		}
	}

	return undefined;
}

function findHoverPropertyTarget(
	classInfos: CollectedClassInfo[],
	documentPath: string,
	offset: number
): { classInfo: CollectedClassInfo; property: ClassPropertyInfo } | undefined {
	const normalizedDocumentPath = path.normalize(documentPath).toLowerCase();
	for (const classInfo of classInfos) {
		for (const property of classInfo.properties.values()) {
			const propertyPath = path.normalize(property.sourceFile.fileName).toLowerCase();
			if (propertyPath !== normalizedDocumentPath) {
				continue;
			}

			const nameNode = property.node.name;
			const start = nameNode.getStart();
			const end = nameNode.getEnd();
			if (offset >= start && offset <= end) {
				return { classInfo, property };
			}
		}
	}

	return undefined;
}

function collectReferencingViews(classInfos: CollectedClassInfo[], targetClassName: string): Set<string> {
	const referencing = new Set<string>();
	for (const classInfo of classInfos) {
		for (const property of classInfo.properties.values()) {
			if (
				(property.kind === 'view' || property.kind === 'viewCollection') &&
				property.viewClassName === targetClassName
			) {
				const normalized = normalizeMetaName(property.name);
				if (normalized) {
					referencing.add(normalized);
				}
			}
		}
	}
	return referencing;
}


function buildFieldHoverMarkdown(
	classInfos: CollectedClassInfo[],
	hoverTarget: { classInfo: CollectedClassInfo; property: ClassPropertyInfo },
	backendViews: Map<string, BackendViewMetadata>
): vscode.MarkdownString | undefined {
	const referencingViews = collectReferencingViews(classInfos, hoverTarget.classInfo.className);
	if (!referencingViews.size) {
		return undefined;
	}

	const normalizedFieldName = normalizeMetaName(hoverTarget.property.name);
	if (!normalizedFieldName) {
		return undefined;
	}

	let matchedField: BackendFieldMetadata | undefined;
	let matchedViewName: string | undefined;
	for (const viewKey of referencingViews) {
		const backendView = backendViews.get(viewKey);
		if (!backendView) {
			continue;
		}

		const candidate = backendView.fields.get(normalizedFieldName);
		if (candidate) {
			matchedField = candidate;
			matchedViewName = backendView.viewName;
			break;
		}
	}

	if (!matchedField) {
		return undefined;
	}

	return createFieldMarkdown(matchedField, matchedViewName, hoverTarget.property);
}

function buildViewHoverMarkdown(
	property: ClassPropertyInfo,
	backendViews: Map<string, BackendViewMetadata>
): vscode.MarkdownString | undefined {
	const normalizedViewName = normalizeMetaName(property.name);
	if (!normalizedViewName) {
		return undefined;
	}

	const backendView = backendViews.get(normalizedViewName);
	if (!backendView) {
		return undefined;
	}

	const title = backendView.view.displayName ?? backendView.viewName ?? property.name;
	if (!title) {
		return undefined;
	}

	const details: string[] = [];
	if (backendView.view.cacheType) {
		details.push(`- Cache type: \`${backendView.view.cacheType}\``);
	}
	if (backendView.view.cacheName) {
		details.push(`- Cache name: \`${backendView.view.cacheName}\``);
	}
	if (!details.length) {
		details.push(`- View: \`${backendView.viewName}\``);
	}

	const markdown = new vscode.MarkdownString([`**${title}**`, ...details].join('\n'));
	markdown.isTrusted = false;
	return markdown;
}

function buildActionHoverMarkdown(
	property: ClassPropertyInfo,
	structure: GraphStructure
): vscode.MarkdownString | undefined {
	const backendActions = buildBackendActionMap(structure);
	if (!backendActions.size) {
		return undefined;
	}

	const normalizedActionName = normalizeMetaName(property.name);
	if (!normalizedActionName) {
		return undefined;
	}

	const backendAction = backendActions.get(normalizedActionName);
	if (!backendAction) {
		return undefined;
	}

	const title = backendAction.action.displayName ?? backendAction.actionName ?? property.name;
	if (!title) {
		return undefined;
	}

	const actionName = backendAction.action.name ?? property.name;
	const details = [`- Action: \`${actionName}\``];
	const markdown = new vscode.MarkdownString([`**${title}**`, ...details].join('\n'));
	markdown.isTrusted = false;
	return markdown;
}

function createFieldMarkdown(
	fieldMetadata: BackendFieldMetadata,
	viewName: string | undefined,
	property: ClassPropertyInfo
): vscode.MarkdownString | undefined {
	const title = fieldMetadata.field.displayName ?? fieldMetadata.fieldName ?? property.name;
	if (!title) {
		return undefined;
	}

	const details: string[] = [];
	const typeName = fieldMetadata.field.typeName ?? property.typeName;
	if (typeName) {
		details.push(`- Type: \`${typeName}\``);
	}

	if (fieldMetadata.field.defaultControlType) {
		details.push(`- Default control: \`${fieldMetadata.field.defaultControlType}\``);
	}

	if (viewName) {
		details.push(`- View: \`${viewName}\``);
	}

	const markdown = new vscode.MarkdownString([`**${title}**`, ...details].join('\n'));
	markdown.isTrusted = false;
	return markdown;
}
