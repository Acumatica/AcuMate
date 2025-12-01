import fs from "fs";
import path from "path";
import { DomHandler, Parser } from "htmlparser2";
import { selectAll } from "css-select";

export interface BaseScreenDocument {
	filePath: string;
	content: string;
	dom: any[];
}

export interface SelectorQueryResult {
	nodes: any[];
	error?: string;
}

const customizationSelectorAttributes = ["before", "after", "append", "prepend", "prepand", "move"] as const;
const customizationSelectorAttributeSet = new Set<string>(
	customizationSelectorAttributes.map(attribute => attribute.toLowerCase())
);

export function isCustomizationSelectorAttribute(attributeName: string | undefined): boolean {
	if (!attributeName) {
		return false;
	}
	return customizationSelectorAttributeSet.has(attributeName.toLowerCase());
}

export function getCustomizationSelectorAttributes(): readonly string[] {
	return customizationSelectorAttributes;
}

type CachedDocument = BaseScreenDocument & { mtime?: number };

const cache = new Map<string, CachedDocument>();

export function getBaseScreenDocument(htmlFilePath: string): BaseScreenDocument | undefined {
	const baseHtmlPath = resolveBaseScreenHtmlPath(htmlFilePath);
	if (!baseHtmlPath) {
		return undefined;
	}

	const mtime = tryGetMtime(baseHtmlPath);
	const cached = cache.get(baseHtmlPath);
	if (cached && cached.mtime === mtime) {
		return cached;
	}

	try {
		const content = fs.readFileSync(baseHtmlPath, "utf-8");
		const dom = parseHtml(content);
		const entry: CachedDocument = { filePath: baseHtmlPath, content, dom, mtime };
		cache.set(baseHtmlPath, entry);
		return entry;
	}
	catch {
		return undefined;
	}
}

export function resolveBaseScreenHtmlPath(htmlFilePath: string): string | undefined {
	const normalized = path.normalize(htmlFilePath);
	const lower = normalized.toLowerCase();
	const marker = `${path.sep}extensions${path.sep}`.toLowerCase();
	const markerIndex = lower.lastIndexOf(marker);
	if (markerIndex === -1) {
		return undefined;
	}

	const screenDir = normalized.substring(0, markerIndex);
	const screenName = path.basename(screenDir);
	if (!screenName) {
		return undefined;
	}

	const candidates = [
		path.join(screenDir, `${screenName}.html`),
		path.join(screenDir, `${screenName}.htm`),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

export function queryBaseScreenElements(document: BaseScreenDocument, selector: string): SelectorQueryResult {
	const normalized = selector?.trim();
	if (!normalized) {
		return { nodes: [] };
	}

	try {
		const nodes = selectAll(normalized, document.dom);
		return { nodes };
	}
	catch (error) {
		return {
			nodes: [],
			error: error instanceof Error ? error.message : "Unknown selector error",
		};
	}
}

function parseHtml(content: string): any[] {
	let domTree: any[] = [];
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

function tryGetMtime(targetPath: string): number | undefined {
	try {
		return fs.statSync(targetPath).mtimeMs;
	}
	catch {
		return undefined;
	}
}
