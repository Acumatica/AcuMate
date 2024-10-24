import { ExtensionContext, commands } from 'vscode';
import { setScreenName } from './set-screen-name';
import { selectGraphType } from './select-graph-type';


export function activate(context: ExtensionContext) {
	const disposable = commands.registerCommand('acumate.createScreen', async () => {
		await setScreenName();
		await selectGraphType();
		// await selectViews();
		// await selectPrimaryView();
		// await setViewTypes();
		// await selectFields();
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
