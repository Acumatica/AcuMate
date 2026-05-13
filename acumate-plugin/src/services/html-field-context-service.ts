import path from 'path';

import {
	ClassPropertyInfo,
	CollectedClassInfo,
	ViewResolution,
	createClassInfoLookup,
	filterClassesBySource,
	filterScreenLikeClasses,
	getRelatedTsFiles,
	loadClassInfosFromFiles,
	resolveClassInfoForProperty,
	resolveViewBinding,
} from '../utils';
import { findParentViewName, findViewNameAtOrAbove } from '../providers/html-shared';
import { resolveIncludeFilePath } from './include-service';
import {
	BaseScreenDocument,
	getCustomizationSelectorAttributes,
	isCustomizationSelectorAttribute,
	loadHtmlDocument,
	queryBaseScreenElements,
} from './screen-html-service';

export interface HtmlFieldMetadataContext {
	classInfoLookup: Map<string, CollectedClassInfo>;
	screenClasses: CollectedClassInfo[];
	viewResolutionCache?: Map<string, ViewResolution | undefined>;
}

export interface HtmlIncludeTemplateFieldContext extends HtmlFieldMetadataContext {
	templateDocument?: BaseScreenDocument;
	viewResolutionCache: Map<string, ViewResolution | undefined>;
}

export interface HtmlIncludeFieldContext extends HtmlIncludeTemplateFieldContext {
	includeNode: any;
	includePath: string;
	parameterValues: Map<string, string>;
	hostScreenClasses?: CollectedClassInfo[];
}

export interface FieldReference {
	viewName?: string;
	fieldName: string;
}

export interface HtmlFieldResolution {
	fieldName: string;
	viewName?: string;
	viewResolution?: ViewResolution;
	fieldProperty?: ClassPropertyInfo;
	usedAnyViewFallback: boolean;
	hasTemplatedBinding: boolean;
}

export interface FieldInViewResolution {
	viewName: string;
	viewResolution: ViewResolution;
	fieldProperty: ClassPropertyInfo;
}

export type HtmlIncludeTemplateFieldContextCache =
	Map<string, HtmlIncludeTemplateFieldContext | undefined>;

export function createHtmlFieldMetadataContext(
	classInfos: CollectedClassInfo[],
	sourceFilePaths: string[]
): HtmlFieldMetadataContext {
	const relevantClassInfos = filterClassesBySource(classInfos, sourceFilePaths);
	return {
		classInfoLookup: createClassInfoLookup(classInfos),
		screenClasses: filterScreenLikeClasses(relevantClassInfos),
		viewResolutionCache: new Map(),
	};
}

export function loadHtmlFieldMetadataContext(
	tsFilePaths: string[]
): HtmlFieldMetadataContext | undefined {
	if (!tsFilePaths.length) {
		return undefined;
	}

	const classInfos = loadClassInfosFromFiles(tsFilePaths);
	if (!classInfos.length) {
		return undefined;
	}

	const context = createHtmlFieldMetadataContext(classInfos, tsFilePaths);
	if (!context.screenClasses.length) {
		return undefined;
	}

	return context;
}

export function resolveHtmlView(
	viewName: string | undefined,
	context: HtmlFieldMetadataContext
): ViewResolution | undefined {
	if (!viewName) {
		return undefined;
	}

	const cache = context.viewResolutionCache;
	if (cache?.has(viewName)) {
		return cache.get(viewName);
	}

	const resolution = resolveViewBinding(viewName, context.screenClasses, context.classInfoLookup);
	cache?.set(viewName, resolution);
	return resolution;
}

export function parseFieldReference(rawFieldName: string): FieldReference {
	const trimmed = rawFieldName.trim();
	const dotIndex = trimmed.indexOf('.');
	if (dotIndex === -1) {
		return { fieldName: trimmed };
	}

	const viewName = trimmed.substring(0, dotIndex).trim();
	const fieldName = trimmed.substring(dotIndex + 1).trim();
	return { viewName, fieldName };
}

export function resolveHtmlField(
	options: {
		rawFieldName?: string;
		fieldReference?: FieldReference;
		elementNode: any;
		metadataContext: HtmlFieldMetadataContext;
		selectorDocument?: BaseScreenDocument;
		parameterValues?: Map<string, string>;
		allowAnyViewFallback?: boolean;
		allowAnyViewWhenUnscoped?: boolean;
		useParentView?: boolean;
	}
): HtmlFieldResolution | undefined {
	const fieldReference =
		options.fieldReference ??
		(options.rawFieldName ? parseFieldReference(options.rawFieldName) : undefined);
	if (!fieldReference) {
		return undefined;
	}

	let viewName = fieldReference.viewName;
	let fieldName = fieldReference.fieldName;
	let allowAnyViewFallback = Boolean(options.allowAnyViewFallback);

	if (!viewName && options.useParentView !== false) {
		viewName = findParentViewName(options.elementNode);
	}

	if (!viewName) {
		const selectorViewName = getViewNameFromCustomizationSelectors(
			options.elementNode,
			options.selectorDocument
		);
		allowAnyViewFallback ||= hasTemplateExpression(selectorViewName);
		viewName = selectorViewName;
	}

	if (options.parameterValues) {
		allowAnyViewFallback ||= hasTemplateExpression(viewName);
		viewName = resolveTemplateValue(viewName, options.parameterValues);
		fieldName = resolveTemplateValue(fieldName, options.parameterValues) ?? fieldName;
	}

	const hasTemplatedBinding =
		hasTemplateExpression(viewName) ||
		hasTemplateExpression(fieldName);
	if (!fieldName || hasTemplatedBinding) {
		return {
			fieldName,
			viewName,
			usedAnyViewFallback: false,
			hasTemplatedBinding,
		};
	}

	if (viewName) {
		const viewResolution = resolveHtmlView(viewName, options.metadataContext);
		const fieldProperty = viewResolution?.viewClass?.properties.get(fieldName);
		if (fieldProperty?.kind === 'field') {
			return {
				fieldName,
				viewName,
				viewResolution,
				fieldProperty,
				usedAnyViewFallback: false,
				hasTemplatedBinding: false,
			};
		}

		if (!allowAnyViewFallback) {
			return {
				fieldName,
				viewName,
				viewResolution,
				usedAnyViewFallback: false,
				hasTemplatedBinding: false,
			};
		}
	}

	if (allowAnyViewFallback || (!viewName && options.allowAnyViewWhenUnscoped)) {
		const anyViewResolution = findFieldInAnyView(fieldName, options.metadataContext);
		if (anyViewResolution) {
			return {
				fieldName,
				viewName: anyViewResolution.viewName,
				viewResolution: anyViewResolution.viewResolution,
				fieldProperty: anyViewResolution.fieldProperty,
				usedAnyViewFallback: true,
				hasTemplatedBinding: false,
			};
		}
	}

	return {
		fieldName,
		viewName,
		usedAnyViewFallback: Boolean(allowAnyViewFallback),
		hasTemplatedBinding: false,
	};
}

export function findFieldInAnyView(
	fieldName: string | undefined,
	context: HtmlFieldMetadataContext
): FieldInViewResolution | undefined {
	return findFieldsInAnyView(fieldName, context)[0];
}

export function findFieldsInAnyView(
	fieldName: string | undefined,
	context: HtmlFieldMetadataContext
): FieldInViewResolution[] {
	if (!fieldName || hasTemplateExpression(fieldName)) {
		return [];
	}

	const matches: FieldInViewResolution[] = [];
	const seen = new Set<string>();
	for (const screenClass of context.screenClasses) {
		for (const [viewName, property] of screenClass.properties) {
			if (property.kind !== 'view' && property.kind !== 'viewCollection') {
				continue;
			}

			const viewResolution = resolveViewBinding(viewName, [screenClass], context.classInfoLookup);
			const viewClass =
				viewResolution?.viewClass ??
				resolveClassInfoForProperty(property, context.classInfoLookup);
			const fieldProperty = viewClass?.properties.get(fieldName);
			if (fieldProperty?.kind === 'field') {
				const key = `${fieldProperty.sourceFile.fileName}:${fieldProperty.node.getStart()}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				matches.push({
					viewName,
					viewResolution: viewResolution ?? { screenClass, property, viewClass },
					fieldProperty,
				});
			}
		}
	}

	return matches;
}

export function getFieldPropertiesFromViews(
	context: HtmlFieldMetadataContext
): Map<string, ClassPropertyInfo> {
	const fields = new Map<string, ClassPropertyInfo>();
	for (const screenClass of context.screenClasses) {
		for (const [viewName, property] of screenClass.properties) {
			if (property.kind !== 'view' && property.kind !== 'viewCollection') {
				continue;
			}

			const viewClass =
				resolveViewBinding(viewName, [screenClass], context.classInfoLookup)?.viewClass ??
				resolveClassInfoForProperty(property, context.classInfoLookup);
			if (!viewClass) {
				continue;
			}

			for (const [fieldName, fieldProperty] of viewClass.properties) {
				if (fieldProperty.kind === 'field' && !fields.has(fieldName)) {
					fields.set(fieldName, fieldProperty);
				}
			}
		}
	}
	return fields;
}

export function getIncludeFieldContext(options: {
	documentPath: string;
	hostTsFilePaths: string[];
	elementNode?: any;
	includeNode?: any;
	workspaceRoots?: string[];
	hostScreenClasses?: CollectedClassInfo[];
	cache?: HtmlIncludeTemplateFieldContextCache;
}): HtmlIncludeFieldContext | undefined {
	const includeNode = options.includeNode ?? findNearestIncludeNode(options.elementNode);
	const includeUrl = includeNode?.attribs?.url;
	if (typeof includeUrl !== 'string' || !includeUrl.length || hasTemplateExpression(includeUrl)) {
		return undefined;
	}

	const includePath = resolveIncludeFilePath(includeUrl, options.documentPath, options.workspaceRoots);
	if (!includePath) {
		return undefined;
	}

	const normalizedIncludePath = path.normalize(includePath);
	const cacheKey = [
		normalizedIncludePath,
		...options.hostTsFilePaths.map(filePath => path.normalize(filePath)),
	].join('|');
	const cache = options.cache;
	let templateContext: HtmlIncludeTemplateFieldContext | undefined;
	if (cache) {
		templateContext = cache.get(cacheKey);
	}
	if (cache && !cache.has(cacheKey)) {
		templateContext = loadIncludeTemplateFieldContext(normalizedIncludePath, options.hostTsFilePaths);
		cache.set(cacheKey, templateContext);
	}
	if (!cache) {
		templateContext = loadIncludeTemplateFieldContext(normalizedIncludePath, options.hostTsFilePaths);
	}

	if (!templateContext) {
		return undefined;
	}

	return {
		...templateContext,
		includeNode,
		includePath: normalizedIncludePath,
		parameterValues: getIncludeParameterValues(includeNode),
		hostScreenClasses: options.hostScreenClasses,
	};
}

export function loadIncludeTemplateFieldContext(
	includeHtmlPath: string,
	hostTsFilePaths: string[]
): HtmlIncludeTemplateFieldContext | undefined {
	const includeTsFilePaths = getRelatedTsFiles(includeHtmlPath);
	const combinedTsFilePaths = dedupeFilePaths([...hostTsFilePaths, ...includeTsFilePaths]);
	const classInfos = combinedTsFilePaths.length
		? loadClassInfosFromFiles(combinedTsFilePaths)
		: [];
	const metadataContext = createHtmlFieldMetadataContext(classInfos, includeTsFilePaths);
	const templateDocument = loadHtmlDocument(includeHtmlPath);

	if (!metadataContext.screenClasses.length && !templateDocument) {
		return undefined;
	}

	return {
		...metadataContext,
		templateDocument,
		viewResolutionCache: new Map(),
	};
}

export function findNearestIncludeNode(node: any): any | undefined {
	let current = node;
	while (current) {
		if (current.type === 'tag' && current.name === 'qp-include') {
			return current;
		}

		current = current.parent ?? current.parentNode;
	}
	return undefined;
}

export function getIncludeParameterValues(includeNode: any): Map<string, string> {
	const values = new Map<string, string>();
	const attributes = includeNode?.attribs ?? {};
	for (const [attributeName, attributeValue] of Object.entries(attributes)) {
		if (typeof attributeValue === 'string') {
			values.set(attributeName, attributeValue);
		}
	}
	return values;
}

export function getViewNameFromCustomizationSelectors(
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

export function getParentOrSelectorViewName(
	node: any,
	selectorDocument: BaseScreenDocument | undefined
): string | undefined {
	return findParentViewName(node) ?? getViewNameFromCustomizationSelectors(node, selectorDocument);
}

export function forEachCustomizationSelector(
	node: any,
	callback: (attributeName: string, rawValue: string, normalizedValue: string) => void
) {
	if (!node?.attribs) {
		return;
	}

	for (const [attributeName, attributeValue] of Object.entries(node.attribs)) {
		if (!isCustomizationSelectorAttribute(attributeName) || typeof attributeValue !== 'string') {
			continue;
		}

		const normalizedValue = attributeValue.trim();
		if (!normalizedValue.length) {
			continue;
		}

		callback(attributeName, attributeValue, normalizedValue);
	}
}

export function hasTemplateCustomizationSelector(node: any): boolean {
	let hasTemplateSelector = false;
	forEachCustomizationSelector(node, (_attributeName, _rawValue, normalizedValue) => {
		if (hasTemplateExpression(normalizedValue)) {
			hasTemplateSelector = true;
		}
	});
	return hasTemplateSelector;
}

export function resolveTemplateValue(
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

export function hasTemplateExpression(value: string | undefined): boolean {
	return typeof value === 'string' && /{{\s*[^}]+\s*}}/.test(value);
}

export function dedupeFilePaths(filePaths: string[]): string[] {
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
