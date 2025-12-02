import vscode from 'vscode';
import ts from 'typescript';
import * as path from 'path';
import { getAvailableGraphs } from '../../services/graph-metadata-service';
import { findGraphTypeLiterals } from '../../typescript/graph-info-utils';
import { AcuMateContext } from '../../plugin-context';
import { GraphModel } from '../../model/graph-model';
import { GraphStructure } from '../../model/graph-structure';
import { getClassPropertiesFromTs, CollectedClassInfo, ClassPropertyInfo, createClassInfoLookup } from '../../utils';
import { buildBackendActionSet, buildBackendViewMap, normalizeMetaName } from '../../backend-metadata-utils';
import { createSuppressionEngine, SuppressionEngine } from '../../diagnostics/suppression';

export function registerGraphInfoValidation(context: vscode.ExtensionContext) {
	if (!AcuMateContext.ConfigurationService.useBackend) {
		return;
	}

	const collection = vscode.languages.createDiagnosticCollection('graphInfo');
	context.subscriptions.push(collection);

	const validateDocument = async (document: vscode.TextDocument) => {
		if (document.languageId !== 'typescript' || document.isUntitled) {
			collection.delete(document.uri);
			return;
		}

		const diagnostics = await collectGraphInfoDiagnostics(document);
		collection.set(document.uri, diagnostics);
	};

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId === 'typescript') {
				validateDocument(event.document);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			if (doc.languageId === 'typescript') {
				validateDocument(doc);
			}
		})
	);

	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'typescript') {
			validateDocument(doc);
		}
	});
}

export async function collectGraphInfoDiagnostics(
	document: vscode.TextDocument,
	graphsOverride?: GraphModel[]
): Promise<vscode.Diagnostic[]> {
const graphs = graphsOverride ?? (await getAvailableGraphs());
	if (!graphs?.length) {
		return [];
	}

	const validGraphNames = new Set(graphs.map(graph => graph.name).filter((name): name is string => Boolean(name)));
	if (!validGraphNames.size) {
		return [];
	}

	const documentText = document.getText();
	const suppression = createSuppressionEngine(documentText, 'ts');
	const sourceFile = ts.createSourceFile(document.fileName, documentText, ts.ScriptTarget.Latest, true);
	const literals = findGraphTypeLiterals(sourceFile);
	const diagnostics: vscode.Diagnostic[] = [];
	const normalizedDocumentPath = path.normalize(document.fileName);

	for (const info of literals) {
		const graphName = info.literal.text.trim();
		if (!graphName || validGraphNames.has(graphName)) {
			continue;
		}

		const range = new vscode.Range(
			document.positionAt(info.literal.getStart()),
			document.positionAt(info.literal.getEnd())
		);
		pushGraphDiagnostic(
			diagnostics,
			range,
			`The graphType "${graphName}" is not available on the connected server.`,
			suppression
		);
	}

	const firstLiteral = literals[0];
	if (!firstLiteral) {
		return diagnostics;
	}

	const graphName = firstLiteral.literal.text.trim();
	if (!graphName || !validGraphNames.has(graphName)) {
		return diagnostics;
	}

	const structure = await AcuMateContext.ApiService.getGraphStructure(graphName);
	if (!structure) {
		return diagnostics;
	}

	const classInfos = getClassPropertiesFromTs(documentText, document.fileName);
	const classInfoLookup = createClassInfoLookup(classInfos);
	const screenClasses = classInfos.filter(
		info => info.type === 'PXScreen' && path.normalize(info.sourceFile.fileName) === normalizedDocumentPath
	);
	if (!screenClasses.length) {
		return diagnostics;
	}

	diagnostics.push(
		...compareScreenDeclarationsWithGraph(screenClasses, structure, document, graphName, suppression)
	);
	diagnostics.push(
		...compareViewClassesWithGraph(screenClasses, classInfoLookup, structure, document, graphName, suppression)
	);
	return diagnostics;
}

function pushGraphDiagnostic(
	diagnostics: vscode.Diagnostic[],
	range: vscode.Range,
	message: string,
	suppression: SuppressionEngine,
	severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Warning
) {
	if (suppression.isSuppressed(range.start.line, 'graphInfo')) {
		return;
	}

	const diagnostic = new vscode.Diagnostic(range, message, severity);
	diagnostic.code = 'graphInfo';
	diagnostic.source = 'graphInfo';
	diagnostics.push(diagnostic);
}

function compareScreenDeclarationsWithGraph(
	screenClasses: CollectedClassInfo[],
	structure: GraphStructure,
	document: vscode.TextDocument,
	graphName: string,
	suppression: SuppressionEngine
): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];
	const backendViewMap = buildBackendViewMap(structure);
	const backendActionNames = buildBackendActionSet(structure);

	for (const screenClass of screenClasses) {
		for (const property of screenClass.properties.values()) {
			const propertyName = normalizeMetaName(property.name);
			if ((property.kind === 'view' || property.kind === 'viewCollection') && propertyName) {
				if (!backendViewMap.has(propertyName)) {
					const diagnostic = createPropertyDiagnostic(
						document,
						property,
						`The PXScreen declares view "${property.name}" which does not exist in graph "${graphName}".`,
						suppression
					);
					if (diagnostic) {
						diagnostics.push(diagnostic);
					}
				}
				continue;
			}

			if (property.kind === 'action' && propertyName) {
				if (!backendActionNames.has(propertyName)) {
					const diagnostic = createPropertyDiagnostic(
						document,
						property,
						`The PXScreen declares action "${property.name}" which does not exist in graph "${graphName}".`,
						suppression
					);
					if (diagnostic) {
						diagnostics.push(diagnostic);
					}
				}
			}
		}
	}

	return diagnostics;
}

function compareViewClassesWithGraph(
	screenClasses: CollectedClassInfo[],
	classInfoLookup: Map<string, CollectedClassInfo>,
	structure: GraphStructure,
	document: vscode.TextDocument,
	graphName: string,
	suppression: SuppressionEngine
): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];
	const backendViewMap = buildBackendViewMap(structure);
	const backendActionNames = buildBackendActionSet(structure);

	const processedPairs = new Set<string>();

	for (const screenClass of screenClasses) {
		for (const property of screenClass.properties.values()) {
			if ((property.kind !== 'view' && property.kind !== 'viewCollection') || !property.viewClassName) {
				continue;
			}

			const normalizedViewName = normalizeMetaName(property.name);
			if (!normalizedViewName) {
				continue;
			}

			const backendView = backendViewMap.get(normalizedViewName);
			const viewClassInfo = classInfoLookup.get(property.viewClassName);
			if (!viewClassInfo) {
				continue;
			}

			const pairKey = `${viewClassInfo.className}::${backendView?.normalizedName ?? normalizedViewName}`;
			if (processedPairs.has(pairKey)) {
				continue;
			}
			processedPairs.add(pairKey);

			const backendFields = backendView?.fields;
			if (backendView && backendFields?.size) {
				for (const fieldProperty of viewClassInfo.properties.values()) {
					if (fieldProperty.kind !== 'field') {
						continue;
					}

					const normalizedFieldName = normalizeMetaName(fieldProperty.name);
					if (!normalizedFieldName) {
						continue;
					}

					if (!backendFields.has(normalizedFieldName)) {
						const diagnostic = createPropertyDiagnostic(
							document,
							fieldProperty,
							`The PXView "${viewClassInfo.className}" declares field "${fieldProperty.name}" which does not exist in backend view "${backendView.viewName}" for graph "${graphName}".`,
							suppression
						);
						if (diagnostic) {
							diagnostics.push(diagnostic);
						}
					}
				}
			}

			for (const fieldProperty of viewClassInfo.properties.values()) {
				if (fieldProperty.kind !== 'field') {
					continue;
				}

				const linkCommandTargets = getLinkCommandTargets(fieldProperty.node);
				for (const target of linkCommandTargets) {
					const normalizedTarget = normalizeMetaName(target);
					if (!normalizedTarget) {
						continue;
					}

					if (!backendActionNames.has(normalizedTarget)) {
						const diagnostic = createPropertyDiagnostic(
							document,
							fieldProperty,
							`The @linkCommand decorator on field "${fieldProperty.name}" references action "${target}" which does not exist in graph "${graphName}".`,
							suppression
						);
						if (diagnostic) {
							diagnostics.push(diagnostic);
						}
					}
				}
			}
		}
	}

	return diagnostics;
}

function createPropertyDiagnostic(
	document: vscode.TextDocument,
	property: ClassPropertyInfo,
	message: string,
	suppression: SuppressionEngine
): vscode.Diagnostic | undefined {
	const range = new vscode.Range(
		document.positionAt(property.node.getStart()),
		document.positionAt(property.node.getEnd())
	);
	if (suppression.isSuppressed(range.start.line, 'graphInfo')) {
		return undefined;
	}
	const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
	diagnostic.code = 'graphInfo';
	diagnostic.source = 'graphInfo';
	return diagnostic;
}

function getLinkCommandTargets(node: ts.PropertyDeclaration): string[] {
	const targets: string[] = [];
	const decorators = getNodeDecorators(node);
	if (!decorators?.length) {
		return targets;
	}

	for (const decorator of decorators) {
		const expression = decorator.expression;
		if (!ts.isCallExpression(expression)) {
			continue;
		}

		const decoratorName = getDecoratorIdentifier(expression.expression);
		if (!decoratorName || decoratorName.toLowerCase() !== 'linkcommand') {
			continue;
		}

		if (!expression.arguments.length) {
			continue;
		}

		const firstArg = expression.arguments[0];
		const actionName = tryGetStringLiteral(firstArg);
		if (actionName) {
			targets.push(actionName);
		}
	}

	return targets;
}

function getNodeDecorators(node: ts.Node): readonly ts.Decorator[] | undefined {
	const tsAny = ts as unknown as { canHaveDecorators?: (node: ts.Node) => boolean; getDecorators?: (node: ts.Node) => readonly ts.Decorator[] | undefined };
	if (typeof tsAny.canHaveDecorators === 'function' && typeof tsAny.getDecorators === 'function') {
		if (tsAny.canHaveDecorators(node)) {
			return tsAny.getDecorators(node);
		}
	}

	return (node as ts.Node & { decorators?: readonly ts.Decorator[] }).decorators;
}

function getDecoratorIdentifier(expression: ts.LeftHandSideExpression): string | undefined {
	if (ts.isIdentifier(expression)) {
		return expression.text;
	}

	if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
		return expression.name.text;
	}

	return undefined;
}

function tryGetStringLiteral(node: ts.Expression): string | undefined {
	if (ts.isStringLiteralLike(node)) {
		return node.text.trim();
	}

	return undefined;
}
