import { TSESTree } from "@typescript-eslint/utils";
import { DecoratorFindResult, GraphNameFindResult } from "./types";
import { GRAPH_INFO_DECORATOR, GRAPH_TYPE_PROP_NAME } from "./constants";

export function getGraphName(node: TSESTree.ClassDeclaration | TSESTree.PropertyDefinition): GraphNameFindResult {
	const decorator = getDecorator(node, GRAPH_INFO_DECORATOR);
	if (!decorator?.args) {
		return { status: DecoratorFindResult.NoDecorator };
	}

	const propValue = decorator.args[GRAPH_TYPE_PROP_NAME];
	if (!propValue || !isLiteral(propValue)) {
		return { status: DecoratorFindResult.NoValue };
	}

	return { status: DecoratorFindResult.Found, name: propValue.value as string };
}

export function getDecorator(
	node: TSESTree.ClassDeclaration | TSESTree.PropertyDefinition,
	name: string
) {
	const decorators = node.decorators;
	if (!decorators) {
		return null;
	}

	for (const decorator of decorators) {
		if (!isCallExpression(decorator.expression)) {
			continue;
		}

		if (!isIdentifier(decorator.expression.callee)) {
			continue;
		}

		if (decorator.expression.callee.name !== name) {
			continue;
		}

		const parsedArgs: { [name: string]: TSESTree.Node } = {};
		const exArgs = decorator.expression.arguments;
		for (const exArg of exArgs) {
			if (!isObjectExpression(exArg)) {
				continue;
			}
			for (const prop of exArg.properties) {
				if (!isProperty(prop)) {
					continue;
				}

				if (isIdentifier(prop.key)) {
					parsedArgs[prop.key.name] = prop.value;
				}
			}
		}

		return { name, args: parsedArgs };
	}
	return null;
};

export function isCallExpression(node: TSESTree.Node): node is TSESTree.CallExpression {
	return node.type === TSESTree.AST_NODE_TYPES.CallExpression;
}

export function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
	return node.type === TSESTree.AST_NODE_TYPES.ObjectExpression;
}

export function isProperty(node: TSESTree.Node): node is TSESTree.Property {
	return node.type === TSESTree.AST_NODE_TYPES.Property;
}

export function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
	return node.type === TSESTree.AST_NODE_TYPES.Identifier;
}

export function isLiteral(node: TSESTree.Node): node is TSESTree.Literal {
	return node.type === TSESTree.AST_NODE_TYPES.Literal;
}
