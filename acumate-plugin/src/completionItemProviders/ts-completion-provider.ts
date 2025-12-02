import vscode from 'vscode';
import ts from 'typescript';
import {
    buildClassInheritance,
    tryGetGraphType,
    getClassPropertiesFromTs,
    createClassInfoLookup,
    isScreenLikeClass,
    tryGetGraphTypeFromExtension
} from '../utils';
import { AcuMateContext } from '../plugin-context';
import { getAvailableGraphs } from '../services/graph-metadata-service';
import { getGraphTypeLiteralAtPosition } from '../typescript/graph-info-utils';
import { buildBackendViewMap, normalizeMetaName } from '../backend-metadata-utils';

export async function provideTSCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {

    const documentText = document.getText();
    const sourceFile = ts.createSourceFile(document.fileName, documentText, ts.ScriptTarget.Latest, true);
    const classInfos = getClassPropertiesFromTs(documentText, document.fileName);
    const classInfoLookup = createClassInfoLookup(classInfos);

    const graphTypeCompletions = await provideGraphTypeCompletions(document, position, sourceFile);
    if (graphTypeCompletions?.length) {
        return graphTypeCompletions;
    }

    let activeClassName: string | undefined;
    let activeClassKind: 'PXScreen' | 'PXView' | undefined;

    // Walk through the AST to find the specified class and check the position
    function findClassAndCheckPosition(node: ts.Node) {
        if (activeClassKind) {
            return;
        }

        if (ts.isClassDeclaration(node) && node.name) {
            const { line: startLine } = document.positionAt(node.getStart(sourceFile));
            const { line: endLine } = document.positionAt(node.getEnd());

            if (position.line >= startLine && position.line <= endLine) {
                activeClassName = node.name.text;
                const inheritanceInfo = buildClassInheritance(node);
                const screenOrViewItem = inheritanceInfo.chain.find(i => i.escapedText === "PXScreen" || i.escapedText === "PXView");
                if (screenOrViewItem) {
                    activeClassKind = screenOrViewItem.escapedText as 'PXScreen' | 'PXView';
                }
                return;
            }
        }

        ts.forEachChild(node, findClassAndCheckPosition);
    }



    findClassAndCheckPosition(sourceFile);
    if (!activeClassKind && activeClassName) {
        const classInfo = classInfoLookup.get(activeClassName);
        if (classInfo && isScreenLikeClass(classInfo)) {
            activeClassKind = 'PXScreen';
        }
    }

    const suggestions: vscode.CompletionItem[] = [];
    const resolveGraphName = (): string | undefined => {
        return tryGetGraphType(documentText) ?? tryGetGraphTypeFromExtension(document.fileName);
    };

    if (activeClassKind === 'PXScreen') {
        const graphName = resolveGraphName();

        if (!graphName) {
            return;
        }

        const apiClient = AcuMateContext.ApiService;
        const graphStructure = await apiClient.getGraphStructure(graphName);
        if (!graphStructure) {
            return;
        }

        graphStructure.actions?.forEach(a => {
            if (!a?.name) {
                return;
            }

            const suggestion = new vscode.CompletionItem(a.name, vscode.CompletionItemKind.Property);
            suggestion.detail = `Action ${a.name} (${a.displayName})`;
            suggestion.insertText = `${a.name}: PXActionState;`;
            suggestion.documentation = new vscode.MarkdownString('Action from the graph ' + graphName);
            suggestions.push(suggestion);
        });

        if (graphStructure.views) {
            for (const viewKey of Object.keys(graphStructure.views)) {
                const viewMeta = graphStructure.views[viewKey];
                if (!viewMeta?.name) {
                    continue;
                }

                const suggestion = new vscode.CompletionItem(viewMeta.name, vscode.CompletionItemKind.Property);
                suggestion.detail = `View ${viewMeta.name} (${viewMeta.cacheName})`;
                suggestion.insertText = `${viewMeta.name} = createSingle(${viewMeta.cacheType});`;
                suggestion.documentation = new vscode.MarkdownString('View from the graph ' + graphName);
                suggestions.push(suggestion);
            }
        }
    }
    else if (activeClassKind === 'PXView' && activeClassName) {
        const graphName = resolveGraphName();
        if (!graphName) {
            return;
        }

        const apiClient = AcuMateContext.ApiService;
        const graphStructure = await apiClient.getGraphStructure(graphName);
        if (!graphStructure) {
            return;
        }

        const viewClassInfo = classInfoLookup.get(activeClassName);
        if (!viewClassInfo) {
            return;
        }

        const backendViewMap = buildBackendViewMap(graphStructure);
        if (!backendViewMap.size) {
            return;
        }

        const referencingViewNames = new Set<string>();
        for (const classInfo of classInfos) {
            for (const property of classInfo.properties.values()) {
                if ((property.kind === 'view' || property.kind === 'viewCollection') && property.viewClassName === activeClassName) {
                    const normalized = normalizeMetaName(property.name);
                    if (normalized) {
                        referencingViewNames.add(normalized);
                    }
                }
            }
        }

        if (!referencingViewNames.size) {
            return;
        }

        const existingFields = new Set<string>();
        for (const property of viewClassInfo.properties.values()) {
            if (property.kind === 'field') {
                const normalized = normalizeMetaName(property.name);
                if (normalized) {
                    existingFields.add(normalized);
                }
            }
        }

        const offeredFields = new Set<string>();
        for (const normalizedViewName of referencingViewNames) {
            const backendView = backendViewMap.get(normalizedViewName);
            if (!backendView) {
                continue;
            }

            for (const fieldMetadata of backendView.fields.values()) {
                if (existingFields.has(fieldMetadata.normalizedName) || offeredFields.has(fieldMetadata.normalizedName)) {
                    continue;
                }

                offeredFields.add(fieldMetadata.normalizedName);

                const suggestion = new vscode.CompletionItem(fieldMetadata.fieldName, vscode.CompletionItemKind.Property);
                suggestion.detail = `Field ${fieldMetadata.fieldName} (${backendView.viewName})`;
                suggestion.insertText = `${fieldMetadata.fieldName}: PXFieldState;`;

                const docLines = [`Field from view ${backendView.viewName} in graph ${graphName}.`];
                if (fieldMetadata.field.displayName) {
                    docLines.push(`Display name: ${fieldMetadata.field.displayName}`);
                }
                suggestion.documentation = new vscode.MarkdownString(docLines.join('\n\n'));

                suggestions.push(suggestion);
            }
        }
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