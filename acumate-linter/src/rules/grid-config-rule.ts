import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import {
	createRule,
	inheritsFrom,
	VIEW_CLASS_NAME,
	getDecorator,
	GRID_CONFIG_DECORATOR,
	GRID_PRESET_PROP_NAME,
	isCallExpression,
	isObjectExpression
} from "../common";
import { RuleFixer } from "@typescript-eslint/utils/ts-eslint";

// TODO: find a way to synchronize with enum in client-controls
export const gridPresetValues = [
	"GridPreset.Primary",
	"GridPreset.Inquiry",
	"GridPreset.Processing",
	"GridPreset.ReadOnly",
	"GridPreset.Details",
	"GridPreset.Attributes",
	"GridPreset.ShortList",
	"GridPreset.Empty"
];

export const acuGridConfigRule = createRule({
	name: "eslint-plugin-grid-config",
	defaultOptions: [],
	meta: {
		type: "problem",
		docs: {
			description: "acumatica grid config checker"
		},
		hasSuggestions: true,
		fixable: "code",
		schema: [],
		messages: {
			"presetNotSet": "Preset for grid is not defined",
			"presetSuggest": "Use {{name}} preset"
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

				const callExpr = gridDecorator.decorator.expression;

				const presetNode = gridDecorator.args?.[GRID_PRESET_PROP_NAME];
				let presetValue: string;
				let rangeToInsert: TSESTree.Range;
				let needBrackets = gridDecorator.args === null;
				const needRoundBrackets = gridDecorator.args === null;
				let needWhitespace = needBrackets;
				let needComma = false;
				if (presetNode) {
					presetValue = context.sourceCode.getText(presetNode);
					rangeToInsert = presetNode.parent!.range;
				}
				else {
					if (isCallExpression(callExpr)) {
						if (callExpr.arguments.length > 0 && isObjectExpression(callExpr.arguments[0])) {
							needWhitespace = callExpr.arguments[0].properties.length === 0;
							needComma = !needWhitespace;
							rangeToInsert = [callExpr.arguments[0].range[0] + 1, callExpr.arguments[0].range[0] + 1];
						}
						else {
							rangeToInsert = [callExpr.callee.range[1] + 1, callExpr.callee.range[1] + 1];
							needBrackets = true;
							needWhitespace = true;
						}
					}
					else {
						rangeToInsert = [callExpr.range[1], callExpr.range[1]];
					}
				}
				const prefix = `${needRoundBrackets ? "(" : ""}${needBrackets ? "{" : ""}${!presetNode ? " " : ""}`;
				const suffix = `${needComma ? "," : ""}${needWhitespace ? " " : ""}${needBrackets ? "}" : ""}${needRoundBrackets ? ")" : ""}`;

				if (!presetNode || !gridPresetValues.some(v => v === presetValue)) {
					context.report({
						messageId: "presetNotSet",
						node: node.id,
						suggest: gridPresetValues.map(name => ({
							messageId: "presetSuggest",
							fix: (fixer) => {
								const text = `${prefix}preset: ${name}${suffix}`;
								if (presetNode) {
									return fixer.replaceTextRange(rangeToInsert, text);
								}

								return fixer.insertTextBeforeRange(rangeToInsert, text);
							},
							data: { name }
						})),
					});
				}
			}
		};
	}
});
