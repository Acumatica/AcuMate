import vscode from 'vscode';

export async function createFile(path: string, fileName: string, content: string) {
	if (vscode.workspace.workspaceFolders)
	{
		const workspaceFolder = vscode.workspace.workspaceFolders[0];
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri,path, fileName);

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
		//vscode.window.showInformationMessage(File ${fileName} created successfully!);
	}
}