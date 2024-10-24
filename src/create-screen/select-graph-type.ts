import { window, QuickPickItem } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../constants';
import { AcuMateApiClient } from '../api/api-service';


const placeHolder = 'Select Graph Type';

export async function selectGraphType(): Promise<string | undefined> {
	var apiClient = new AcuMateApiClient();
	var graphs = await apiClient.getGraphs();
	if (graphs) {
		const result = await window.showQuickPick<QuickPickItem>(graphs.map(g => ({ label: g.name ?? "", description: g.text }) ), {
			title: CREATE_SCREEN_TITLE,
			placeHolder
		});

		if (!result) {
			return undefined;
		}
		
		const validationErrors = validateGraphType(result?.label);
		
		if (!validationErrors) {
			return result!.label;
		}
		
		window.showErrorMessage(validationErrors);
		return selectGraphType();
	}

	return undefined;
}

function validateGraphType(graphType?: string) {
	if (!graphType) {
		return 'Select Graph Type!';
	}
	return;
}
