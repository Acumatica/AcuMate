import vscode from 'vscode';
const fs = require('fs');

import {
	getCorrespondingTsFile,
	getClassPropertiesFromTs,
	CollectedClassInfo,
	createClassInfoLookup,
	resolveViewBinding,
	ClassPropertyInfo,
} from '../utils';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
} from './html-shared';

// Registers completions so HTML view bindings stay in sync with PX metadata.
export function registerHtmlCompletionProvider(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerCompletionItemProvider(
		{ language: 'html', scheme: 'file' },
		new HtmlCompletionProvider(),
		'"'
	);

	context.subscriptions.push(provider);
}

export class HtmlCompletionProvider implements vscode.CompletionItemProvider {
	// Uses the caret position to decide which suggestion set (view or field) applies.
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[] | undefined> {
		const offset = document.offsetAt(position);
		const dom = parseDocumentDom(document.getText());
		if (!dom) {
			return undefined;
		}

		const node = findNodeAtOffset(dom, offset);
		if (!node) {
			return undefined;
		}

		const elementNode = elevateToElementNode(node);
		if (!elementNode || elementNode.type !== 'tag') {
			return undefined;
		}

		const attributeContext = getAttributeContext(document, offset, elementNode);
		if (!attributeContext) {
			return undefined;
		}

		const tsFilePath = getCorrespondingTsFile(document.uri.fsPath);
		if (!tsFilePath || !fs.existsSync(tsFilePath)) {
			return undefined;
		}

		const tsContent = fs.readFileSync(tsFilePath, 'utf-8');
		const classInfos = getClassPropertiesFromTs(tsContent, tsFilePath);
		if (!classInfos.length) {
			return undefined;
		}

		const classInfoLookup = createClassInfoLookup(classInfos);
		const screenClasses = classInfos.filter(info => info.type === 'PXScreen');
		// Completions are sourced from the same metadata as validation/definitions to keep behavior consistent.

		if (attributeContext.attributeName === 'view.bind') {
			return this.createViewBindingCompletions(screenClasses);
		}

		if (attributeContext.attributeName === 'name' && attributeContext.tagName === 'field') {
			// Field completions are scoped to the PXView resolved from the surrounding markup.
			const viewName = findParentViewName(elementNode);
			if (!viewName) {
				return undefined;
			}

			const resolution = resolveViewBinding(viewName, screenClasses, classInfoLookup);
			const viewClass = resolution?.viewClass;
			if (!viewClass) {
				return undefined;
			}

			return this.createFieldCompletions(viewClass.properties);
		}

		return undefined;
	}

	// Builds the suggestion set for view.bind attributes.
	private createViewBindingCompletions(screenClasses: CollectedClassInfo[]): vscode.CompletionItem[] {
		const seen = new Set<string>();
		const items: vscode.CompletionItem[] = [];

		for (const screenClass of screenClasses) {
			for (const [name, property] of screenClass.properties) {
				if ((property.kind === 'view' || property.kind === 'viewCollection') && !seen.has(name)) {
					seen.add(name);
					// Each view binding is emitted once even if multiple PXScreen classes declare it.
					const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field);
					item.detail = property.kind === 'view' ? 'PXView' : 'PXViewCollection';
					item.documentation = property.viewClassName
						? `Bound to ${property.viewClassName}`
						: undefined;
					items.push(item);
				}
			}
		}

		return items;
	}

	// Builds the suggestion set for <field name="..."> attributes scoped to a PXView.
	private createFieldCompletions(properties: Map<string, ClassPropertyInfo>): vscode.CompletionItem[] {
		const items: vscode.CompletionItem[] = [];

		for (const [name, property] of properties) {
			if (property.kind !== 'field') {
				continue;
			}

			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Field);
			item.detail = property.typeName ?? 'PXFieldState';
			items.push(item);
		}

		return items;
	}
}
