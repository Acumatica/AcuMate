import { window, QuickPickItem } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { IView } from '../types';

const items = ['OAuthResource', 'Roles']; // TODO: get these items with backend api
const placeHolder = 'Select Views';

export async function selectViews(): Promise<IView[]> {
	const result = await window.showQuickPick(items.map(label => ({ label })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		canPickMany: true,
	});

	const validationErrors = validateViews(result);
	
	if (!validationErrors) {
		return result!.map(item => ({ name: item.label }));
	}

	window.showErrorMessage(validationErrors);
	return selectViews();
}

function validateViews(items?: QuickPickItem[]) {
	if (!items?.length) {
		return 'Select at least one view!';
	}
	return;
}
