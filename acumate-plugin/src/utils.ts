import vscode from 'vscode';
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

export function buildClassInheritance(node: ts.ClassDeclaration) {
	if (node.heritageClauses) {
		const inheritedClasses = node.heritageClauses
			.map((it) => it.types
				.filter((inner) => ts.isIdentifier(inner.expression))
				.map((inner) => inner.expression as ts.Identifier)
			)
			.reduce((acc, el) => acc.concat(el), []);

		return inheritedClasses;
	}
	return undefined;
}

export function getClassPropertiesFromTs(tsContent: string): { className: string; type: "PXScreen" | "PXView"; properties: Set<string>; }[] {
	const classes: { className: string, type: 'PXScreen' | 'PXView', properties: Set<string> }[] = [];
	const sourceFile = ts.createSourceFile('temp.ts', tsContent, ts.ScriptTarget.Latest, true);
  
	function findClassProperties(node: ts.Node) {
	  if (ts.isClassDeclaration(node) && node.members) {
		const properties = new Set<string>();
		node.members.forEach(member => {
		  if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
			properties.add(member.name.text);
		  }
		});

		const inheritanceChain = buildClassInheritance(node);
		const screenOrViewItem = inheritanceChain?.find(i => i.escapedText === "PXScreen" || i.escapedText === "PXView");

		classes.push({className: node.name!.escapedText!, properties: properties, type: screenOrViewItem?.escapedText as any });
	  }
	  ts.forEachChild(node, findClassProperties);
	}
  
	ts.forEachChild(sourceFile, findClassProperties);
	return classes;
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
  
  

