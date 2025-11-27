import ts from 'typescript';

export interface GraphTypeLiteralInfo {
	literal: ts.StringLiteralLike;
	property: ts.PropertyAssignment;
}

export function findGraphTypeLiterals(sourceFile: ts.SourceFile): GraphTypeLiteralInfo[] {
	const results: GraphTypeLiteralInfo[] = [];

	const visit = (node: ts.Node) => {
		if (
			ts.isPropertyAssignment(node) &&
			isGraphTypeProperty(node) &&
			ts.isStringLiteralLike(node.initializer)
		) {
			results.push({ literal: node.initializer, property: node });
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return results;
}

export function getGraphTypeLiteralAtPosition(sourceFile: ts.SourceFile, offset: number): GraphTypeLiteralInfo | undefined {
	let match: GraphTypeLiteralInfo | undefined;

	const visit = (node: ts.Node) => {
		if (match) {
			return;
		}

		if (offset < node.getFullStart() || offset > node.getEnd()) {
			return;
		}

		if (ts.isStringLiteralLike(node)) {
			const parent = node.parent;
			if (ts.isPropertyAssignment(parent) && isGraphTypeProperty(parent)) {
				match = { literal: node, property: parent };
				return;
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return match;
}

function isGraphTypeProperty(property: ts.PropertyAssignment): boolean {
	if (!isGraphInfoObjectLiteral(property.parent)) {
		return false;
	}

	const propertyName = getPropertyName(property.name);
	return propertyName === 'graphType';
}

function isGraphInfoObjectLiteral(node: ts.Node | undefined): node is ts.ObjectLiteralExpression {
	if (!node || !ts.isObjectLiteralExpression(node)) {
		return false;
	}

	const callExpression = node.parent;
	if (!callExpression || !ts.isCallExpression(callExpression)) {
		return false;
	}

	const expression = callExpression.expression;
	if (ts.isIdentifier(expression) && expression.text === 'graphInfo') {
		return true;
	}

	return false;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name)) {
		return name.text;
	}

	if (ts.isStringLiteralLike(name)) {
		return name.text;
	}

	return undefined;
}
