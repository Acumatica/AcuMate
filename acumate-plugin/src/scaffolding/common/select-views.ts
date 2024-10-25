import { window, QuickPickItem } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../../constants';
import { View } from '../../types';
import { AcuMateContext } from '../../plugin-context';

const placeHolder = 'Select Views';

export async function selectViews(graphName: string): Promise<View[] | undefined> {
	var apiClient = AcuMateContext.ApiService;
	var graphStructure = await apiClient.getGraphStructure(graphName);
	if (!graphStructure?.views) {
		return undefined;
	}

	var views: QuickPickItem[] = [];
	for (const viewInfoName in graphStructure.views) {
		const v = graphStructure.views[viewInfoName];
		if (!v) {
			continue;
		}
			
		views.push({ label: v.name ?? "", description: v.cacheName, detail: v.cacheType });
	}
	
	const result = await window.showQuickPick<QuickPickItem>(views, {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		canPickMany: true,
		ignoreFocusOut: true
	});

	const validationErrors = validateViews(result);
	
	if (!validationErrors) {
		return result!.map(item => { 
			var result = new View(item.label);
			result.dacname = graphStructure!.views![item.label].cacheType; 
			var fieldsMap = graphStructure!.views![item.label].fields;
			if (fieldsMap) {
				result.fields = [];
				for (const key in fieldsMap) {
					result.fields.push(fieldsMap[key]);
				}
			}
			return result;
	});
	}

	window.showErrorMessage(validationErrors);
	return selectViews(graphName);
}

function validateViews(items?: QuickPickItem[]) {
	if (!items?.length) {
		return 'Select at least one view!';
	}
	return;
}
