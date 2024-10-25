import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import {
	createRule,
	inheritsFrom,
	VIEW_CLASS_NAME,
	getDecorator,
	GRID_CONFIG_DECORATOR,
	GRID_PRESET_PROP_NAME,
	isMemberExpression
} from "../common";

// TODO: find a way to synchronize with enum in client-controls
const gridPresetValues = [
	"GridPreset.Primary",
	"GridPreset.Inquiry",
	"GridPreset.Processing",
	"GridPreset.ReadOnly",
	"GridPreset.Details",
	"GridPreset.Attributes",
	"GridPreset.Empty"
];

export const acuGridConfigRule = createRule({
	name: "eslint-plugin-grid-config",
	defaultOptions: [{ dataUrl: "" }],
	meta: {
		type: "problem",
		docs: {
			description: "acumatica grid config checker"
		},
		hasSuggestions: true,
		schema: [{
			properties: {
				dataUrl: {
					type: "string",
				},
			}, type: "object",
			title: "Base url",
			additionalProperties: false,
		}],
		messages: {
			"presetNotSet": "Preset for grid is not defined",
			"presetSuggest": "Use {{ name }}"
		},
	},
	create(context) {
		return {
			ClassDeclaration(node) {
				const services = ESLintUtils.getParserServices(context);

				if (!node.id || !inheritsFrom(services, node, VIEW_CLASS_NAME, false)) {
					return;
				}

				const gridDecorator = getDecorator(node, GRID_CONFIG_DECORATOR);
				if (!gridDecorator) {
					return;
				}

				const presetNode = gridDecorator.args[GRID_PRESET_PROP_NAME];
				const presetValue = context.sourceCode.getText(presetNode);

				if (!gridPresetValues.some(v => v === presetValue)) {
					context.report({
						messageId: "presetNotSet",
						node: node.id,
						suggest: gridPresetValues.map(name => ({
							messageId: "presetSuggest",
							fix: () => null,
							data: { name }
						})),
					});
				}
			}
		};
	}
});
