import { QuickPickItem, window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { View } from '../types';

export async function selectFields(views: View[]): Promise<void> {
	for await (const item of views) {
		await selectFieldsForView(item);
	};
}

async function selectFieldsForView(view: View) {
	if (!view.fields) {
		return;
	}

	var fields: QuickPickItem[] = [];
	for (const fieldName in view.fields) {
		const v = view.fields[fieldName];
		if (!v) {
			continue;
		}
			
		fields.push({ label: v.name ?? "", description: v.displayName, detail: v.typeName });
	}
	

	const result = await window.showQuickPick<QuickPickItem>(fields, {
		title: CREATE_SCREEN_TITLE,
		placeHolder: `Select Fields For View "${view.name}"`,
		canPickMany: true,
		ignoreFocusOut: true
	});

	var map = result!.map(item => item.label);
	view.fields = view.fields.filter(f => f.name && map.indexOf(f.name) >= 0 ) ;
}
