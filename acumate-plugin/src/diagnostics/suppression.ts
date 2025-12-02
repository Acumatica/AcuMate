export type SuppressionLanguage = 'html' | 'ts';

const ALL_CODES = 'all';

interface SuppressionDirective {
	targetLine: number;
	codes: Set<string>;
}

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
		const codes = extractCodes(lines[index], language);
		if (!codes.length) {
			continue;
		}

		directives.push({
			targetLine: index + 1,
			codes: new Set(codes),
		});
	}

	return new SuppressionEngine(directives);
}

function extractCodes(line: string, language: SuppressionLanguage): string[] {
	const matches: string[] = [];
	if (!line || !line.toLowerCase().includes('acumate-disable-next-line')) {
		return matches;
	}

	if (language === 'html') {
		const regex = /<!--\s*acumate-disable-next-line\s+([^>]+?)-->/gi;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(line)) !== null) {
			matches.push(...splitCodes(match[1] ?? ''));
		}
		return matches;
	}

	const singleLine = /\/\/\s*acumate-disable-next-line\s+(.+)/i;
	const singleMatch = singleLine.exec(line);
	if (singleMatch) {
		return splitCodes(singleMatch[1] ?? '');
	}

	const block = /\/\*\s*acumate-disable-next-line\s+([^*]+)\*\//i;
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
