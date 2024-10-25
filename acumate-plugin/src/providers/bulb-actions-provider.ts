import { CodeActionProvider, CodeActionKind, TextDocument, Range, CodeAction, WorkspaceEdit } from 'vscode';
import * as ts from 'typescript';
import * as fs from 'fs';

export class BulbActionsProvider implements CodeActionProvider {

	public static readonly providedCodeActionKinds = [
		CodeActionKind.QuickFix
	];

	public provideCodeActions(document: TextDocument, range: Range): CodeAction[] | undefined {
		if (!this.isInsidePXScreen(document, range)) {
			return;
		}

		const eventCode = 'eventCodeWillBeHere';

		const addEventHook = this.createFix(document, range, 'event hook', eventCode);

		// const commandAction = this.createCommand();

		return [
			addEventHook,
			// commandAction
		];
	}

	private createFix(document: TextDocument, range: Range, name: string, code: string): CodeAction {
		const fix = new CodeAction(`Insert ${name}`, CodeActionKind.QuickFix);
		fix.edit = new WorkspaceEdit();
		fix.edit.replace(document.uri, new Range(range.start, range.start.translate(0, 2)), code);
		return fix;
	}

	private isInsidePXScreen(document: TextDocument, range: Range) {
		return this.getContainingClass(document, range) === 'PXScreen';
	}

    private getContainingClass(document: TextDocument, range: Range) {
        const filePath = document.uri.fsPath;
        const fileText = document.getText();

        // const sourceFile = ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest, true);

        const servicesHost: ts.LanguageServiceHost = {
            getScriptFileNames: () => [filePath],
            getScriptVersion: () => '1',
            getScriptSnapshot: (fileName) => ts.ScriptSnapshot.fromString(fileText),
            getCurrentDirectory: () => process.cwd(),
            getCompilationSettings: () => ({ allowJs: true }),
            getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
            fileExists: fileName => fs.existsSync(fileName),
            readFile: fileName => JSON.parse(fs.readFileSync(fileName).toString()),
        };

        const languageService = ts.createLanguageService(servicesHost);
        const program = languageService.getProgram();
        const sourceFile = program?.getSourceFile(filePath);
        
        const cursorOffset = document.offsetAt(range.start);
        const node = this.findNodeAtPosition(sourceFile!, cursorOffset);
        
        if (node) {
            const classNode = this.findContainingClass(node);
            if (classNode) {
                const className = classNode.name?.getText(sourceFile);
                program?.getTypeChecker().getTypeAtLocation(classNode).getBaseTypes();
                return className;
            }
            return undefined;
        }
    }

    private findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | null {
        let foundNode: ts.Node | null = null;

        function findNode(node: ts.Node) {
            if (position >= node.getStart() && position < node.getEnd()) {
                foundNode = node;
                ts.forEachChild(node, findNode); // Recursively check child nodes
            }
        }

        findNode(sourceFile);
        return foundNode;
    }

    private findContainingClass(node: ts.Node): ts.ClassDeclaration | null {
        while (node) {
            if (ts.isClassDeclaration(node)) {
                return node as ts.ClassDeclaration;
            }
            node = node.parent; // Walk up the tree
        }
        return null;
    }

	// private createCommand(): CodeAction {
	// 	const action = new CodeAction('Learn more...', CodeActionKind.Empty);
	// 	action.command = { command: COMMAND, title: 'Learn more about emojis', tooltip: 'This will open the unicode emoji page.' };
	// 	return action;
	// }
}