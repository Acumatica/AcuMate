import ts from 'typescript';
import { getDecoratorIdentifier, getNodeDecorators } from './decorator-utils';

export interface FeatureInstalledLiteralInfo {
	literal: ts.StringLiteralLike;
}

export function findFeatureInstalledStringLiterals(sourceFile: ts.SourceFile): FeatureInstalledLiteralInfo[] {
	const results: FeatureInstalledLiteralInfo[] = [];

	const visit = (node: ts.Node) => {
		if (ts.isClassLike(node)) {
			const decorators = getNodeDecorators(node) ?? [];
			for (const decorator of decorators) {
				const literal = tryGetFeatureInstalledLiteral(decorator);
				if (literal) {
					results.push({ literal });
				}
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return results;
}

export function getFeatureInstalledLiteralAtPosition(
	sourceFile: ts.SourceFile,
	offset: number
): FeatureInstalledLiteralInfo | undefined {
	let match: FeatureInstalledLiteralInfo | undefined;

	const visit = (node: ts.Node) => {
		if (match) {
			return;
		}

		if (offset < node.getFullStart() || offset > node.getEnd()) {
			return;
		}

		if (ts.isStringLiteralLike(node)) {
			const parent = node.parent;
			if (
				parent &&
				ts.isCallExpression(parent) &&
				parent.arguments.length &&
				parent.arguments[0] === node &&
				isFeatureInstalledCall(parent)
			) {
				match = { literal: node };
				return;
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return match;
}

function tryGetFeatureInstalledLiteral(decorator: ts.Decorator): ts.StringLiteralLike | undefined {
	const expression = decorator.expression;
	if (!ts.isCallExpression(expression)) {
		return undefined;
	}

	if (!isFeatureInstalledCall(expression) || !expression.arguments.length) {
		return undefined;
	}

	const firstArg = expression.arguments[0];
	if (ts.isStringLiteralLike(firstArg)) {
		return firstArg;
	}

	return undefined;
}

function isFeatureInstalledCall(callExpression: ts.CallExpression): boolean {
	const decoratorName = getDecoratorIdentifier(callExpression.expression as ts.LeftHandSideExpression);
	return decoratorName?.toLowerCase() === 'featureinstalled';
}
