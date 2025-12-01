import vscode from 'vscode';

import {
	getRelatedTsFiles,
	loadClassInfosFromFiles,
	CollectedClassInfo,
	createClassInfoLookup,
	resolveViewBinding,
	ClassPropertyInfo,
	filterScreenLikeClasses,
	collectActionProperties,
} from '../utils';
import {
	parseDocumentDom,
	findNodeAtOffset,
	elevateToElementNode,
	getAttributeContext,
	findParentViewName,
} from './html-shared';
import {
	ClientControlMetadata,
	getClientControlsMetadata,
} from '../services/client-controls-service';

// Registers completions so HTML view bindings stay in sync with PX metadata.
export function registerHtmlCompletionProvider(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerCompletionItemProvider(
		{ language: 'html', scheme: 'file' },
		new HtmlCompletionProvider(),
		'"',
		'<'
	);

	context.subscriptions.push(provider);
}

export class HtmlCompletionProvider implements vscode.CompletionItemProvider {
	// Uses the caret position to decide which suggestion set (view or field) applies.
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[] | undefined> {
		const controlTagItems = await this.tryProvideControlTagCompletion(document, position);
		if (controlTagItems) {
			return controlTagItems;
		}

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

		const tsFilePaths = getRelatedTsFiles(document.uri.fsPath);
		if (!tsFilePaths.length) {
			return undefined;
		}

		const classInfos = loadClassInfosFromFiles(tsFilePaths);
		if (!classInfos.length) {
			return undefined;
		}

		const classInfoLookup = createClassInfoLookup(classInfos);
		const screenClasses = filterScreenLikeClasses(classInfos);
		// Completions are sourced from the same metadata as validation/definitions to keep behavior consistent.

		if (attributeContext.attributeName === 'view.bind') {
			return this.createViewBindingCompletions(screenClasses);
		}

		if (attributeContext.attributeName === 'view' && attributeContext.tagName === 'using') {
			return this.createViewBindingCompletions(screenClasses);
		}

		if (attributeContext.attributeName === 'state.bind') {
			return this.createActionCompletions(screenClasses);
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

	private async tryProvideControlTagCompletion(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[] | undefined> {
		const tagContext = this.getTagCompletionContext(document, position);
		if (!tagContext) {
			return undefined;
		}

		const lowerPrefix = tagContext.tagPrefix.toLowerCase();
		if (lowerPrefix && !lowerPrefix.startsWith('qp')) {
			return undefined;
		}

		const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath);
		const controls = getClientControlsMetadata({
			startingPath: document.uri.fsPath,
			workspaceRoots,
		});
		if (!controls.length) {
			return undefined;
		}

		const filtered = controls.filter(control =>
			!lowerPrefix || control.tagName.toLowerCase().startsWith(lowerPrefix)
		);
		if (!filtered.length) {
			return undefined;
		}

		return filtered.map(control => this.createControlCompletionItem(control, tagContext.replaceRange));
	}

	private getTagCompletionContext(
		document: vscode.TextDocument,
		position: vscode.Position
	): { tagPrefix: string; replaceRange: vscode.Range } | undefined {
		const line = document.lineAt(position.line);
		const textBeforeCursor = line.text.slice(0, position.character);
		const match = /<\s*\/?\s*([A-Za-z0-9:-]*)$/.exec(textBeforeCursor);
		if (!match) {
			return undefined;
		}

		const tagPrefix = match[1] ?? '';
		const replaceStart = position.character - tagPrefix.length;
		const replaceRange = new vscode.Range(
			position.line,
			Math.max(0, replaceStart),
			position.line,
			position.character
		);

		return { tagPrefix, replaceRange };
	}

	private createControlCompletionItem(control: ClientControlMetadata, replaceRange: vscode.Range): vscode.CompletionItem {
		const item = new vscode.CompletionItem(control.tagName, vscode.CompletionItemKind.Class);
		item.range = replaceRange;
		item.detail = control.config?.displayName ?? control.className;
		item.documentation = this.buildControlDocumentation(control);
		item.sortText = `0_${control.tagName}`;
		return item;
	}

	private buildControlDocumentation(control: ClientControlMetadata): vscode.MarkdownString | undefined {
		const sections: string[] = [];
		if (control.description) {
			sections.push(control.description);
		}

		const config = control.config;
		if (config) {
			sections.push(`**config**: \`${config.displayName}\``);
			const properties = config.definition?.properties ?? [];
			if (properties.length) {
				const lines = properties.slice(0, 20).map(prop => {
					const signature = prop.type
						? `\`${prop.name}${prop.optional ? '?' : ''}: ${prop.type}\``
						: `\`${prop.name}${prop.optional ? '?' : ''}\``;
					const description = prop.description ? ` — ${prop.description}` : '';
					return `${signature}${description}`;
				});
				sections.push(lines.join('\n'));
				if (properties.length > 20) {
					sections.push(`…${properties.length - 20} more properties`);
				}
			}
		}

		sections.push(`Defined in \
\`client-controls/${control.sourcePath}\``);

		const markdown = new vscode.MarkdownString(sections.join('\n\n'));
		markdown.isTrusted = false;
		return markdown;
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

	private createActionCompletions(screenClasses: CollectedClassInfo[]): vscode.CompletionItem[] {
		const actionMap = collectActionProperties(screenClasses);
		const items: vscode.CompletionItem[] = [];
		actionMap.forEach((property, name) => {
			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
			item.detail = property.typeName ?? 'PXActionState';
			items.push(item);
		});
		return items;
	}
}
