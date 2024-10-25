import vscode from 'vscode';

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