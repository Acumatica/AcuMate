import { CodeActionProvider, CodeActionKind, TextDocument, Range, CodeAction, WorkspaceEdit } from 'vscode';
import * as ts from 'typescript';

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
		// return this.getContainingClass(document, range) === 'PXScreen';
        return this.getContainingClass(document, range) === 'AM100000';
	}

    private getContainingClass(document: TextDocument, range: Range) {
        const filePath = document.uri.fsPath;
        // const cursorPosition = document.lineAt(range.start.line);
        const fileText = document.getText();

        const sourceFile = ts.createSourceFile(filePath, fileText, ts.ScriptTarget.Latest, true);

        // const languageService = ts.createLanguageService({
        //     getScriptFileNames: () => [filePath],
        //     getScriptVersion: () => '1',
        //     getScriptSnapshot: (fileName) => ts.ScriptSnapshot.fromString(fileText),
        //     getCurrentDirectory: () => vscode.workspace.rootPath || '',
        //     getCompilationSettings: () => ({ allowJs: true }),
        //     getDefaultLibFileName: ts.getDefaultLibFilePath,
        // }); 
        // const program = languageService.getProgram();
        // const sourceFile = program?.getSourceFile(filePath);

        // program?.getTypeChecker().getTypeFromTypeNode().getBaseTypes();

        const cursorOffset = document.offsetAt(range.start);
        const node = this.findNodeAtPosition(sourceFile, cursorOffset);

        if (node) {
            // check if the node is inside a class
            const classNode = this.findContainingClass(node);
            if (classNode) {
                const className = classNode.name?.getText(sourceFile);
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