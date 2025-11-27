import vscode from 'vscode';
import ts from 'typescript';
import { buildClassInheritance, tryGetGraphType } from '../utils';
import { AcuMateContext } from '../plugin-context';
import { getAvailableGraphs } from '../services/graph-metadata-service';
import { getGraphTypeLiteralAtPosition } from '../typescript/graph-info-utils';

export async function provideTSCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {

    const sourceFile = ts.createSourceFile(document.fileName, document.getText(), ts.ScriptTarget.Latest, true);

    const graphTypeCompletions = await provideGraphTypeCompletions(document, position, sourceFile);
    if (graphTypeCompletions?.length) {
        return graphTypeCompletions;
    }

    let isInsideScreenClass = false;
    let isInsideViewClass = false;
    let viewName: string | undefined;

    // Walk through the AST to find the specified class and check the position
    function findClassAndCheckPosition(node: ts.Node) {
        if (ts.isClassDeclaration(node) && node.name) {
            const inheritanceInfo = buildClassInheritance(node);
            const screenOrViewItem = inheritanceInfo.chain.find(i => i.escapedText === "PXScreen" || i.escapedText === "PXView");
            if (screenOrViewItem) {
                const { line: startLine } = document.positionAt(node.getStart(sourceFile));
                const { line: endLine } = document.positionAt(node.getEnd());

                if (position.line >= startLine && position.line <= endLine) {
                    isInsideScreenClass = screenOrViewItem.escapedText === "PXScreen";
                    isInsideViewClass = screenOrViewItem.escapedText === "PXView";
                    return;
                }
            }
        }

        ts.forEachChild(node, findClassAndCheckPosition);
    }



    findClassAndCheckPosition(sourceFile);

    const suggestions: vscode.CompletionItem[] = [];

    if (isInsideScreenClass) {
        const graphName = tryGetGraphType(document.getText());

        if (!graphName) {
            return;
        }

        const apiClient = AcuMateContext.ApiService;
        const graphStructure = await apiClient.getGraphStructure(graphName);
        if (!graphStructure?.actions) {
            return;
        }

        graphStructure?.actions.forEach(a => {
            if (!a.name) {
                return;
            }

            // Define a completion item
            const suggestion = new vscode.CompletionItem(
                a.name,
                vscode.CompletionItemKind.Property
            );
            suggestion.detail = `Action ${a.name} (${a.displayName})`;
            suggestion.insertText = `${a.name}: PXActionState;`;
            suggestion.documentation = new vscode.MarkdownString(
                'Action from the graph ' + graphName
            );

            suggestions.push(suggestion);
        });


        if (!graphStructure?.views) {
            return;
        }

        for (const viewName in graphStructure.views) {
            const v = graphStructure.views[viewName];
            if (!v.name) {
                return;
            }

            // Define a completion item
            const suggestion = new vscode.CompletionItem(
                v.name,
                vscode.CompletionItemKind.Property
            );
            suggestion.detail = `View ${v.name} (${v.cacheName})`;
            suggestion.insertText = `${v.name} = createSingle(${v.cacheType});`;
            suggestion.documentation = new vscode.MarkdownString(
                'View from the graph ' + graphName
            );

            suggestions.push(suggestion);
        }
    }
    else if (isInsideViewClass) {

        const graphName = tryGetGraphType(document.getText());

        if (!graphName) {
            return;
        }

        const apiClient = AcuMateContext.ApiService;
        const graphStructure = await apiClient.getGraphStructure(graphName);
        if (!graphStructure?.actions) {
            return;
        }

        graphStructure?.actions.forEach(a => {
            if (!a.name) {
                return;
            }

            // Define a completion item
            const suggestion = new vscode.CompletionItem(
                a.name,
                vscode.CompletionItemKind.Property
            );
            suggestion.detail = `Action ${a.name} (${a.displayName})`;
            suggestion.insertText = `${a.name}: PXActionState;`;
            suggestion.documentation = new vscode.MarkdownString(
                'Action from the graph ' + graphName
            );

            suggestions.push(suggestion);
        });
    }

    // Return an array of suggestions
    return suggestions;
};

async function provideGraphTypeCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    sourceFile: ts.SourceFile
): Promise<vscode.CompletionItem[] | undefined> {
    const offset = document.offsetAt(position);
    const literalInfo = getGraphTypeLiteralAtPosition(sourceFile, offset);
    if (!literalInfo) {
        return undefined;
    }

    const graphs = await getAvailableGraphs();
    if (!graphs?.length) {
        return undefined;
    }

    const range = getStringContentRange(document, literalInfo.literal);
    const items: vscode.CompletionItem[] = [];
    for (const graph of graphs) {
        if (!graph?.name) {
            continue;
        }
        const item = new vscode.CompletionItem(graph.name, vscode.CompletionItemKind.Class);
        item.detail = graph.text ?? graph.name;
        item.insertText = graph.name;
        item.range = range;
        item.sortText = graph.name.toLowerCase();
        items.push(item);
    }

    return items.length ? items : undefined;
}

function getStringContentRange(document: vscode.TextDocument, literal: ts.StringLiteralLike): vscode.Range {
    const text = literal.getText();
    if (text.length >= 2) {
        const firstChar = text[0];
        const lastChar = text[text.length - 1];
        const matchingQuote = firstChar === lastChar && (firstChar === '"' || firstChar === "'" || firstChar === '`');
        if (matchingQuote) {
            const start = document.positionAt(literal.getStart() + 1);
            const end = document.positionAt(Math.max(literal.getStart() + 1, literal.getEnd() - 1));
            return new vscode.Range(start, end);
        }
    }

    return new vscode.Range(document.positionAt(literal.getStart()), document.positionAt(literal.getEnd()));
}