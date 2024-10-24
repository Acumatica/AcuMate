import { window, QuickPickItem } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';

const items = ['PX.OAuthClient.ApplicationMaint', 'PX.OAuthClient.ResourceMaint']; // TODO: get these items with backend api
const placeHolder = 'Select Graph Type';

export async function selectGraphType(): Promise<string> {
	const result = await window.showQuickPick(items.map(label => ({ label })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
	});
	
	const validationErrors = validateGraphType(result?.label);
	
	if (!validationErrors) {
		return result!.label;
	}

	window.showErrorMessage(validationErrors);
	return selectGraphType();
}

function validateGraphType(graphType?: string) {
	if (!graphType) {
		return 'Select Graph Type!';
	}
	return;
}
