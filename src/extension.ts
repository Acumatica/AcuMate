import { ExtensionContext, commands } from 'vscode';
import { setScreenName } from './create-screen/set-screen-name';
import { selectGraphType } from './create-screen/select-graph-type';
import { selectViews } from './create-screen/select-views';
import { setPrimaryView } from './create-screen/set-primary-view';
import { setViewTypes } from './create-screen/set-view-types';
import { selectFields } from './create-screen/select-fields';


export function activate(context: ExtensionContext) {
	const disposable = commands.registerCommand('acumate.createScreen', async () => {
		const screenId = await setScreenName();
		const graphType = await selectGraphType();
		if (!graphType) {
			return;
		}
		const views = await selectViews(graphType);
		if (!views) {
			return;
		}
		const primaryView = await setPrimaryView(views);
		await setViewTypes(views);
		await selectFields(views);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
