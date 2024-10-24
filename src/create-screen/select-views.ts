import { window, QuickPickItem } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { IView } from '../types';
import { AcuMateApiClient } from '../api/api-service';

const placeHolder = 'Select Views';

export async function selectViews(graphName: string): Promise<IView[] | undefined> {
	var apiClient = new AcuMateApiClient();
	var graphStructure = await apiClient.getGraphStructure(graphName);
	if (!graphStructure?.views) {
		return undefined;
	}

	var views: QuickPickItem[] = [];
	graphStructure.views.forEach(v => {
		views.push({ label: v.name ?? "", description: v.cacheName, detail: v.cacheType });
		
	});
	const result = await window.showQuickPick<QuickPickItem>(views, {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		canPickMany: true,
	});

	const validationErrors = validateViews(result);
	
	if (!validationErrors) {
		return result!.map(item => ({ name: item.label }));
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
