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
	extractConfigPropertyNames,
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
import { getScreenTemplates } from '../services/screen-template-service';
import { getIncludeMetadata, IncludeMetadata } from '../services/include-service';

// Registers completions so HTML view bindings stay in sync with PX metadata.
export function registerHtmlCompletionProvider(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerCompletionItemProvider(
		{ language: 'html', scheme: 'file' },
		new HtmlCompletionProvider(),
		'"',
		'<',
		' '
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
		const includeCompletions = this.tryProvideIncludeCompletions(document, position, elementNode, attributeContext);
		if (includeCompletions) {
			return includeCompletions;
		}

		const templateCompletions = this.tryProvideTemplateNameCompletions(document, attributeContext);
		if (templateCompletions) {
			return templateCompletions;
		}

		const configCompletions = this.tryProvideConfigBindCompletions(document, position, elementNode, attributeContext);
		if (configCompletions) {
			return configCompletions;
		}

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

		if (attributeContext.attributeName === 'control-state.bind' && attributeContext.tagName === 'qp-field') {
			return this.createControlStateCompletions(attributeContext.value, screenClasses, classInfoLookup);
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

	private tryProvideConfigBindCompletions(
		document: vscode.TextDocument,
		position: vscode.Position,
		elementNode: any,
		attributeContext: ReturnType<typeof getAttributeContext>
	): vscode.CompletionItem[] | undefined {
		if (
			!attributeContext ||
			attributeContext.attributeName !== 'config.bind' ||
			!attributeContext.valueRange.contains(position)
		) {
			return undefined;
		}

		const currentValue = attributeContext.value ?? '';
		const trimmedValue = currentValue.trimLeft();
		if (trimmedValue && !trimmedValue.startsWith('{')) {
			return undefined;
		}

		const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath);
		const controls = getClientControlsMetadata({
			startingPath: document.uri.fsPath,
			workspaceRoots,
		});
		const control = controls.find(ctrl => ctrl.tagName === elementNode.name);
		const configDefinition = control?.config?.definition;
		if (!configDefinition) {
			return undefined;
		}

		const existingKeys = new Set(extractConfigPropertyNames(currentValue));
		const insertRange = new vscode.Range(position, position);
		const items: vscode.CompletionItem[] = [];
		for (const property of configDefinition.properties) {
			if (existingKeys.has(property.name)) {
				continue;
			}

			const item = new vscode.CompletionItem(property.name, vscode.CompletionItemKind.Property);
			item.sortText = `${property.optional ? '1' : '0'}_${property.name}`;
			item.detail = property.type ?? 'config property';
			if (property.description) {
				item.documentation = property.description;
			}
			item.range = insertRange;
			item.insertText = this.createConfigPropertySnippet(property.name, property.type);
			items.push(item);
		}

		return items.length ? items : undefined;
	}

	private createConfigPropertySnippet(name: string, type?: string): vscode.SnippetString {
		const normalizedType = type?.toLowerCase() ?? '';
		let placeholder: string;
		if (normalizedType.includes('bool')) {
			placeholder = '${1:true}';
		}
		else if (/(number|int|decimal|double|float)/.test(normalizedType)) {
			placeholder = '${1:0}';
		}
		else if (normalizedType.includes('string') || normalizedType.includes('text')) {
			placeholder = '"${1}"';
		}
		else {
			placeholder = '${1:null}';
		}
		return new vscode.SnippetString(`"${name}": ${placeholder}`);
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

	private tryProvideIncludeCompletions(
		document: vscode.TextDocument,
		position: vscode.Position,
		elementNode: any,
		attributeContext: ReturnType<typeof getAttributeContext>
	): vscode.CompletionItem[] | undefined {
		if (elementNode.name !== 'qp-include') {
			return undefined;
		}

		const includeUrl = elementNode.attribs?.url;
		if (typeof includeUrl !== 'string' || !includeUrl.length) {
			return undefined;
		}

		const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath);
		const metadata = getIncludeMetadata({
			includeUrl,
			sourceHtmlPath: document.uri.fsPath,
			workspaceRoots,
		});
		if (!metadata || metadata.parameters.length === 0) {
			return undefined;
		}

		if (!attributeContext) {
			const nameContext = this.getIncludeAttributeNameContext(document, position, elementNode);
			if (!nameContext) {
				return undefined;
			}
			return this.createIncludeAttributeCompletions(metadata, elementNode, nameContext);
		}

		return undefined;
	}

	private tryProvideTemplateNameCompletions(
		document: vscode.TextDocument,
		attributeContext: ReturnType<typeof getAttributeContext>
	): vscode.CompletionItem[] | undefined {
		if (!attributeContext || attributeContext.attributeName !== 'name' || attributeContext.tagName !== 'qp-template') {
			return undefined;
		}

		const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath);
		const templates = getScreenTemplates({ startingPath: document.uri.fsPath, workspaceRoots });
		if (!templates.length) {
			return undefined;
		}

		const prefix = (attributeContext.value ?? '').toLowerCase();
		const items: vscode.CompletionItem[] = [];
		for (const templateName of templates) {
			if (prefix && !templateName.toLowerCase().startsWith(prefix)) {
				continue;
			}
			const item = new vscode.CompletionItem(templateName, vscode.CompletionItemKind.EnumMember);
			item.detail = 'qp-template';
			items.push(item);
		}

		return items.length ? items : undefined;
	}

	private getIncludeAttributeNameContext(
		document: vscode.TextDocument,
		position: vscode.Position,
		elementNode: any
	): { prefix: string; replaceRange: vscode.Range } | undefined {
		if (typeof elementNode.startIndex !== 'number') {
			return undefined;
		}

		const offset = document.offsetAt(position);
		const text = document.getText();
		const tagStart = elementNode.startIndex;
		const tagEnd = text.indexOf('>', tagStart);
		if (tagEnd === -1 || offset > tagEnd) {
			return undefined;
		}

		if (this.isInsideAttributeValue(text, tagStart, offset)) {
			return undefined;
		}

		const segment = text.slice(tagStart, offset);
		const match = /([A-Za-z0-9_.:-]*)$/u.exec(segment);
		if (!match) {
			return undefined;
		}

		const prefix = match[1] ?? '';
		const replaceStart = offset - prefix.length;
		const replaceRange = new vscode.Range(document.positionAt(replaceStart), document.positionAt(offset));
		return { prefix, replaceRange };
	}

	private isInsideAttributeValue(text: string, tagStart: number, offset: number): boolean {
		let quote: string | undefined;
		for (let index = tagStart; index < offset; index++) {
			const char = text[index];
			if (!quote && (char === '"' || char === "'")) {
				quote = char;
				continue;
			}
			if (quote && char === quote) {
				quote = undefined;
			}
		}
		return Boolean(quote);
	}

	private createIncludeAttributeCompletions(
		metadata: IncludeMetadata,
		elementNode: any,
		context: { prefix: string; replaceRange: vscode.Range }
	): vscode.CompletionItem[] | undefined {
		const existingAttributes = new Set(Object.keys(elementNode.attribs ?? {}));
		const prefixLower = context.prefix.toLowerCase();
		const items: vscode.CompletionItem[] = [];

		for (const parameter of metadata.parameters) {
			if (existingAttributes.has(parameter.name)) {
				continue;
			}

			if (prefixLower && !parameter.name.toLowerCase().startsWith(prefixLower)) {
				continue;
			}

			const item = new vscode.CompletionItem(parameter.name, vscode.CompletionItemKind.Property);
			item.range = context.replaceRange;
			item.sortText = `${parameter.required ? '0' : '1'}_${parameter.name}`;
			item.detail = parameter.required ? 'Required include parameter' : 'Include parameter';
			if (parameter.defaultValue) {
				item.documentation = new vscode.MarkdownString(`Default: \`${parameter.defaultValue}\``);
			}

			item.insertText = this.createIncludeParameterSnippet(parameter);
			items.push(item);
		}

		return items.length ? items : undefined;
	}

	private createIncludeParameterSnippet(parameter: IncludeMetadata['parameters'][number]): vscode.SnippetString {
		const placeholder = parameter.defaultValue ? `\${1:${parameter.defaultValue}}` : '${1}';
		return new vscode.SnippetString(`${parameter.name}="${placeholder}"`);
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
		item.kind = vscode.CompletionItemKind.Class;
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

	private createControlStateCompletions(
		currentValue: string | undefined,
		screenClasses: CollectedClassInfo[],
		classInfoLookup: Map<string, CollectedClassInfo>
	): vscode.CompletionItem[] | undefined {
		const normalizedPrefix = (currentValue ?? '').trim().toLowerCase();
		const seenViews = new Set<string>();
		const seenPairs = new Set<string>();
		const items: vscode.CompletionItem[] = [];

		for (const screenClass of screenClasses) {
			for (const [propertyName, property] of screenClass.properties) {
				if ((property.kind !== 'view' && property.kind !== 'viewCollection') || seenViews.has(propertyName)) {
					continue;
				}
				seenViews.add(propertyName);
				const resolution = resolveViewBinding(propertyName, screenClasses, classInfoLookup);
				const viewClass = resolution?.viewClass;
				if (!viewClass) {
					continue;
				}

				for (const [fieldName, fieldProperty] of viewClass.properties) {
					if (fieldProperty.kind !== 'field') {
						continue;
					}
					const label = `${propertyName}.${fieldName}`;
					if (seenPairs.has(label)) {
						continue;
					}
					seenPairs.add(label);

					if (normalizedPrefix && !label.toLowerCase().startsWith(normalizedPrefix)) {
						continue;
					}

					const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
					item.detail = fieldProperty.typeName ?? 'PXFieldState';
					item.sortText = `0_${label}`;
					items.push(item);
				}
			}
		}

		return items.length ? items : undefined;
	}
}
