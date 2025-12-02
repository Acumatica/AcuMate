import vscode from 'vscode';

const HTML_CODE = 'htmlValidator';
const TS_CODE = 'graphInfo';

export class SuppressionCodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		_token?: vscode.CancellationToken
	): vscode.CodeAction[] | undefined {
		const newline = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
		const uniqueKeys = new Set<string>();
		const actions: vscode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			const code = this.getDiagnosticCode(diagnostic);
			if (!code) {
				continue;
			}

			if (!this.supports(document.languageId, code)) {
				continue;
			}

			const key = `${code}:${diagnostic.range.start.line}`;
			if (uniqueKeys.has(key)) {
				continue;
			}
			uniqueKeys.add(key);

			const action = new vscode.CodeAction(
				'Suppress with acumate-disable-next-line',
				vscode.CodeActionKind.QuickFix
			);
			action.diagnostics = [diagnostic];
			action.edit = new vscode.WorkspaceEdit();

			const targetLine = diagnostic.range.start.line;
			const insertionPoint = new vscode.Position(targetLine, 0);
			const directive = this.buildDirective(document.languageId, code, newline);
			action.edit.insert(document.uri, insertionPoint, directive);
			actions.push(action);
		}

		return actions.length ? actions : undefined;
	}

	private buildDirective(languageId: string, code: string, newline: string): string {
		if (languageId === 'html') {
			return `<!-- acumate-disable-next-line ${code} -->${newline}`;
		}

		return `// acumate-disable-next-line ${code}${newline}`;
	}

	private getDiagnosticCode(diagnostic: vscode.Diagnostic): string | undefined {
		const code = diagnostic.code;
		if (!code) {
			return undefined;
		}

		if (typeof code === 'string') {
			return code;
		}

		if (typeof code === 'number') {
			return String(code);
		}

		if (typeof code === 'object' && 'value' in code && code.value !== undefined) {
			return typeof code.value === 'number' ? String(code.value) : `${code.value}`;
		}

		return undefined;
	}

	private supports(languageId: string, code: string): boolean {
		const normalizedCode = code.toLowerCase();
		if (languageId === 'html') {
			return normalizedCode === HTML_CODE.toLowerCase();
		}

		if (languageId === 'typescript') {
			return normalizedCode === TS_CODE.toLowerCase();
		}

		return false;
	}
}

export function registerSuppressionCodeActions(context: vscode.ExtensionContext) {
	const provider = new SuppressionCodeActionProvider();
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			[{ language: 'html', scheme: 'file' }, { language: 'typescript', scheme: 'file' }],
			provider,
			{ providedCodeActionKinds: SuppressionCodeActionProvider.providedCodeActionKinds }
		)
	);
}
