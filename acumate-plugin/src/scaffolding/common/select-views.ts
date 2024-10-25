import { window, QuickPickItem } from 'vscode';
import { BACKEND_ERROR_MESSAGE, CREATE_SCREEN_TITLE } from '../../constants';
import { AcuMateContext } from '../../plugin-context';
import { groupBy } from '../../utils';
import vscode from 'vscode';
import { View as ViewModel } from '../../model/view';
import { View } from '../../types';

const placeHolder = 'Select Views';

export async function selectViews(graphName: string): Promise<View[] | undefined> {
	const apiClient = AcuMateContext.ApiService;
	let graphStructure;
	try {
		graphStructure = await apiClient.getGraphStructure(graphName);
	}
	catch(error) {
		window.showErrorMessage(`${BACKEND_ERROR_MESSAGE} ${error}`);
	}
	if (!graphStructure?.views) {
		return undefined;
	}

	const views: QuickPickItem[] = [];
	const viewsRecords: (ViewModel & { name: string})[] = [];
	for (const viewInfoName in graphStructure.views) {
		const v = graphStructure.views[viewInfoName];
		if (!v) {
			continue;
		}
			
		const newLocal = { name: viewInfoName, ...v };
		viewsRecords.push(newLocal);
	}
	const groupedItems = groupBy(viewsRecords, 'extension');
	for (const category in groupedItems) {
		if (category) {
			views.push({label: category.substring(0, 50),  description: category, kind: vscode.QuickPickItemKind.Separator });
		}

		const viewsInCategory = groupedItems[category];
		if (!viewsInCategory) {
			continue;
		}

		for (const v of viewsInCategory) {
			views.push({ label: v.name ?? "", description: v.cacheName, detail: v.cacheType });
		}	
	}

	const result = await window.showQuickPick<QuickPickItem>(views, {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		canPickMany: true,
		ignoreFocusOut: true
	});

	if (!result || result.length === 0) {
		return undefined;
	}

	return result!.map(item => { 
		const result = new View(item.label);
		result.dacname = graphStructure!.views![item.label].cacheType; 
		const fieldsMap = graphStructure!.views![item.label].fields;
		if (fieldsMap) {
			result.fields = [];
			for (const key in fieldsMap) {
				result.fields.push(fieldsMap[key]);
			}
		}
		return result;
});
}