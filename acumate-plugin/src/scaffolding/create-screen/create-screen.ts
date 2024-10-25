import { checkFileExists, createFile } from "../../utils";
import { selectActions } from "../common/select-actions";
import { selectFields } from "../common/select-fields";
import { selectGraphType } from "./select-graph-type";
import { selectViews } from "../common/select-views";
import { setPrimaryView } from "./set-primary-view";
import { setScreenName } from "./set-screen-name";
import { setViewTypes } from "../common/set-view-types";
import vscode from "vscode";
import Handlebars from 'handlebars';

const templateSource = `
import {
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
	{{#if isGrid}}@gridConfig({preset: GridPreset.Details}){{/if}}{{#if isTree}}@treeConfig(){{/if}}
	{{name}} = {{#if isEntity}}createSingle{{else}}createCollection{{/if}}({{dacname}});

{{/each}}
}

{{#each views}}
export class {{dacname}} extends PXView {
{{#each fields}}
	//{{displayName}}
	{{name}}: PXFieldState;
{{/each}}
}

{{/each}}`;

const htmlTemplate = `
<template>
</template>
`;

const template = Handlebars.compile(templateSource);

export async function createScreen() {
    const screenId = await setScreenName();
	if (!screenId) {
        return;
    }

	const folderPath = "screen\\src\\screens\\" + screenId?.substring(0, 2) + "\\" + screenId;

	if (vscode.workspace.workspaceFolders) {
		const workspaceFolder = vscode.workspace.workspaceFolders[0];
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, folderPath, screenId + ".ts");

		if (await checkFileExists(fileUri)) {
			const selection = await vscode.window.showWarningMessage(`Screen ${screenId} already exists. Do you want to override it?`, `OK`, `Cancel`);
			if (selection === "Cancel") {
				return undefined;
			}
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

	if (uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
	}
}