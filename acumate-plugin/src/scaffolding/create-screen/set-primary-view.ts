import { window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../../constants';
import { View } from '../../types';

const placeHolder = 'Select Primary View';

export async function setPrimaryView(views: View[]): Promise<string> {
	const result = await window.showQuickPick(views.map(item => ({ label: item.name })), {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		ignoreFocusOut: true
	});
	
	const validationErrors = validatePrimaryView(result?.label);
	
	if (!validationErrors) {
		return result!.label;
	}

	window.showErrorMessage(validationErrors);
	return setPrimaryView(views);
}

function validatePrimaryView(primaryView?: string) {
	if (!primaryView) {
		return 'Select Primary View!';
	}
	return;
}
