import fs from 'fs';
import path from 'path';
import { Parser, DomHandler } from 'htmlparser2';

export interface IncludeParameterMetadata {
	name: string;
	required: boolean;
	defaultValue?: string;
}

export interface IncludeMetadata {
	filePath: string;
	parameters: IncludeParameterMetadata[];
}

interface IncludeMetadataOptions {
	includeUrl: string | undefined;
	sourceHtmlPath: string;
	workspaceRoots?: string[];
}

const includeMetadataCache = new Map<string, IncludeMetadata | null>();

export function getIncludeMetadata(options: IncludeMetadataOptions): IncludeMetadata | undefined {
	const includePath = resolveIncludeFilePath(options.includeUrl, options.sourceHtmlPath, options.workspaceRoots);
	if (!includePath) {
		return undefined;
	}

	const normalizedPath = path.normalize(includePath);
	if (includeMetadataCache.has(normalizedPath)) {
		return includeMetadataCache.get(normalizedPath) ?? undefined;
	}

	const metadata = loadIncludeMetadata(normalizedPath);
	includeMetadataCache.set(normalizedPath, metadata ?? null);
	return metadata;
}

export function resolveIncludeFilePath(
	includeUrl: string | undefined,
	sourceHtmlPath: string,
	workspaceRoots?: string[]
): string | undefined {
	if (!includeUrl) {
		return undefined;
	}

	const normalizedUrl = includeUrl.replace(/\\/g, '/');
	const currentDir = path.dirname(sourceHtmlPath);

	const relativeCandidate = path.resolve(currentDir, normalizedUrl);
	if (fs.existsSync(relativeCandidate)) {
		return relativeCandidate;
	}

	let ancestorDir = path.dirname(currentDir);
	while (ancestorDir && ancestorDir !== path.dirname(ancestorDir)) {
		const ancestorCandidate = path.resolve(ancestorDir, normalizedUrl);
		if (fs.existsSync(ancestorCandidate)) {
			return ancestorCandidate;
		}
		ancestorDir = path.dirname(ancestorDir);
	}
	if (ancestorDir) {
		const rootCandidate = path.resolve(ancestorDir, normalizedUrl);
		if (fs.existsSync(rootCandidate)) {
			return rootCandidate;
		}
	}

	if (workspaceRoots?.length) {
		for (const root of workspaceRoots) {
			const candidate = path.resolve(root, normalizedUrl);
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}
	}

	const cwdCandidate = path.resolve(process.cwd(), normalizedUrl);
	if (fs.existsSync(cwdCandidate)) {
		return cwdCandidate;
	}

	if (path.isAbsolute(normalizedUrl) && fs.existsSync(normalizedUrl)) {
		return path.normalize(normalizedUrl);
	}

	return undefined;
}

export function clearIncludeMetadataCache() {
	includeMetadataCache.clear();
}

function loadIncludeMetadata(includePath: string): IncludeMetadata | undefined {
	try {
		const content = fs.readFileSync(includePath, 'utf-8');
		const parameters = extractIncludeParameters(content);
		return {
			filePath: includePath,
			parameters,
		};
	}
	catch {
		return undefined;
	}
}

function extractIncludeParameters(content: string): IncludeParameterMetadata[] {
	let domTree: any[] | undefined;
	const handler = new DomHandler(
		(error, dom) => {
			if (!error) {
				domTree = dom;
			}
		},
		{ withStartIndices: false, withEndIndices: false }
	);
	const parser = new Parser(handler, { lowerCaseAttributeNames: false, lowerCaseTags: false });
	parser.write(content);
	parser.end();

	if (!domTree) {
		return [];
	}

	const paramsNode = findIncludeParametersNode(domTree);
	if (!paramsNode?.attribs) {
		return [];
	}

	const parameterMap = new Map<string, IncludeParameterMetadata>();
	for (const rawAttrName of Object.keys(paramsNode.attribs)) {
		let parameterName = rawAttrName;
		let required = false;
		if (parameterName.endsWith('.required')) {
			required = true;
			parameterName = parameterName.slice(0, -'.required'.length);
		}

		if (!parameterName) {
			continue;
		}

		const attrValue = paramsNode.attribs[rawAttrName];
		let defaultValue: string | undefined;
		if (!required) {
			if (typeof attrValue === 'string' && attrValue.length && attrValue !== rawAttrName) {
				defaultValue = attrValue;
			}
		}

		const existing = parameterMap.get(parameterName);
		if (!existing || required) {
			parameterMap.set(parameterName, { name: parameterName, required, defaultValue });
		}
	}

	return [...parameterMap.values()];
}

function findIncludeParametersNode(dom: any[]): any | undefined {
	for (const node of dom) {
		if (node.type === 'tag' && node.name === 'qp-include-parameters') {
			return node;
		}

		if (node.children?.length) {
			const hit = findIncludeParametersNode(node.children);
			if (hit) {
				return hit;
			}
		}
	}

	return undefined;
}
