import ts from 'typescript';
import { getDecoratorIdentifier } from './decorator-utils';

export interface LinkCommandLiteralInfo {
	literal: ts.StringLiteralLike;
	decorator: ts.Decorator;
	property: ts.PropertyDeclaration;
}

export function getLinkCommandLiteralAtPosition(
	sourceFile: ts.SourceFile,
	offset: number
): LinkCommandLiteralInfo | undefined {
	let match: LinkCommandLiteralInfo | undefined;

	const visit = (node: ts.Node) => {
		if (match) {
			return;
		}

		if (offset < node.getFullStart() || offset > node.getEnd()) {
			return;
		}

		if (ts.isStringLiteralLike(node)) {
			const callExpression = node.parent;
			if (!ts.isCallExpression(callExpression)) {
				return;
			}

			if (!callExpression.arguments.some(arg => arg === node)) {
				return;
			}

			const decorator = callExpression.parent;
			if (!decorator || !ts.isDecorator(decorator)) {
				return;
			}

			const property = decorator.parent;
			if (!property || !ts.isPropertyDeclaration(property)) {
				return;
			}

			const expression = callExpression.expression;
			if (!ts.isLeftHandSideExpression(expression)) {
				return;
			}

			const decoratorName = getDecoratorIdentifier(expression);
			if (!decoratorName || decoratorName.toLowerCase() !== 'linkcommand') {
				return;
			}

			match = { literal: node, decorator, property };
			return;
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return match;
}
