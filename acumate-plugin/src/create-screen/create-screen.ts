import { createFile } from "../utils";
import { selectActions } from "./select-actions";
import { selectFields } from "./select-fields";
import { selectGraphType } from "./select-graph-type";
import { selectViews } from "./select-views";
import { setPrimaryView } from "./set-primary-view";
import { setScreenName } from "./set-screen-name";
import { setViewTypes } from "./set-view-types";
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

const template = Handlebars.compile(templateSource);

export async function createScreen() {
    const screenId = await setScreenName();
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
    await createFile("screen\\src\\screens\\" + screenId?.substring(0, 2) + "\\" + screenId, screenId + ".ts", tsCode);
}