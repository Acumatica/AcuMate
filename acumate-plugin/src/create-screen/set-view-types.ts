import { QuickPickItem, window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { View, ViewType } from '../types';

const types = [
	{
		id: 'entity',
		description: 'Entity (single)',
	},
	{
		id: 'grid',
		description: 'Grid (collection)',
	},
	{
		id: 'tree',
		description: 'Tree (collection)',
 	},
];

export async function setViewTypes(views: View[]): Promise<void> {
	for await (const item of views) {
		await setTypeForView(item);
	};
}

async function setTypeForView(view: View) {
	const result = await window.showQuickPick<QuickPickItem>(types.map(item => ({ label: item.id, description: item.description })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder: `Set Type For View "${view.name}"`,
		ignoreFocusOut: true
	});

	view.type = result!.label as ViewType;
}
