import { checkFileExists, createFile, runNpmCommand, screensPath, workspacePath } from "../../utils";
import { selectActions } from "../common/select-actions";
import { selectFields } from "../common/select-fields";
import { selectGraphType } from "./select-graph-type";
import { selectViews } from "../common/select-views";
import { setPrimaryView } from "./set-primary-view";
import { setScreenName } from "./set-screen-name";
import { setViewTypes } from "../common/set-view-types";
import vscode from "vscode";
import Handlebars from 'handlebars';
import { AcuMateContext } from "../../plugin-context";
import { USE_BACKEND_WARNING } from "../../constants";

const templateSource = `import {
	PXScreen,
	PXView,
	PXActionState,
	PXFieldState,
	PXFieldOptions,
	PXViewCollection,

	createSingle,
	createCollection,

	graphInfo,
	viewInfo,
	gridConfig,
	columnConfig,
	treeConfig,

	GridPreset,
	GridColumnType,
	GridColumnShowHideMode,
	GridColumnDisplayMode,

	handleEvent,
	CustomEventType,
	RowSelectedHandlerArgs,
	CurrentRowChangedHandlerArgs,

	linkCommand,
	ValueChangedHandlerArgs,
	controlConfig,
} from "client-controls";

@graphInfo({
	graphType: "{{graphName}}",
	primaryView: "{{primaryView}}",
})
export class {{screenName}} extends PXScreen {
{{#each actions}}
	{{name}}: PXActionState;
{{/each}}

{{#each views}}
	{{name}} = {{#if isEntity}}createSingle{{else}}createCollection{{/if}}({{dacname}});

{{/each}}
}

{{#each views}}
{{#if isGrid}}@gridConfig({ preset: GridPreset.Details }){{/if}}{{#if isTree}}@treeConfig(){{/if}}
export class {{dacname}} extends PXView {
{{#each fields}}
	//{{displayName}}
	{{name}}: PXFieldState;
{{/each}}
}

{{/each}}`;

const htmlTemplate = `<template>
</template>
`;

const template = Handlebars.compile(templateSource);

export async function createScreen() {
	if (!AcuMateContext.ConfigurationService.useBackend) {
		return vscode.window.showInformationMessage(USE_BACKEND_WARNING);
	}

    const screenId = await setScreenName();
	if (!screenId) {
        return;
    }

	const folderPath = screensPath + screenId?.substring(0, 2) + "\\" + screenId;
	const workspaceFolderUri = vscode.Uri.file(`${AcuMateContext.repositoryPath}${workspacePath}`);
	const fileUri = vscode.Uri.joinPath(workspaceFolderUri, folderPath, screenId + ".ts");

	if (await checkFileExists(fileUri)) {
		const selection = await vscode.window.showWarningMessage(`Screen ${screenId} already exists. Do you want to override it?`, `OK`, `Cancel`);
		if (selection === "Cancel") {
			return undefined;
		}
	}

    const graphType = await selectGraphType();
    if (!graphType) {
        return;
    }
    const views = await selectViews(graphType);
    if (!views) {
        return;
    }
    const primaryView = await setPrimaryView(views);
    const actions = await selectActions(graphType);
    await setViewTypes(views);
    await selectFields(views);

    const data = {
        graphName: graphType,
        primaryView: primaryView,
        screenName: screenId,
        actions: actions,
        views: views
    };

    const tsCode = template(data, {
		allowProtoPropertiesByDefault: true
	  });

    const uri = await createFile(folderPath, screenId + ".ts", tsCode);
	await createFile(folderPath, screenId + ".html", htmlTemplate);

	if (uri && AcuMateContext.ConfigurationService.usePrettier) {
		const fileUri = vscode.Uri.joinPath(workspaceFolderUri, folderPath);
		await runNpmCommand('prettier ./*.ts --write', fileUri.path.replace('/', ''));
	}

	if (uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		if (AcuMateContext.ConfigurationService.clearUsages) {
			const handler = vscode.workspace.onDidChangeTextDocument(doc => {
				if (doc.document.uri.path === document.uri.path) {
					try {
						doc.document.save();
					} finally {
						handler.dispose();
					}
				}
			});
			setTimeout(() => handler.dispose(), 5000); // Fallback timeout
			await vscode.commands.executeCommand('editor.action.organizeImports');
		}
	}
}
