import fs from 'fs';
import path from 'path';
import { ClientControlsLookupOptions, getClientControlsPackageRoot } from './client-controls-service';

const templateCache = new Map<string, { mtime?: number; templates: string[] }>();

export function getScreenTemplates(options: ClientControlsLookupOptions = {}): string[] {
	const packageRoot = getClientControlsPackageRoot(options);
	if (!packageRoot) {
		return [];
	}

	const templatePath = path.join(packageRoot, 'controls', 'container', 'template', 'qp-template.js');
	if (!fs.existsSync(templatePath)) {
		return [];
	}

	const mtime = tryGetMtime(templatePath);
	const cached = templateCache.get(templatePath);
	if (cached && cached.mtime === mtime) {
		return cached.templates;
	}

	const templates = extractTemplates(templatePath);
	templateCache.set(templatePath, { mtime, templates });
	return templates;
}

function extractTemplates(filePath: string): string[] {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const results = new Set<string>();
		const regex = /ScreenTemplates\.set\(\s*(["'`])([^"'`]+?)\1\s*,/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(content))) {
			const name = match[2].trim();
			if (name) {
				results.add(name);
			}
		}
		return [...results].sort((a, b) => a.localeCompare(b));
	}
	catch {
		return [];
	}
}

function tryGetMtime(filePath: string): number | undefined {
	try {
		return fs.statSync(filePath).mtimeMs;
	}
	catch {
		return undefined;
	}
}
