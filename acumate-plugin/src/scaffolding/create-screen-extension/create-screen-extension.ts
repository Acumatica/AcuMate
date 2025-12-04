import path from 'path';
import { checkFileExists, createFile, runNpmCommand, tryGetGraphType, screensPath, workspacePath } from "../../utils";
import vscode from "vscode";
import Handlebars from 'handlebars';
import { setScreenExtensionName } from "./set-screen-extension-name";
import { selectViews } from "../common/select-views";
import { selectActions } from "../common/select-actions";
import { setViewTypes } from "../common/set-view-types";
import { selectFields } from "../common/select-fields";
import { AcuMateContext } from '../../plugin-context';
import { USE_BACKEND_WARNING } from '../../constants';

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
import { {{screenName}} } from "../{{screenName}}";

export interface {{extensionName}} extends {{screenName}} {}
export class {{extensionName}} {
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

export async function createScreenExtension() {
	if (!AcuMateContext.ConfigurationService.useBackend) {
		return vscode.window.showInformationMessage(USE_BACKEND_WARNING);
	}

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    const currentFileUri = activeEditor.document.uri;
    const currentFileName = path.parse(activeEditor.document.fileName).name;

    if (!currentFileUri.toString().includes("screen/src/screens/" + currentFileName?.substring(0, 2) + "/" + currentFileName)) {
        await vscode.window.showErrorMessage(`File ${currentFileName} is not a screen`, `OK`);
        return;
    }

    const screenId = currentFileName;

    const screenExtensionName = await setScreenExtensionName();
	if (!screenExtensionName) {
        return;
    }

	const folderPath = screensPath + screenId?.substring(0, 2) + "\\" + screenId + "\\extensions";;
	const workspaceFolderUri = vscode.Uri.file(`${AcuMateContext.repositoryPath}${workspacePath}`);
	const fileUri = vscode.Uri.joinPath(workspaceFolderUri, folderPath, screenExtensionName + ".ts");

	if (await checkFileExists(fileUri)) {
		const selection = await vscode.window.showWarningMessage(`Screen extension ${screenExtensionName} already exists. Do you want to override it?`, `OK`, `Cancel`);
		if (selection === "Cancel") {
			return undefined;
		}
	}

    const graphType = tryGetGraphType(activeEditor.document.getText());
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
					doc.document.save();
					handler.dispose();
				}
			});
			await vscode.commands.executeCommand('editor.action.organizeImports');
		}
	}
}