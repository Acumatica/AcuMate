import { window } from 'vscode';
import { CREATE_SCREEN_TITLE } from './constants';

const items = ['PX.OAuthClient.ApplicationMaint', 'PX.OAuthClient.ResourceMaint']; // TODO: get these items with backend api
const placeHolder = 'Select graph type';

export async function selectGraphType() {
	const result = await window.showQuickPick(items.map(label => ({ label })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
	});

	window.showInformationMessage(result?.label || '');
}
