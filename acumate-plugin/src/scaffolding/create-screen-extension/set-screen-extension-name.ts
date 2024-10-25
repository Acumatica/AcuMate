import { window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../../constants';

export async function setScreenExtensionName() {
	const prompt = 'Set screen extension name:';
	const placeHolder = 'Extension name';

	const result = await window.showInputBox({
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		prompt
	});

	return result;
}
