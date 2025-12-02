import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

const CLIENT_CONTROLS_FOLDER_NAMES = ['client-controls', '@acumatica/client-controls'];

export interface ControlConfigProperty {
	name: string;
	type?: string;
	optional: boolean;
	description?: string;
}

export interface ControlConfigDefinition {
	typeName: string;
	description?: string;
	properties: ControlConfigProperty[];
}

export interface ClientControlConfigInfo {
	typeName: string;
	displayName: string;
	definition?: ControlConfigDefinition;
}

export interface ClientControlMetadata {
	tagName: string;
	className: string;
	description?: string;
	sourcePath: string;
	config?: ClientControlConfigInfo;
}

export interface ClientControlsLookupOptions {
	startingPath?: string;
	workspaceRoots?: string[];
}

type MetadataCacheEntry = {
	mtime?: number;
	controls: ClientControlMetadata[];
};

const metadataCache = new Map<string, MetadataCacheEntry>();

export function getClientControlsMetadata(options: ClientControlsLookupOptions = {}): ClientControlMetadata[] {
	const packageRoot = findClientControlsPackage(options);
	if (!packageRoot) {
		return [];
	}

	const cacheKey = path.resolve(packageRoot);
	const packageJsonPath = path.join(packageRoot, 'package.json');
	const packageTimestamp = tryGetMtime(packageJsonPath) ?? tryGetMtime(packageRoot);
	const cached = metadataCache.get(cacheKey);
	if (cached && packageTimestamp !== undefined && cached.mtime === packageTimestamp) {
		return cached.controls;
	}

	const controls = collectClientControls(packageRoot);
	metadataCache.set(cacheKey, { mtime: packageTimestamp, controls });
	return controls;
}

export function getClientControlsPackageRoot(options: ClientControlsLookupOptions = {}): string | undefined {
	return findClientControlsPackage(options);
}

function findClientControlsPackage(options: ClientControlsLookupOptions): string | undefined {
	const searchRoots: string[] = [];
	if (options.startingPath) {
		searchRoots.push(options.startingPath);
	}
	if (options.workspaceRoots?.length) {
		searchRoots.push(...options.workspaceRoots);
	}

	for (const root of searchRoots) {
		const resolved = walkUpForPackage(root);
		if (resolved) {
			return resolved;
		}
	}

	return undefined;
}

function walkUpForPackage(startPath: string): string | undefined {
	let current = normalizeToDirectory(startPath);
	const visited = new Set<string>();

	while (current && !visited.has(current)) {
		visited.add(current);

		for (const packageName of CLIENT_CONTROLS_FOLDER_NAMES) {
			const nodeModulesCandidate = path.join(current, 'node_modules', packageName);
			if (directoryExists(nodeModulesCandidate)) {
				return nodeModulesCandidate;
			}

			const siblingCandidate = path.join(current, packageName);
			if (directoryExists(siblingCandidate)) {
				return siblingCandidate;
			}
		}

		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}

	return undefined;
}

function normalizeToDirectory(targetPath: string): string | undefined {
	const resolved = path.resolve(targetPath);
	try {
		const stats = fs.statSync(resolved);
		if (stats.isDirectory()) {
			return resolved;
		}
		return path.dirname(resolved);
	} catch {
		return path.dirname(resolved);
	}
}

function directoryExists(targetPath: string): boolean {
	try {
		return fs.statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
}

function tryGetMtime(targetPath: string): number | undefined {
	try {
		return fs.statSync(targetPath).mtimeMs;
	} catch {
		return undefined;
	}
}

function collectClientControls(packageRoot: string): ClientControlMetadata[] {
	const declarationFiles = enumerateDeclarationFiles(packageRoot);
	if (!declarationFiles.length) {
		return [];
	}

	const sourceFiles: ts.SourceFile[] = [];
	const interfaceMap = new Map<string, ControlConfigDefinition>();

	for (const filePath of declarationFiles) {
		const sourceFile = parseSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}
		sourceFiles.push(sourceFile);
		collectInterfaceDeclarations(sourceFile, interfaceMap);
	}

	const controls = new Map<string, ClientControlMetadata>();
	for (const sourceFile of sourceFiles) {
		collectControlDeclarations(sourceFile, packageRoot, interfaceMap, controls);
	}

	return [...controls.values()].sort((a, b) => a.tagName.localeCompare(b.tagName));
}

function enumerateDeclarationFiles(packageRoot: string): string[] {
	const searchRoots = new Set<string>([packageRoot]);
	for (const subFolder of ['controls', 'descriptors', 'dist', 'types']) {
		const candidate = path.join(packageRoot, subFolder);
		if (directoryExists(candidate)) {
			searchRoots.add(candidate);
		}
	}

	const results = new Set<string>();
	for (const root of searchRoots) {
		walkDeclarations(root, results);
	}

	return [...results];
}

function walkDeclarations(currentDir: string, collector: Set<string>) {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(currentDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (entry.name.startsWith('.')) {
			continue;
		}

		const fullPath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') {
				continue;
			}
			walkDeclarations(fullPath, collector);
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.d.ts')) {
			collector.add(fullPath);
		}
	}
}

function parseSourceFile(filePath: string): ts.SourceFile | undefined {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
	} catch {
		return undefined;
	}
}

function collectInterfaceDeclarations(sourceFile: ts.SourceFile, interfaceMap: Map<string, ControlConfigDefinition>) {
	const visit = (node: ts.Node) => {
		if (ts.isInterfaceDeclaration(node)) {
			const name = node.name.text;
			const properties: ControlConfigProperty[] = [];
			for (const member of node.members) {
				if (!ts.isPropertySignature(member) || !member.name) {
					continue;
				}
				const propName = getPropertyName(member.name);
				if (!propName) {
					continue;
				}
				properties.push({
					name: propName,
					optional: Boolean(member.questionToken),
					type: member.type ? member.type.getText(sourceFile).trim() : undefined,
					description: extractJsDoc(node.getSourceFile(), member),
				});
			}
			interfaceMap.set(name, {
				typeName: name,
				description: extractJsDoc(sourceFile, node),
				properties,
			});
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
}

function collectControlDeclarations(
	sourceFile: ts.SourceFile,
	packageRoot: string,
	interfaceMap: Map<string, ControlConfigDefinition>,
	controls: Map<string, ClientControlMetadata>
) {
	const visit = (node: ts.Node) => {
		if (ts.isClassDeclaration(node) && node.name && isExported(node)) {
			const tagName = getCustomElementTag(node);
			if (tagName && tagName.startsWith('qp-') && !controls.has(tagName)) {
				const configInfo = getConfigInfo(node, sourceFile, interfaceMap);
				controls.set(tagName, {
					tagName,
					className: node.name.text,
					description: extractJsDoc(sourceFile, node),
					sourcePath: path.relative(packageRoot, sourceFile.fileName).replace(/\\/g, '/'),
					config: configInfo ?? undefined,
				});
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
}

function isExported(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false;
	}
	const modifiers = ts.getModifiers(node);
	return Boolean(modifiers?.some((mod: ts.Modifier) => mod.kind === ts.SyntaxKind.ExportKeyword));
}

function getCustomElementTag(node: ts.ClassDeclaration): string | undefined {
	if (!ts.canHaveDecorators(node)) {
		return undefined;
	}
	const decorators = ts.getDecorators(node);
	if (!decorators?.length) {
		return undefined;
	}

	for (const decorator of decorators) {
		if (!ts.isCallExpression(decorator.expression)) {
			continue;
		}

		const expression = decorator.expression.expression;
		if (!ts.isIdentifier(expression) || expression.text !== 'customElement') {
			continue;
		}

		const firstArg = decorator.expression.arguments[0];
		if (!firstArg) {
			continue;
		}

		if (ts.isStringLiteralLike(firstArg)) {
			return firstArg.text;
		}

		if (ts.isObjectLiteralExpression(firstArg)) {
			for (const prop of firstArg.properties) {
				if (!ts.isPropertyAssignment(prop) || !prop.name) {
					continue;
				}

				const propName = getPropertyName(prop.name);
				if (propName === 'name' && ts.isStringLiteralLike(prop.initializer)) {
					return prop.initializer.text;
				}
			}
		}
	}

	return undefined;
}

function getConfigInfo(
	node: ts.ClassDeclaration,
	sourceFile: ts.SourceFile,
	interfaceMap: Map<string, ControlConfigDefinition>
): ClientControlConfigInfo | undefined {
	for (const member of node.members) {
		if (!ts.isPropertyDeclaration(member) || !member.name || !member.type) {
			continue;
		}

		if (!ts.isIdentifier(member.name) || member.name.text !== 'config') {
			continue;
		}

		const displayName = member.type.getText(sourceFile).trim();
		const simpleName = extractSimpleTypeName(member.type);
		const definition = simpleName ? interfaceMap.get(simpleName) : undefined;
		return {
			typeName: simpleName ?? displayName,
			displayName,
			definition,
		};
	}

	return undefined;
}

function extractSimpleTypeName(typeNode: ts.TypeNode): string | undefined {
	if (ts.isTypeReferenceNode(typeNode)) {
		return extractSimpleName(typeNode.typeName);
	}

	if (ts.isImportTypeNode(typeNode) && typeNode.qualifier) {
		return extractSimpleName(typeNode.qualifier);
	}

	return undefined;
}

function extractSimpleName(typeName: ts.EntityName | ts.Identifier): string | undefined {
	if (ts.isIdentifier(typeName)) {
		return typeName.text;
	}

	if (ts.isQualifiedName(typeName)) {
		return typeName.right.text;
	}

	return undefined;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
		return name.text;
	}
	return undefined;
}

function extractJsDoc(sourceFile: ts.SourceFile, node: ts.Node): string | undefined {
	const text = sourceFile.getFullText();
	const start = node.getFullStart();
	const ranges = ts.getLeadingCommentRanges(text, start) ?? [];

	for (const range of ranges.reverse()) {
		const comment = text.substring(range.pos, range.end);
		if (comment.startsWith('/**')) {
			return formatJsDoc(comment);
		}
	}

	return undefined;
}

function formatJsDoc(comment: string): string {
	const inner = comment
		.replace(/^\/\*\*/, '')
		.replace(/\*\/$/, '');
	const lines = inner.split(/\r?\n/).map(line => line.replace(/^\s*\* ?/, '').trimEnd());
	return lines.join('\n').trim();
}
