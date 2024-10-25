import vscode from 'vscode';
const jsonic = require('jsonic');
const { exec } = require('child_process');

export async function createFile(path: string, fileName: string, content: string): Promise<vscode.Uri | undefined> {
	if (vscode.workspace.workspaceFolders)
	{
		const workspaceFolder = vscode.workspace.workspaceFolders[0];
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri,path, fileName);

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
        //vscode.window.showErrorMessage(Error running npm command: ${error.message});
        return reject(error);
      }
      if (stderr) {
        //vscode.window.showWarningMessage(NPM Warning: ${stderr});
      }
      //vscode.window.showInformationMessage(NPM Output: ${stdout});
      resolve(stdout);
    });
  });
}