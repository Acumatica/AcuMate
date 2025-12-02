import ts from 'typescript';

export function getNodeDecorators(node: ts.Node): readonly ts.Decorator[] | undefined {
	const tsAny = ts as unknown as {
		canHaveDecorators?: (node: ts.Node) => boolean;
		getDecorators?: (node: ts.Node) => readonly ts.Decorator[] | undefined;
	};
	if (typeof tsAny.canHaveDecorators === 'function' && typeof tsAny.getDecorators === 'function') {
		if (tsAny.canHaveDecorators(node)) {
			return tsAny.getDecorators(node);
		}
	}

	return (node as ts.Node & { decorators?: readonly ts.Decorator[] }).decorators;
}

export function getDecoratorIdentifier(expression: ts.LeftHandSideExpression): string | undefined {
	if (ts.isIdentifier(expression)) {
		return expression.text;
	}

	if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
		return expression.name.text;
	}

	return undefined;
}

export function tryGetStringLiteral(node: ts.Expression): string | undefined {
	if (ts.isStringLiteralLike(node)) {
		return node.text.trim();
	}

	return undefined;
}
