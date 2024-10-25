import { QuickPickItem, QuickPickItemKind, window } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../../constants';
import { View } from '../../types';
import { groupBy } from '../../utils';

export async function selectFields(views: View[]): Promise<void> {
	for await (const item of views) {
		await selectFieldsForView(item);
	};
}

async function selectFieldsForView(view: View) {
	if (!view.fields) {
		return;
	}

	const fields: QuickPickItem[] = [];
	const groupedItems = groupBy(view.fields, 'extension');
	for (const category in groupedItems) {
		if (category) {
			fields.push({label: category.substring(0, 50), description: category, kind: QuickPickItemKind.Separator });
		}

		const fieldsInCategory = groupedItems[category];
		if (!fieldsInCategory) {
			continue;
		}

		for (const field of fieldsInCategory) {
			fields.push({ label: field.name ?? '', description: field.displayName, detail: field.typeName });
		}	
	}
	

	const result = await window.showQuickPick<QuickPickItem>(fields, {
		title: CREATE_SCREEN_TITLE,
		placeHolder: `Select Fields For View "${view.name}"`,
		canPickMany: true,
		ignoreFocusOut: true
	});

	const map = result!.map(item => item.label);
	view.fields = view.fields.filter(f => f.name && map.indexOf(f.name) >= 0 ) ;
}
