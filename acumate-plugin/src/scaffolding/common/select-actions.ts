import { window, QuickPickItem } from 'vscode';
import { CREATE_SCREEN_TITLE } from '../../constants';
import { Action, View } from '../../types';
import { AcuMateContext } from '../../plugin-context';

const placeHolder = 'Select Actions';

export async function selectActions(graphName: string): Promise<Action[] | undefined> {
	var apiClient = AcuMateContext.ApiService;
	var graphStructure = await apiClient.getGraphStructure(graphName);
	if (!graphStructure?.actions) {
		return undefined;
	}

	var actions: QuickPickItem[] = [];
    if (graphStructure.actions) {
        for (const action of graphStructure.actions) {
            actions.push({ label: action.name ?? "", description: action.displayName });
        }
    }
	
	const result = await window.showQuickPick<QuickPickItem>(actions, {
		title: CREATE_SCREEN_TITLE,
		placeHolder,
		canPickMany: true,
		ignoreFocusOut: true
	});
	return result!.map(item => (new Action(item.label)));
}
