import { window, QuickPickItem } from 'vscode';
import { BACKEND_ERROR_MESSAGE, CREATE_SCREEN_TITLE } from '../../constants';
import { View } from '../../types';
import { AcuMateContext } from '../../plugin-context';

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

	window.showErrorMessage(validationErrors);
	return selectViews(graphName);
}

function validateViews(items?: QuickPickItem[]) {
	if (!items?.length) {
		return 'Select at least one view!';
	}
	return;
}
