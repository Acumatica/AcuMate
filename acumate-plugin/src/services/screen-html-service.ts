import fs from "fs";
import path from "path";
import ts from "typescript";
import { DomHandler, Parser } from "htmlparser2";
import { selectAll } from "css-select";
import {
	getScreenCandidateDirectories,
	isLocalOrSrcModuleSpecifier,
	resolveModulePath,
} from "../utils";

export interface BaseScreenDocument {
	filePath: string;
	content: string;
	dom: any[];
	sourceDocuments?: readonly BaseScreenDocument[];
	nodeDocumentMap?: WeakMap<object, BaseScreenDocument>;
}

export interface SelectorQueryMatch {
	node: any;
	document: BaseScreenDocument;
}

export interface SelectorQueryResult {
	nodes: any[];
	matches: SelectorQueryMatch[];
	error?: string;
}

const customizationSelectorAttributes = ["modify", "before", "after", "append", "prepend", "prepand", "move", "remove"] as const;
const customizationSelectorAttributeSet = new Set<string>(
	customizationSelectorAttributes.map(attribute => attribute.toLowerCase())
);

export function isCustomizationSelectorAttribute(attributeName: string | undefined): boolean {
	if (!attributeName) {
		return false;
	}
	return customizationSelectorAttributeSet.has(attributeName.toLowerCase());
}

export function getCustomizationSelectorAttributes(): readonly string[] {
	return customizationSelectorAttributes;
}

type CachedDocument = BaseScreenDocument & { mtime?: number };

const cache = new Map<string, CachedDocument>();

export function getBaseScreenDocument(htmlFilePath: string): BaseScreenDocument | undefined {
	const baseHtmlPath = resolveBaseScreenHtmlPath(htmlFilePath);
	if (!baseHtmlPath) {
		return undefined;
	}

	const baseDocument = loadHtmlDocument(baseHtmlPath);
	if (!baseDocument) {
		return undefined;
	}

	const dependencyDocuments = getExtensionDependencyHtmlDocuments(htmlFilePath);
	if (!dependencyDocuments.length) {
		return baseDocument;
	}

	return createCompositeScreenDocument([baseDocument, ...dependencyDocuments]);
}

export function loadHtmlDocument(htmlFilePath: string): BaseScreenDocument | undefined {
	const normalizedPath = path.normalize(htmlFilePath);
	const mtime = tryGetMtime(normalizedPath);
	const cached = cache.get(normalizedPath);
	if (cached && cached.mtime === mtime) {
		return cached;
	}

	try {
		const content = fs.readFileSync(normalizedPath, "utf-8");
		const dom = parseHtml(content);
		const entry: CachedDocument = { filePath: normalizedPath, content, dom, mtime };
		cache.set(normalizedPath, entry);
		return entry;
	}
	catch {
		return undefined;
	}
}

export function resolveBaseScreenHtmlPath(htmlFilePath: string): string | undefined {
	const normalized = path.normalize(htmlFilePath);
	const forwardPath = normalized.split(path.sep).join("/");
	const lowerForward = forwardPath.toLowerCase();
	const marker = "/extensions/";
	const markerIndex = lowerForward.lastIndexOf(marker);
	if (markerIndex === -1) {
		return undefined;
	}

	const screenDirForward = forwardPath.substring(0, markerIndex);
	const screenName = path.basename(screenDirForward);
	if (!screenName) {
		return undefined;
	}

	for (const candidateDir of getScreenCandidateDirectories(screenDirForward)) {
		const candidates = [
			path.join(candidateDir, `${screenName}.html`),
			path.join(candidateDir, `${screenName}.htm`),
		];

		for (const candidate of candidates) {
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}
	}

	return undefined;
}

function cloneDomNodes(
	nodes: any[] | undefined,
	parent: any,
	sourceMap: WeakMap<object, BaseScreenDocument> | undefined,
	defaultDocument: BaseScreenDocument,
	targetMap: WeakMap<object, BaseScreenDocument>
): any[] {
	if (!nodes?.length) {
		return [];
	}

	const clonedList: any[] = [];
	for (const orig of nodes) {
		if (!orig || typeof orig !== "object") {
			continue;
		}
		const clone = Object.assign(Object.create(Object.getPrototypeOf(orig)), orig);
		clone.attribs = orig.attribs ? { ...orig.attribs } : orig.attribs;
		clone.parent = parent;
		clone.parentNode = parent;
		clone.prev = null;
		clone.next = null;
		const mappedDoc = sourceMap?.get(orig) ?? defaultDocument;
		targetMap.set(clone, mappedDoc);
		clone.children = orig.children
			? cloneDomNodes(orig.children, clone, sourceMap, mappedDoc, targetMap)
			: orig.children;
		clonedList.push(clone);
	}

	rewireSiblings(clonedList);
	return clonedList;
}

function rewireSiblings(nodes: any[]) {
	for (let i = 0; i < nodes.length; i++) {
		nodes[i].prev = i > 0 ? nodes[i - 1] : null;
		nodes[i].previousSibling = nodes[i].prev;
		nodes[i].next = i + 1 < nodes.length ? nodes[i + 1] : null;
		nodes[i].nextSibling = nodes[i].next;
	}
}

export function cloneScreenDocumentForSession(document: BaseScreenDocument): BaseScreenDocument {
	const targetMap = new WeakMap<object, BaseScreenDocument>();
	const clonedDom = cloneDomNodes(document.dom, null, document.nodeDocumentMap, document, targetMap);
	return {
		filePath: document.filePath,
		content: document.content,
		dom: clonedDom,
		sourceDocuments: document.sourceDocuments,
		nodeDocumentMap: targetMap,
	};
}

export function applyExtensionNodePlacement(
	targetDocument: BaseScreenDocument,
	sourceNode: any,
	sourceDocument?: BaseScreenDocument
): void {
	if (!targetDocument?.dom || !sourceNode?.attribs || sourceNode.type !== "tag") {
		return;
	}

	const placementKinds = ["before", "after", "append", "prepend", "prepand"] as const;
	for (const kind of placementKinds) {
		const rawSelector = sourceNode.attribs[kind];
		if (typeof rawSelector !== "string" || !rawSelector.trim() || /{{\s*[^}]+\s*}}/.test(rawSelector)) {
			continue;
		}

		const { nodes, error } = queryBaseScreenElements(targetDocument, rawSelector.trim());
		if (error || !nodes.length) {
			continue;
		}

		const nodeMap = targetDocument.nodeDocumentMap ?? new WeakMap<object, BaseScreenDocument>();
		targetDocument.nodeDocumentMap = nodeMap;
		const effectiveSourceDoc = sourceDocument ?? targetDocument;

		for (const anchor of nodes) {
			if (kind === "append" || kind === "prepend" || kind === "prepand") {
				const cloned = cloneDomNodes([sourceNode], anchor, undefined, effectiveSourceDoc, nodeMap)[0];
				if (!cloned) {
					continue;
				}
				anchor.children = Array.isArray(anchor.children) ? anchor.children : [];
				if (kind === "append") {
					anchor.children.push(cloned);
				} else {
					anchor.children.unshift(cloned);
				}
				rewireSiblings(anchor.children);
			} else {
				const parentContainer = anchor.parent ?? anchor.parentNode;
				const siblings: any[] = parentContainer?.children ?? targetDocument.dom;
				const anchorIndex = siblings.indexOf(anchor);
				if (anchorIndex === -1) {
					continue;
				}
				const cloned = cloneDomNodes([sourceNode], parentContainer ?? null, undefined, effectiveSourceDoc, nodeMap)[0];
				if (!cloned) {
					continue;
				}
				const insertIndex = kind === "before" ? anchorIndex : anchorIndex + 1;
				siblings.splice(insertIndex, 0, cloned);
				rewireSiblings(siblings);
			}
		}
		break;
	}
}

export function getBaseScreenDocumentWithPriorPlacements(
	htmlFilePath: string,
	currentContent?: string,
	maxStartIndex?: number
): BaseScreenDocument | undefined {
	const baseDoc = getBaseScreenDocument(htmlFilePath);
	if (!baseDoc || !currentContent) {
		return baseDoc;
	}

	const sessionDoc = cloneScreenDocumentForSession(baseDoc);
	const currentDom = parseHtml(currentContent);
	const currentSourceDoc: BaseScreenDocument = {
		filePath: path.normalize(htmlFilePath),
		content: currentContent,
		dom: currentDom,
	};

	const walk = (nodes: any[] | undefined) => {
		if (!nodes) {
			return;
		}
		for (const node of nodes) {
			if (maxStartIndex !== undefined && typeof node?.startIndex === "number" && node.startIndex >= maxStartIndex) {
				return;
			}
			if (node?.type === "tag") {
				applyExtensionNodePlacement(sessionDoc, node, currentSourceDoc);
			}
			walk(node?.children);
		}
	};

	walk(currentDom);
	return sessionDoc;
}

export function queryBaseScreenElements(document: BaseScreenDocument, selector: string): SelectorQueryResult {
	const normalized = selector?.trim();
	if (!normalized) {
		return { nodes: [], matches: [] };
	}

	try {
		const nodes = selectAll(normalized, document.dom);
		const matches = nodes.map(node => ({
			node,
			document: getDocumentForNode(document, node),
		}));
		return { nodes, matches };
	}
	catch (error) {
		return {
			nodes: [],
			matches: [],
			error: error instanceof Error ? error.message : "Unknown selector error",
		};
	}
}

export function createParameterizedHtmlDocument(
	document: BaseScreenDocument,
	parameterValues: Map<string, string>
): BaseScreenDocument {
	const dom = parseHtml(document.content);
	applyTemplateParametersToNodes(dom, parameterValues);

	return {
		filePath: document.filePath,
		content: document.content,
		dom,
	};
}

export function getDocumentForNode(
	document: BaseScreenDocument,
	node: any
): BaseScreenDocument {
	if (node && typeof node === "object") {
		const sourceDocument = document.nodeDocumentMap?.get(node);
		if (sourceDocument) {
			return sourceDocument;
		}
	}

	return document;
}

export function getScreenDocumentDisplayName(document: BaseScreenDocument): string {
	const sourceDocuments = document.sourceDocuments;
	if (!sourceDocuments || sourceDocuments.length <= 1) {
		return path.basename(document.filePath);
	}

	return `${path.basename(sourceDocuments[0].filePath)} and its extension dependencies`;
}

function parseHtml(content: string): any[] {
	let domTree: any[] = [];
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

function applyTemplateParametersToNodes(
	nodes: any[] | undefined,
	parameterValues: Map<string, string>
) {
	if (!nodes) {
		return;
	}

	for (const node of nodes) {
		if (node?.attribs) {
			for (const [attributeName, attributeValue] of Object.entries(node.attribs)) {
				if (typeof attributeValue === "string") {
					node.attribs[attributeName] = applyTemplateParameters(attributeValue, parameterValues);
				}
			}
		}

		applyTemplateParametersToNodes(node?.children, parameterValues);
	}
}

function applyTemplateParameters(value: string, parameterValues: Map<string, string>): string {
	return value.replace(/{{\s*([^#\/^}\s]+)\s*}}/g, (match, parameterName: string) => (
		parameterValues.has(parameterName) ? parameterValues.get(parameterName) ?? "" : match
	));
}

function tryGetMtime(targetPath: string): number | undefined {
	try {
		return fs.statSync(targetPath).mtimeMs;
	}
	catch {
		return undefined;
	}
}

function createCompositeScreenDocument(documents: BaseScreenDocument[]): BaseScreenDocument {
	const nodeDocumentMap = new WeakMap<object, BaseScreenDocument>();
	for (const document of documents) {
		mapNodeDocuments(document.dom, document, nodeDocumentMap);
	}

	return {
		filePath: documents[0].filePath,
		content: documents[0].content,
		dom: documents.flatMap(document => document.dom),
		sourceDocuments: documents,
		nodeDocumentMap,
	};
}

function mapNodeDocuments(
	nodes: any[] | undefined,
	document: BaseScreenDocument,
	nodeDocumentMap: WeakMap<object, BaseScreenDocument>
) {
	if (!nodes) {
		return;
	}

	for (const node of nodes) {
		if (node && typeof node === "object") {
			nodeDocumentMap.set(node, document);
			mapNodeDocuments(node.children, document, nodeDocumentMap);
		}
	}
}

function getExtensionDependencyHtmlDocuments(htmlFilePath: string): BaseScreenDocument[] {
	const extensionDirectory = getExtensionDirectory(htmlFilePath);
	if (!extensionDirectory) {
		return [];
	}

	const tsFilePath = getCorrespondingTsFilePath(htmlFilePath);
	if (!tsFilePath) {
		return [];
	}

	const documents: BaseScreenDocument[] = [];
	const emittedHtmlPaths = new Set<string>();
	const activeTsPaths = new Set<string>();
	const rootInterfaceName = getExtensionNameFromFilePath(htmlFilePath);

	collectDependencyHtmlDocuments(
		tsFilePath,
		rootInterfaceName,
		extensionDirectory,
		activeTsPaths,
		emittedHtmlPaths,
		documents
	);

	return documents;
}

function collectDependencyHtmlDocuments(
	tsFilePath: string,
	interfaceName: string,
	extensionDirectory: string,
	activeTsPaths: Set<string>,
	emittedHtmlPaths: Set<string>,
	documents: BaseScreenDocument[]
) {
	const normalizedTsPath = path.normalize(tsFilePath);
	if (activeTsPaths.has(normalizedTsPath)) {
		return;
	}

	activeTsPaths.add(normalizedTsPath);

	for (const dependency of getInterfaceDependencies(normalizedTsPath, interfaceName)) {
		const dependencyTsPath = resolveDependencyTsPath(normalizedTsPath, dependency);
		const dependencyHtmlPath = resolveDependencyHtmlPath(
			normalizedTsPath,
			dependency,
			extensionDirectory,
			dependencyTsPath
		);
		const dependencyInterfaceName = dependencyTsPath
			? getExtensionNameFromFilePath(dependencyTsPath)
			: dependency.typeName;

		if (dependencyTsPath) {
			collectDependencyHtmlDocuments(
				dependencyTsPath,
				dependencyInterfaceName,
				extensionDirectory,
				activeTsPaths,
				emittedHtmlPaths,
				documents
			);
		}

		if (!dependencyHtmlPath || !isHtmlPathInDirectory(dependencyHtmlPath, extensionDirectory)) {
			continue;
		}

		const normalizedHtmlPath = path.normalize(dependencyHtmlPath);
		if (emittedHtmlPaths.has(normalizedHtmlPath)) {
			continue;
		}

		const dependencyDocument = loadHtmlDocument(normalizedHtmlPath);
		if (!dependencyDocument) {
			continue;
		}

		emittedHtmlPaths.add(normalizedHtmlPath);
		documents.push(dependencyDocument);
	}

	activeTsPaths.delete(normalizedTsPath);
}

interface InterfaceDependency {
	typeName: string;
	moduleSpecifier?: string;
}

function getInterfaceDependencies(
	tsFilePath: string,
	interfaceName: string
): InterfaceDependency[] {
	const sourceFile = tryReadTsSourceFile(tsFilePath);
	if (!sourceFile) {
		return [];
	}

	const importMap = getImportMap(sourceFile);
	const dependencies: InterfaceDependency[] = [];

	const visit = (node: ts.Node) => {
		if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
			for (const clause of node.heritageClauses ?? []) {
				if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
					continue;
				}

				for (const heritageType of clause.types) {
					const typeName = getHeritageIdentifierName(heritageType);
					if (!typeName) {
						continue;
					}

					dependencies.push({
						typeName,
						moduleSpecifier: importMap.get(typeName),
					});
				}
			}
			return;
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return dependencies;
}

function getImportMap(sourceFile: ts.SourceFile): Map<string, string> {
	const imports = new Map<string, string>();

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}

		const moduleSpecifier = statement.moduleSpecifier.text;
		const importClause = statement.importClause;

		if (importClause.name) {
			imports.set(importClause.name.text, moduleSpecifier);
		}

		const namedBindings = importClause.namedBindings;
		if (namedBindings && ts.isNamedImports(namedBindings)) {
			for (const element of namedBindings.elements) {
				imports.set(element.name.text, moduleSpecifier);
			}
		}
	}

	return imports;
}

function getHeritageIdentifierName(heritageType: ts.ExpressionWithTypeArguments): string | undefined {
	const expression = heritageType.expression;
	return ts.isIdentifier(expression) ? expression.text : undefined;
}

function resolveDependencyTsPath(
	sourceTsPath: string,
	dependency: InterfaceDependency
): string | undefined {
	if (isLocalOrSrcModuleSpecifier(dependency.moduleSpecifier) && dependency.moduleSpecifier) {
		const resolved = resolveModulePath(sourceTsPath, dependency.moduleSpecifier);
		if (resolved) {
			return resolved;
		}
		if (dependency.moduleSpecifier.startsWith(".")) {
			return resolveModuleTsPath(sourceTsPath, dependency.moduleSpecifier);
		}
	}

	return findFileWithExtensions(path.join(path.dirname(sourceTsPath), dependency.typeName), [".ts", ".tsx"]);
}

function resolveDependencyHtmlPath(
	sourceTsPath: string,
	dependency: InterfaceDependency,
	extensionDirectory: string,
	dependencyTsPath: string | undefined
): string | undefined {
	if (dependencyTsPath) {
		const fromTsPath = findHtmlNextToTsFile(dependencyTsPath);
		if (fromTsPath) {
			return fromTsPath;
		}
	}

	if (dependency.moduleSpecifier?.startsWith(".")) {
		const fromModulePath = findFileWithExtensions(
			path.resolve(path.dirname(sourceTsPath), dependency.moduleSpecifier),
			[".html", ".htm"]
		);
		if (fromModulePath) {
			return fromModulePath;
		}
	}

	return findFileWithExtensions(path.join(extensionDirectory, dependency.typeName), [".html", ".htm"]);
}

function resolveModuleTsPath(sourceTsPath: string, moduleSpecifier: string): string | undefined {
	const basePath = path.resolve(path.dirname(sourceTsPath), moduleSpecifier);
	return findFileWithExtensions(basePath, [".ts", ".tsx", ".d.ts"]);
}

function findHtmlNextToTsFile(tsFilePath: string): string | undefined {
	const parsedPath = path.parse(tsFilePath);
	return findFileWithExtensions(path.join(parsedPath.dir, parsedPath.name), [".html", ".htm"]);
}

function getCorrespondingTsFilePath(htmlFilePath: string): string | undefined {
	const normalized = path.normalize(htmlFilePath);
	const directCandidate = normalized.replace(/\.html?$/i, ".ts");
	if (fs.existsSync(directCandidate)) {
		return directCandidate;
	}

	const withoutHtml = normalized.replace(/\.html?$/i, "");
	const trimmedBase = withoutHtml.replace(/\.+$/, "");
	if (trimmedBase && trimmedBase !== withoutHtml) {
		const trimmedCandidate = `${trimmedBase}.ts`;
		if (fs.existsSync(trimmedCandidate)) {
			return trimmedCandidate;
		}
	}

	return undefined;
}

function findFileWithExtensions(basePath: string, extensions: string[]): string | undefined {
	for (const extension of extensions) {
		const candidate = `${basePath}${extension}`;
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

function getExtensionDirectory(htmlFilePath: string): string | undefined {
	const normalized = path.normalize(htmlFilePath);
	const lower = normalized.toLowerCase();
	const marker = `${path.sep}extensions${path.sep}`.toLowerCase();
	const markerIndex = lower.lastIndexOf(marker);
	if (markerIndex === -1) {
		return undefined;
	}

	return normalized.substring(0, markerIndex + marker.length - 1);
}

function getExtensionNameFromFilePath(filePath: string): string {
	const parsedPath = path.parse(filePath);
	return parsedPath.name.replace(/\.+$/, "");
}

function isHtmlPathInDirectory(htmlFilePath: string, directoryPath: string): boolean {
	const normalizedHtmlDirectory = path.normalize(path.dirname(htmlFilePath)).toLowerCase();
	const normalizedDirectory = path.normalize(directoryPath).toLowerCase();
	if (normalizedHtmlDirectory === normalizedDirectory) {
		return true;
	}

	const screenDirForward = path.dirname(directoryPath).split(path.sep).join("/");
	for (const candidateScreenDir of getScreenCandidateDirectories(screenDirForward)) {
		const candidateExtDir = path.normalize(path.join(candidateScreenDir, "extensions")).toLowerCase();
		if (normalizedHtmlDirectory === candidateExtDir) {
			return true;
		}
	}

	return false;
}

function tryReadTsSourceFile(tsFilePath: string): ts.SourceFile | undefined {
	const normalized = path.normalize(tsFilePath);
	try {
		const content = fs.readFileSync(normalized, "utf-8");
		return ts.createSourceFile(normalized, content, ts.ScriptTarget.Latest, true);
	}
	catch {
		return undefined;
	}
}
