import vscode from 'vscode';
import { Parser, DomHandler } from 'htmlparser2';

export interface HtmlAttributeContext {
	attributeName: string;
	value: string;
	valueRange: vscode.Range;
	tagName: string;
	node: any;
}

// Parses HTML into a DOM tree with start/end offsets so we can map caret positions.
export function parseDocumentDom(content: string): any[] | undefined {
	let domTree: any[] | undefined;
	const handler = new DomHandler(
		(error, dom) => {
			if (!error) {
				domTree = dom;
			}
		},
		{ withStartIndices: true, withEndIndices: true }
	);
	const parser = new Parser(handler, { lowerCaseAttributeNames: false, lowerCaseTags: false });
	parser.write(content);
	parser.end();
	return domTree;
}

// Finds the deepest DOM node that covers the provided offset.
export function findNodeAtOffset(dom: any[], offset: number): any | undefined {
	for (const node of dom) {
		const start = typeof node.startIndex === 'number' ? node.startIndex : undefined;
		const end = typeof node.endIndex === 'number' ? node.endIndex : undefined;
		if (start !== undefined && end !== undefined && start <= offset && offset <= end) {
			if (node.children?.length) {
				const childHit = findNodeAtOffset(node.children, offset);
				if (childHit) {
					return childHit;
				}
			}
			return node;
		}

		if (node.children?.length) {
			const descendant = findNodeAtOffset(node.children, offset);
			if (descendant) {
				return descendant;
			}
		}
	}

	return undefined;
}

// Walks up from text/attribute nodes until a tag node is found.
export function elevateToElementNode(node: any): any {
	let current: any = node;
	while (current && current.type !== 'tag') {
		current = current.parent;
	}
	return current;
}

// Determines which attribute/value the caret is in so providers know what to do.
export function getAttributeContext(document: vscode.TextDocument, offset: number, node: any): HtmlAttributeContext | undefined {
	const text = document.getText();
	let rawAttr = readAttributeAtOffset(text, offset);
	if (!rawAttr) {
		return undefined;
	}

	let attributeName = rawAttr.attributeName;
	let attributeValue = rawAttr.value;

	// htmlparser2 drops empty attribute values, so we fall back to textual parsing when necessary.
	if (!attributeName && node.attribs) {
		const inferredName = findAttributeNameFromOffset(text, rawAttr.valueStart);
		if (!inferredName) {
			return undefined;
		}
		attributeName = inferredName;
	}

	if (node.attribs?.[attributeName as string] !== undefined) {
		attributeValue = node.attribs[attributeName as string];
	}

	if (!node.attribs || node.attribs[attributeName as string] === undefined) {
		return undefined;
	}

	const valueRange = new vscode.Range(
		document.positionAt(rawAttr.valueStart),
		document.positionAt(rawAttr.valueEnd)
	);

	if (!attributeName) {
		return undefined;
	}

	return {
		attributeName,
		value: attributeValue,
		valueRange,
		tagName: node.name,
		node,
	};
}

// Backtracks from a value to infer the attribute name when the parser omitted it.
function findAttributeNameFromOffset(text: string, valueStart: number): string | undefined {
	let current = valueStart - 1;

	while (current >= 0 && text[current] !== '=') {
		if (text[current] === '<' || text[current] === '>') {
			return undefined;
		}
		current--;
	}
	if (current < 0) {
		return undefined;
	}

	current--;
	while (current >= 0 && /\s/.test(text[current])) {
		current--;
	}

	let attrNameEnd = current;
	while (current >= 0 && /[A-Za-z0-9_.:-]/.test(text[current])) {
		current--;
	}

	const attributeName = text.substring(current + 1, attrNameEnd + 1);
	return attributeName || undefined;
}

// Rough attribute parser used when htmlparser2 lacks the intermediate state we need.
export function readAttributeAtOffset(text: string, offset: number) {
	// Manual scan is more resilient to partially typed attributes than the parser output.
	const boundedOffset = Math.max(0, Math.min(offset, text.length));

	let cursor = boundedOffset;
	if (cursor === text.length) {
		cursor--;
	}
	if (cursor < 0) {
		return undefined;
	}
	// Allow caret to sit on the closing bracket when the attribute value is empty (view.bind=>).
	if (text[cursor] === '>') {
		cursor--;
	}
	while (cursor >= 0 && text[cursor] !== '=') {
		if (text[cursor] === '<' || text[cursor] === '>') {
			return undefined;
		}
		cursor--;
	}
	if (cursor < 0) {
		return undefined;
	}

	let attrNameEnd = cursor - 1;
	while (attrNameEnd >= 0 && /\s/.test(text[attrNameEnd])) {
		attrNameEnd--;
	}
	if (attrNameEnd < 0) {
		return undefined;
	}

	let attrNameStart = attrNameEnd;
	while (attrNameStart >= 0 && /[A-Za-z0-9_.:-]/.test(text[attrNameStart])) {
		attrNameStart--;
	}

	const attributeName = text.substring(attrNameStart + 1, attrNameEnd + 1);

	let valueCursor = cursor + 1;
	while (valueCursor < text.length && /\s/.test(text[valueCursor])) {
		valueCursor++;
	}

	let valueStart = valueCursor;
	let valueEnd = valueCursor;
	let value = '';

	const firstChar = text[valueCursor];
	if (firstChar === '"' || firstChar === '\'') {
		const quoteChar = firstChar;
		valueStart = valueCursor + 1;
		valueEnd = valueStart;
		while (valueEnd < text.length && text[valueEnd] !== quoteChar) {
			valueEnd++;
		}
		if (valueEnd >= text.length) {
			// Missing closing quote: treat current caret span as the temporary end.
			valueEnd = Math.max(valueStart, boundedOffset);
			value = text.substring(valueStart, valueEnd);
		} else {
			value = text.substring(valueStart, valueEnd);
		}
		if (boundedOffset < valueStart) {
			return undefined;
		}
		if (boundedOffset > valueEnd) {
			// Allow caret exactly on the closing quote
			if (boundedOffset !== valueEnd) {
				return undefined;
			}
		}
	} else {
		// Unquoted or empty attribute values (view.bind=)
		while (valueEnd < text.length && !/[\s>]/.test(text[valueEnd])) {
			valueEnd++;
		}
		value = text.substring(valueStart, valueEnd);
		if (boundedOffset < valueStart) {
			return undefined;
		}
		if (boundedOffset > valueEnd) {
			// Allow caret before the tag/space when value is empty.
			if (!(value.length === 0 && boundedOffset === valueStart)) {
				return undefined;
			}
		}
	}

	return {
		attributeName,
		value,
		valueStart,
		valueEnd,
	};
}

// Climbs ancestors until a view.bind is found, mirroring runtime scoping.
export function findParentViewName(node: any): string | undefined {
	let current: any = node?.parent ?? node?.parentNode;
	while (current) {
		const viewBinding = current.attribs?.['view.bind'];
		if (typeof viewBinding === 'string' && viewBinding.length) {
			return viewBinding;
		}

		if (current.name === 'using') {
			const usingView = current.attribs?.['view'];
			if (typeof usingView === 'string' && usingView.length) {
				return usingView;
			}
		}

		current = current.parent ?? current.parentNode;
	}
	return undefined;
}
