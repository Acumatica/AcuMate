export type SuppressionLanguage = 'html' | 'ts';

const ALL_CODES = 'all';
const NEXT_LINE_TOKEN = 'acumate-disable-next-line';
const FILE_TOKEN = 'acumate-disable-file';

type SuppressionDirective =
	| { kind: 'line'; targetLine: number; codes: Set<string> }
	| { kind: 'file'; codes: Set<string> };

export class SuppressionEngine {
	constructor(private readonly directives: SuppressionDirective[]) {}

	isSuppressed(line: number, code: string | number | { value?: string | number } | undefined): boolean {
		if (!this.directives.length) {
			return false;
		}

		const normalizedCode = normalizeCode(code);
		if (!normalizedCode) {
			return false;
		}

		for (const directive of this.directives) {
			if (directive.kind === 'file') {
				if (directive.codes.has(normalizedCode) || directive.codes.has(ALL_CODES)) {
					return true;
				}
				continue;
			}

			if (directive.targetLine !== line) {
				continue;
			}

			if (directive.codes.has(normalizedCode) || directive.codes.has(ALL_CODES)) {
				return true;
			}
		}

		return false;
	}
}

export function createSuppressionEngine(text: string, language: SuppressionLanguage): SuppressionEngine {
	const directives: SuppressionDirective[] = [];
	if (!text.length) {
		return new SuppressionEngine(directives);
	}

	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const nextLineCodes = extractCodes(lines[index], language, NEXT_LINE_TOKEN);
		if (nextLineCodes.length) {
			directives.push({ kind: 'line', targetLine: index + 1, codes: new Set(nextLineCodes) });
		}

		const fileCodes = extractCodes(lines[index], language, FILE_TOKEN);
		if (fileCodes.length) {
			directives.push({ kind: 'file', codes: new Set(fileCodes) });
		}
	}

	return new SuppressionEngine(directives);
}

function extractCodes(line: string, language: SuppressionLanguage, marker: string): string[] {
	const matches: string[] = [];
	if (!line || !line.toLowerCase().includes(marker)) {
		return matches;
	}

	if (language === 'html') {
		const regex = new RegExp(`<!--\\s*${marker}\\s+([^>]+?)-->`, 'gi');
		let match: RegExpExecArray | null;
		while ((match = regex.exec(line)) !== null) {
			matches.push(...splitCodes(match[1] ?? ''));
		}
		return matches;
	}

	const singleLine = new RegExp(`\/\/\\s*${marker}\\s+(.+)`, 'i');
	const singleMatch = singleLine.exec(line);
	if (singleMatch) {
		return splitCodes(singleMatch[1] ?? '');
	}

	const block = new RegExp(`\/\\*\\s*${marker}\\s+([^*]+)\\*\/`, 'i');
	const blockMatch = block.exec(line);
	if (blockMatch) {
		return splitCodes(blockMatch[1] ?? '');
	}

	return matches;
}

function splitCodes(raw: string): string[] {
	return raw
		.split(/[\s,]+/)
		.map(code => code.trim().toLowerCase())
		.filter(Boolean);
}

function normalizeCode(code: string | number | { value?: string | number } | undefined): string | undefined {
	if (code === undefined || code === null) {
		return undefined;
	}

	if (typeof code === 'string') {
		return code.trim().toLowerCase();
	}

	if (typeof code === 'number') {
		return String(code);
	}

	if (typeof code === 'object' && 'value' in code) {
		const value = code.value;
		if (typeof value === 'string') {
			return value.trim().toLowerCase();
		}
		if (typeof value === 'number') {
			return String(value);
		}
	}

	return undefined;
}
