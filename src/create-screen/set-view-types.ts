import { window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { IView, ViewType } from '../types';

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

export async function setViewTypes(views: IView[]): Promise<void> {
	for await (const item of views) {
		await setTypeForView(item);
	};
}

async function setTypeForView(view: IView) {
	const result = await window.showQuickPick(types.map(item => ({ label: item.description })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder: `Set Type For View "${view.name}"`,
	});

	view.type = result!.label as ViewType;
}
