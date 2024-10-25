import { ParserServicesWithTypeInformation, TSESTree } from "@typescript-eslint/utils";
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

export interface DecoratorResult {
	name: string;
	args: { [name: string]: TSESTree.Node } | null;
	decorator: TSESTree.Decorator;
}

export function getDecorator(
	node: TSESTree.ClassDeclaration | TSESTree.PropertyDefinition,
	name: string
): DecoratorResult | null {
	const decorators = node.decorators;
	if (!decorators) {
		return null;
	}

	for (const decorator of decorators) {
		if (!isCallExpression(decorator.expression)) {
			if (isIdentifier(decorator.expression)) {
				return { name, args: null, decorator };
			}
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

		return { name, args: parsedArgs, decorator };
	}
	return null;
};

export function isCallExpression(node: TSESTree.Node | null): node is TSESTree.CallExpression {
	return node?.type === TSESTree.AST_NODE_TYPES.CallExpression;
}

export function isObjectExpression(node: TSESTree.Node | null): node is TSESTree.ObjectExpression {
	return node?.type === TSESTree.AST_NODE_TYPES.ObjectExpression;
}

export function isProperty(node: TSESTree.Node | null): node is TSESTree.Property {
	return node?.type === TSESTree.AST_NODE_TYPES.Property;
}

export function isIdentifier(node: TSESTree.Node | null): node is TSESTree.Identifier {
	return node?.type === TSESTree.AST_NODE_TYPES.Identifier;
}

export function isLiteral(node: TSESTree.Node | null): node is TSESTree.Literal {
	return node?.type === TSESTree.AST_NODE_TYPES.Literal;
}

export function isClassDeclaration(node: TSESTree.Node | null): node is TSESTree.ClassDeclaration {
	return node?.type === TSESTree.AST_NODE_TYPES.ClassDeclaration;
}

export function isMemberExpression(node: TSESTree.Node | null): node is TSESTree.MemberExpression {
	return node?.type === TSESTree.AST_NODE_TYPES.MemberExpression;
}

export function inheritsFrom(
	services: ParserServicesWithTypeInformation,
	node: TSESTree.ClassDeclaration,
	baseClassName: string,
	onlyImmidiateParent = true
): boolean {
	const parentClass = node.superClass;
	if (!isIdentifier(parentClass)) {
		return false;
	}

	if (parentClass.name === baseClassName) {
		return true;
	}

	if (onlyImmidiateParent) {
		return false;
	}

	// TODO: support not only immidiate parent!
	return false;
}
