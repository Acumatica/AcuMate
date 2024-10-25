import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import {
	createRule,
	getGraphName,
	getScreenDataService,
	DecoratorFindResult,
	SCREEN_CLASS_NAME
} from "../common";

export const acuGraphRule = createRule({
	name: "eslint-plugin-acumate-graph-name",
	defaultOptions: [{ dataUrl: "" }],
	meta: {
		type: "problem",
		docs: {
			description: "acumatica graph name checker"
		},
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
			"noGraphName": "Decorator graphInfo has no graphType defined",
			"badGraphName": "graphType, defined by decorator graphInfo, wasn't found",
		},
	},
	create(context) {
		return {
			ClassDeclaration(node) {
				const services = ESLintUtils.getParserServices(context);
				const tsClass = services.getTypeAtLocation(node);
				const parentClass = node.superClass as TSESTree.Identifier;

				if (!node.id || parentClass?.name !== SCREEN_CLASS_NAME) {
					return;
				}

				const graphName = getGraphName(node);
				switch (graphName.status) {
					case DecoratorFindResult.NoValue:
						context.report({
							messageId: "noGraphName",
							node: node.id,
						});
						return;
					case DecoratorFindResult.NoDecorator:
						return;
					case DecoratorFindResult.Found:
						const dataService = getScreenDataService(context.options[0].dataUrl);
						if (!dataService.checkGraphName(graphName.name)) {
							context.report({
								messageId: "badGraphName",
								node: node.id
							});
						}
						break;
				}
			}
		};
	}
});
