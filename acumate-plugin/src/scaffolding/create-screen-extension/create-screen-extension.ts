import path from 'path';
import { checkFileExists, createFile } from "../../utils";
import vscode from "vscode";
import Handlebars from 'handlebars';
import { setScreenExtensionName } from "./set-screen-extension-name";
import { selectViews } from "../common/select-views";
import { selectActions } from "../common/select-actions";
import { setViewTypes } from "../common/set-view-types";
import { selectFields } from "../common/select-fields";
const jsonic = require('jsonic');

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
import { {{screenName}} } from "../{{screenName}}";

export interface {{extensionName}} extends {{screenName}} {}
export class {{extensionName}} {
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

export async function createScreenExtension() {

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    var fileUri = activeEditor.document.uri;
    var fileName = path.parse(activeEditor.document.fileName).name;

    if (!fileUri.toString().includes("screen/src/screens/" + fileName?.substring(0, 2) + "/" + fileName)) {
        await vscode.window.showErrorMessage(`File ${fileName} is not a screen`, `OK`);
        return;
    }

    const screenId = fileName;

	const folderPath = "screen\\src\\screens\\" + screenId?.substring(0, 2) + "\\" + screenId + "\\extensions";

    const screenExtensionName = await setScreenExtensionName();
	if (!screenExtensionName) {
        return;
    }

	if (vscode.workspace.workspaceFolders) {
		const workspaceFolder = vscode.workspace.workspaceFolders[0];
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, folderPath, screenExtensionName + ".ts");

		if (await checkFileExists(fileUri)) {
			const selection = await vscode.window.showWarningMessage(`Screen extension ${screenExtensionName} already exists. Do you want to override it?`, `OK`, `Cancel`);
			if (selection === "Cancel") {
				return undefined;
			}
		}
	}

    const graphInfoMatch = activeEditor.document.getText().match(new RegExp(`\\@graphInfo\(([^)]*)\)`, "gms"));
    if (!graphInfoMatch || graphInfoMatch.length !== 1) {
        return;
    }
    const graphType = jsonic(graphInfoMatch[0].substring(11)).graphType;
    if (!graphType) {
        return;
    }

    const views = await selectViews(graphType);
    if (!views) {
        return;
    }

    const actions = await selectActions(graphType);
    await setViewTypes(views);
    await selectFields(views);

    const data = {
        graphName: graphType,
        screenName: screenId,
        actions: actions,
        extensionName: screenExtensionName,
        views: views
    };

    const tsCode = template(data, {
		allowProtoPropertiesByDefault: true
	  });

    const uri = await createFile(folderPath, screenExtensionName + ".ts", tsCode);
	await createFile(folderPath, screenExtensionName + ".html", htmlTemplate);

	if (uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
	}
}