import { window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { IView } from '../types';

const fieldsList = ['All Fields', 'ApplicationID', 'ResourceCD'];

export async function selectFields(views: IView[]): Promise<void> {
	for await (const item of views) {
		await selectFieldsForView(item);
	};
}

async function selectFieldsForView(view: IView) {
	const result = await window.showQuickPick(fieldsList.map(label => ({ label })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder: `Select Fields For View "${view.name}"`,
		canPickMany: true,
	});

	view.fields = result!.map(item => item.label);
}
