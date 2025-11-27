import vscode from 'vscode';
import ts from 'typescript';
import { getAvailableGraphs } from '../../services/graph-metadata-service';
import { findGraphTypeLiterals } from '../../typescript/graph-info-utils';
import { AcuMateContext } from '../../plugin-context';
import { GraphModel } from '../../model/graph-model';

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

	return diagnostics;
}
