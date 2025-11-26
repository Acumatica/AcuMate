import vscode from 'vscode';
import * as path from 'path';
const jsonic = require('jsonic');
const { exec } = require('child_process');
const fs = require(`fs`);

export const screensPath = 'screen\\src\\screens\\';

import ts from 'typescript';

export async function createFile(path: string, fileName: string, content: string): Promise<vscode.Uri | undefined> {
	const workspaceFoldersList = vscode.workspace.workspaceFolders;
	const openedFilePath = getOpenedFilePath();
	if (workspaceFoldersList || openedFilePath) {
		const workspaceFolder = workspaceFoldersList ? workspaceFoldersList[0] : { uri: vscode.Uri.file(getFrontendSourcesPath()!) };
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, path, fileName);

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
		return fileUri;
	}
}

export async function checkFileExists(uri: vscode.Uri): Promise<boolean> {
	try {
	  // uri is a vscode.Uri object pointing to the file path
	  await vscode.workspace.fs.stat(uri);
	  console.log("File exists!");
	  return true;
	} catch (error) {
	  console.log("File does not exist.");
	  return false;
	}
}

export function tryGetGraphType(text: string): string | undefined {
	try {
		const graphInfoMatch = text.match(new RegExp(`\\@graphInfo\(([^)]*)\)`, "gms"));
		if (!graphInfoMatch || graphInfoMatch.length !== 1) {
			return undefined;;
		}
		return jsonic(graphInfoMatch[0].substring(11)).graphType;
	}
	catch {
		return undefined;
	}
	
}

export async function runNpmCommand(command: string, workingDirectory: string) {
  return new Promise((resolve, reject) => {
    exec(`npx ${command}`, { cwd: workingDirectory }, (error: any, stdout: unknown, stderr: any) => {
      if (error) {
        return reject(error);
      }
      if (stderr) {
        
      }
      
      resolve(stdout);
    });
  });
}

type SourceFileCacheEntry = {
	sourceFile: ts.SourceFile;
	mtimeMs: number;
};

const sourceFileCache = new Map<string, SourceFileCacheEntry>();

export type ClassPropertyKind = 'action' | 'field' | 'view' | 'viewCollection' | 'unknown';

export interface ClassPropertyInfo {
	name: string;
	kind: ClassPropertyKind;
	typeName?: string;
	viewClassName?: string;
}

export interface ClassInheritanceInfo {
	chain: ts.Identifier[];
	properties: Map<string, ClassPropertyInfo>;
}

function collectDeclaredProperties(node: ts.ClassDeclaration, propertyMap: Map<string, ClassPropertyInfo>) {
	for (const member of node.members) {
		if (!ts.isPropertyDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) {
			continue;
		}

		const propertyInfo = analyzePropertyDeclaration(member);
		if (propertyInfo) {
			propertyMap.set(propertyInfo.name, propertyInfo);
		}
	}
}

function analyzePropertyDeclaration(member: ts.PropertyDeclaration): ClassPropertyInfo | undefined {
	if (!member.name || !ts.isIdentifier(member.name)) {
		return undefined;
	}

	const propertyInfo: ClassPropertyInfo = {
		name: member.name.text,
		kind: 'unknown'
	};

	const typeName = getTypeNameFromNode(member.type);
	if (typeName) {
		propertyInfo.typeName = typeName;
		assignKindFromType(typeName, propertyInfo);
		if (!propertyInfo.viewClassName) {
			const viewTypeArg = getFirstTypeArgumentName(member.type);
			if (viewTypeArg) {
				propertyInfo.viewClassName = viewTypeArg;
			}
		}
	}

	if (member.initializer && ts.isCallExpression(member.initializer) && ts.isIdentifier(member.initializer.expression)) {
		const callName = member.initializer.expression.text;
		const viewTarget = getViewReferenceFromInitializer(member.initializer);
		if (viewTarget && (callName === 'createSingle' || callName === 'createCollection')) {
			propertyInfo.viewClassName = viewTarget;
			propertyInfo.kind = callName === 'createSingle' ? 'view' : 'viewCollection';
		}
	}

	return propertyInfo;
}

function getTypeNameFromNode(typeNode: ts.TypeNode | undefined): string | undefined {
	if (!typeNode) {
		return undefined;
	}

	if (ts.isTypeReferenceNode(typeNode)) {
		const typeName = typeNode.typeName;
		if (ts.isIdentifier(typeName)) {
			return typeName.text;
		}
	}

	return undefined;
}

function getFirstTypeArgumentName(typeNode: ts.TypeNode | undefined): string | undefined {
	if (!typeNode || !ts.isTypeReferenceNode(typeNode) || !typeNode.typeArguments?.length) {
		return undefined;
	}

	const firstArg = typeNode.typeArguments[0];
	if (ts.isTypeReferenceNode(firstArg) && ts.isIdentifier(firstArg.typeName)) {
		return firstArg.typeName.text;
	}

	return undefined;
}

function assignKindFromType(typeName: string, propertyInfo: ClassPropertyInfo) {
	switch (typeName) {
		case 'PXActionState':
			propertyInfo.kind = 'action';
			break;
		case 'PXFieldState':
			propertyInfo.kind = 'field';
			break;
		case 'PXView':
			propertyInfo.kind = 'view';
			break;
		case 'PXViewCollection':
			propertyInfo.kind = 'viewCollection';
			break;
		default:
			break;
	}
}

function getViewReferenceFromInitializer(initializer: ts.CallExpression): string | undefined {
	if (!initializer.arguments.length) {
		return undefined;
	}

	const firstArg = initializer.arguments[0];
	if (ts.isIdentifier(firstArg)) {
		return firstArg.text;
	}

	return undefined;
}

function tryReadSourceFile(filePath: string): ts.SourceFile | undefined {
	const normalizedPath = path.normalize(filePath);
	let stats: import('fs').Stats;

	try {
		stats = fs.statSync(normalizedPath);
		if (!stats.isFile()) {
			sourceFileCache.delete(normalizedPath);
			return undefined;
		}
	}
	catch {
		sourceFileCache.delete(normalizedPath);
		return undefined;
	}

	const cached = sourceFileCache.get(normalizedPath);
	if (cached && cached.mtimeMs === stats.mtimeMs) {
		return cached.sourceFile;
	}

	try {
		const content = fs.readFileSync(normalizedPath, 'utf-8');
		const sourceFile = ts.createSourceFile(normalizedPath, content, ts.ScriptTarget.Latest, true);
		sourceFileCache.set(normalizedPath, { sourceFile, mtimeMs: stats.mtimeMs });
		return sourceFile;
	}
	catch {
		sourceFileCache.delete(normalizedPath);
		return undefined;
	}
}

function findClassDeclarationWithin(sourceFile: ts.SourceFile, className: string): ts.ClassDeclaration | undefined {
	let target: ts.ClassDeclaration | undefined;

	const visit = (node: ts.Node) => {
		if (target) {
			return;
		}

		if (ts.isClassDeclaration(node) && node.name?.text === className) {
			target = node;
			return;
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return target;
}

function getImportModuleSpecifier(sourceFile: ts.SourceFile, className: string): string | undefined {
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}

		const moduleName = statement.moduleSpecifier.text;
		const clause = statement.importClause;

		if (clause.name?.text === className) {
			return moduleName;
		}

		if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			for (const element of clause.namedBindings.elements) {
				if (element.name.text === className) {
					return moduleName;
				}
			}
		}
	}

	return undefined;
}

function resolveModulePath(sourceFilePath: string, moduleSpecifier: string): string | undefined {
	if (!moduleSpecifier) {
		return undefined;
	}

	if (!sourceFilePath || sourceFilePath === 'temp.ts') {
		return undefined;
	}

	// Support only relative imports for now
	if (moduleSpecifier.startsWith('.')) {
		const baseDir = path.dirname(sourceFilePath);
		const normalizedSpecifier = moduleSpecifier.replace(/\\/g, '/');
		const targetBase = path.resolve(baseDir, normalizedSpecifier);
		const candidateFiles = buildCandidateFilePaths(targetBase);
		for (const candidate of candidateFiles) {
			if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
				return candidate;
			}
		}
	}

	return undefined;
}

function buildCandidateFilePaths(basePath: string): string[] {
	const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', ''];
	const candidates: string[] = [];

	for (const ext of extensions) {
		if (ext) {
			candidates.push(`${basePath}${ext}`);
		}
		else {
			candidates.push(basePath);
		}
	}

	if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
		for (const ext of extensions) {
			const candidate = path.join(basePath, `index${ext}`);
			candidates.push(candidate);
		}
	}

	return candidates;
}

// Resolves class declarations defined locally or in imported modules so we can follow extends chains.
function findClassDeclarationByName(sourceFile: ts.SourceFile, className: string): ts.ClassDeclaration | undefined {
	const localMatch = findClassDeclarationWithin(sourceFile, className);
	if (localMatch) {
		return localMatch;
	}

	const moduleSpecifier = getImportModuleSpecifier(sourceFile, className);
	if (!moduleSpecifier) {
		return undefined;
	}

	const resolvedPath = resolveModulePath(sourceFile.fileName, moduleSpecifier);
	if (!resolvedPath) {
		return undefined;
	}

	const importedSourceFile = tryReadSourceFile(resolvedPath);
	if (!importedSourceFile) {
		return undefined;
	}

	return findClassDeclarationWithin(importedSourceFile, className);
}

export function buildClassInheritance(node: ts.ClassDeclaration, visited: Set<string> = new Set()): ClassInheritanceInfo {
	const inheritanceChain: ts.Identifier[] = [];
	const properties: Map<string, ClassPropertyInfo> = new Map<string, ClassPropertyInfo>();
	collectDeclaredProperties(node, properties);

	if (!node.heritageClauses) {
		return { chain: inheritanceChain, properties };
	}

	for (const clause of node.heritageClauses) {
		const isExtendsClause = clause.token === ts.SyntaxKind.ExtendsKeyword;

		for (const typeNode of clause.types) {
			if (!ts.isIdentifier(typeNode.expression)) {
				continue;
			}

			const identifier = typeNode.expression as ts.Identifier;
			inheritanceChain.push(identifier);

			if (!isExtendsClause) {
				continue;
			}

			const className = identifier.text;
			if (visited.has(className)) {
				continue;
			}

			const parentDeclaration = findClassDeclarationByName(node.getSourceFile(), className);
			if (!parentDeclaration) {
				continue;
			}

			const nextVisited = new Set(visited);
			nextVisited.add(className);

			const parentInfo = buildClassInheritance(parentDeclaration, nextVisited);
			inheritanceChain.push(...parentInfo.chain);
			parentInfo.properties.forEach((propInfo, propName) => {
				if (!properties.has(propName)) {
					properties.set(propName, propInfo);
				}
			});
		}
	}

	return { chain: inheritanceChain, properties };
}

export type CollectedClassInfo = {
	className: string;
	type: "PXScreen" | "PXView" | undefined;
	properties: Map<string, ClassPropertyInfo>;
};

function collectClassPropertiesFromSource(sourceFile: ts.SourceFile, visitedFiles: Set<string>): CollectedClassInfo[] {
	const normalizedFileName = path.normalize(sourceFile.fileName);
	if (visitedFiles.has(normalizedFileName)) {
		return [];
	}
	visitedFiles.add(normalizedFileName);

	const classes: CollectedClassInfo[] = [];

	const visit = (node: ts.Node) => {
		if (ts.isClassDeclaration(node) && node.name) {
			const inheritanceInfo = buildClassInheritance(node);
			const screenOrViewItem = inheritanceInfo.chain.find(i => i.escapedText === "PXScreen" || i.escapedText === "PXView");

			classes.push({
				className: node.name.escapedText.toString(),
				properties: new Map(inheritanceInfo.properties),
				type: screenOrViewItem?.escapedText as "PXScreen" | "PXView" | undefined
			});
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}

		const moduleSpecifier = statement.moduleSpecifier.text;
		if (!moduleSpecifier.startsWith('.')) {
			continue;
		}

		const resolvedPath = resolveModulePath(sourceFile.fileName, moduleSpecifier);
		if (!resolvedPath) {
			continue;
		}

		const importedSourceFile = tryReadSourceFile(resolvedPath);
		if (!importedSourceFile) {
			continue;
		}

		classes.push(...collectClassPropertiesFromSource(importedSourceFile, visitedFiles));
	}

	return classes;
}

export function getClassPropertiesFromTs(tsContent: string, filePath = 'temp.ts'): CollectedClassInfo[] {
	const sourceFile = ts.createSourceFile(filePath, tsContent, ts.ScriptTarget.Latest, true);
	if (filePath && filePath !== 'temp.ts') {
		const normalizedPath = path.normalize(filePath);
		try {
			const stats = fs.statSync(normalizedPath);
			if (stats.isFile()) {
				sourceFileCache.set(normalizedPath, { sourceFile, mtimeMs: stats.mtimeMs });
			}
		}
		catch {
			sourceFileCache.delete(normalizedPath);
		}
	}

	return collectClassPropertiesFromSource(sourceFile, new Set());
}

export function getLineAndColumnFromIndex(text: string, index: number): { line: number; column: number; } {
	let line = 0;
	let column = 0;
  
	for (let i = 0; i < index; i++) {
	  if (text[i] === '\n') {
		line++;
		column = 0;
	  } else {
		column++;
	  }
	}
  
	return { line, column };
  }

export function getOpenedFilePath(): string | undefined {
	return vscode.window.activeTextEditor?.document.uri.fsPath;
}

export function getFrontendSourcesPath(): string | undefined {
    const pathArray = getOpenedFilePath()?.split(screensPath);
    const path = pathArray ? pathArray[0] : undefined;
    return path;
}

export function getScreenAppPath(): string | undefined {
    const frontendSourcesPath = getFrontendSourcesPath();
    const path = frontendSourcesPath ? `${frontendSourcesPath}screen` : undefined;
    return path;
}

export function getScreensSrcPath(): string | undefined {
    const frontendSourcesPath = getFrontendSourcesPath();
    const path = frontendSourcesPath ? `${frontendSourcesPath}${screensPath}` : undefined;
    return path;
}

export function getOpenedScreenId(): string | undefined {
    const openedScreenPathArray = getOpenedFilePath()?.split('\\');
    const openedScreenId = openedScreenPathArray ? openedScreenPathArray[openedScreenPathArray.length - 1].split('.')[0] : undefined;
    return openedScreenId;
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (result, item) => {
      const groupKey = item[key] ? (item[key] as unknown as string) : ""; // Ensure key is treated as a string for Record
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
      return result;
    },
    {} as Record<string, T[]>
  );
}

export function getCorrespondingTsFile(htmlFilePath: string) {
  const tsFilePath = htmlFilePath.replace(/\.html$/, ".ts"); // Assumes the same name and path
  return fs.existsSync(tsFilePath) ? tsFilePath : null;
}
  
  

