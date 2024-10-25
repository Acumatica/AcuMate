import { window, QuickPickItem } from 'vscode';
import { BACKEND_ERROR_MESSAGE, CREATE_SCREEN_TITLE } from '../../constants';
import { AcuMateContext } from '../../plugin-context';


const placeHolder = 'Select Graph Type';

export async function selectGraphType(): Promise<string | undefined> {
	const apiClient = AcuMateContext.ApiService;
	let graphs;
	try {
		graphs = await apiClient.getGraphs();
	}
	catch(error) {
		window.showErrorMessage(`${BACKEND_ERROR_MESSAGE} ${error}`);
	}
	if (graphs) {
		const result = await window.showQuickPick<QuickPickItem>(graphs.map(g => ({ label: g.name ?? "", description: g.text }) ), {
			title: CREATE_SCREEN_TITLE,
			placeHolder,
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
