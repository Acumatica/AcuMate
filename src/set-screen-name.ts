import { window } from 'vscode';
import { CREATE_SCREEN_TITLE } from './constants';

const SCREEN_ID_LENGTH = 8;

export async function setScreenName(value?: string) {
	const prompt = 'Set screen ID:';
	const placeHolder = 'XXXXXXXX';

	const result = await window.showInputBox({
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		prompt,
        value,
	});

	const validationResult = validateScreenName(result);

	if (!validationResult) {
		return result;
	}

	window.showErrorMessage(validationResult);
	return setScreenName(result);
}

function validateScreenName(name?: string) {
	if (!name) {
		return 'Enter Screen ID';
	}
	if (name.length !== SCREEN_ID_LENGTH) {
		return `Screen ID should consist of ${SCREEN_ID_LENGTH} characters`;
	}
	return;
}
