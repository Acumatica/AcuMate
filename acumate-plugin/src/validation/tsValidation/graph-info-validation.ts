import vscode from 'vscode';
import ts from 'typescript';
import * as path from 'path';
import { getAvailableGraphs } from '../../services/graph-metadata-service';
import { findGraphTypeLiterals } from '../../typescript/graph-info-utils';
import { AcuMateContext } from '../../plugin-context';
import { GraphModel } from '../../model/graph-model';
import { GraphStructure } from '../../model/graph-structure';
import { getClassPropertiesFromTs, CollectedClassInfo, ClassPropertyInfo } from '../../utils';

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

	const sourceFile = ts.createSourceFile(document.fileName, document.getText(), ts.ScriptTarget.Latest, true);
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
		diagnostics.push(
			new vscode.Diagnostic(
				range,
				`The graphType "${graphName}" is not available on the connected server.`,
				vscode.DiagnosticSeverity.Warning
			)
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

	const classInfos = getClassPropertiesFromTs(document.getText(), document.fileName);
	const screenClasses = classInfos.filter(
		info => info.type === 'PXScreen' && path.normalize(info.sourceFile.fileName) === normalizedDocumentPath
	);
	if (!screenClasses.length) {
		return diagnostics;
	}

	const viewActionDiagnostics = compareScreenDeclarationsWithGraph(screenClasses, structure, document, graphName);
	diagnostics.push(...viewActionDiagnostics);
	return diagnostics;
}

function compareScreenDeclarationsWithGraph(
	screenClasses: CollectedClassInfo[],
	structure: GraphStructure,
	document: vscode.TextDocument,
	graphName: string
): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];
	const backendViewNames = new Set(Object.keys(structure.views ?? {}));
	const backendActionNames = new Set(
		(structure.actions ?? [])
			.map(action => action.name)
			.filter((name): name is string => Boolean(name))
	);

	for (const screenClass of screenClasses) {
		for (const property of screenClass.properties.values()) {
			if ((property.kind === 'view' || property.kind === 'viewCollection') && property.name) {
				if (!backendViewNames.has(property.name)) {
					diagnostics.push(
						createPropertyDiagnostic(
							document,
							property,
							`The PXScreen declares view "${property.name}" which does not exist in graph "${graphName}".`
						)
					);
				}
				continue;
			}

			if (property.kind === 'action' && property.name) {
				if (!backendActionNames.has(property.name)) {
					diagnostics.push(
						createPropertyDiagnostic(
							document,
							property,
							`The PXScreen declares action "${property.name}" which does not exist in graph "${graphName}".`
						)
					);
				}
			}
		}
	}

	return diagnostics;
}

function createPropertyDiagnostic(
	document: vscode.TextDocument,
	property: ClassPropertyInfo,
	message: string
): vscode.Diagnostic {
	const range = new vscode.Range(
		document.positionAt(property.node.getStart()),
		document.positionAt(property.node.getEnd())
	);
	return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
}
