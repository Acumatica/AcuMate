import vscode from "vscode";
import { Parser, DomHandler } from "htmlparser2";
const fs = require(`fs`);
import {
  getClassPropertiesFromTs,
  getCorrespondingTsFile,
  getLineAndColumnFromIndex,
} from "../../utils";
import { AcuMateContext } from "../../plugin-context";

export async function validateHtmlFile(document: vscode.TextDocument) {
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = document.uri.fsPath;
  const content = document.getText();

  const tsFilePath = getCorrespondingTsFile(filePath);
  if (!tsFilePath) {
    return;
  }

  const tsContent = fs.readFileSync(tsFilePath, "utf-8");

  const classProperties = getClassPropertiesFromTs(tsContent, tsFilePath);

  // Parse the HTML content
  const handler = new DomHandler(
    (error, dom): void => {
      if (error) {
        const diagnostic = {
          severity: vscode.DiagnosticSeverity.Error,
          range: new vscode.Range(0, 0, 0, 0),
          message: `Parsing error: ${error.message}`,
          source: "htmlValidator",
        };
        diagnostics.push(diagnostic);
      } else {
        // Custom validation logic
        // Custom validation logic goes here
        validateDom(dom, diagnostics, classProperties, content);
      }
    },
    {
      withEndIndices: true,
      withStartIndices: true,
    }
  );

  const parser = new Parser(handler);
  parser.write(content);
  parser.end();

  // Report diagnostics back to VS Code
  AcuMateContext.HtmlValidator.set(document.uri, diagnostics);
}

function validateDom(
  dom: any[],
  diagnostics: vscode.Diagnostic[],
  classProperties: {
    className: string;
    type: "PXScreen" | "PXView";
    properties: Set<string>;
  }[],
  content: string
) {
  // Custom validation logic goes here
  dom.forEach((node) => {
    if (
      node.type === "tag" &&
      node.name === "qp-fieldset" &&
      node.attribs[`view.bind`]
    ) {
      const viewname = node.attribs[`view.bind`];
      const properiesSet = classProperties
        .filter((it) => it.type === "PXScreen")
        .flatMap((it) => it.properties)
        .find((it) => it.has(viewname));
      if (!properiesSet) {
        const range = getRange(content, node);
        const diagnostic: vscode.Diagnostic = {
          severity: vscode.DiagnosticSeverity.Warning,
          range: range,
          message: "The <qp-fieldset> element must be bound to a valid view.",
          source: "htmlValidator",
        };
        diagnostics.push(diagnostic);
      }
    }

    if (node.type === "tag" && node.name === "field" && node.attribs.name) {
      const viewname = node.parentNode.attribs[`view.bind`];
      var fieldName = node.attribs.name;
      const properiesSet = classProperties
        .filter((it) => it.type === "PXView")
        .flatMap((it) => it.properties)
        .find((it) => it.has(fieldName));
      if (!properiesSet) {
        const range = getRange(content, node);
        const diagnostic = {
          severity: vscode.DiagnosticSeverity.Warning,
          range: range,
          message: "The <field> element must be bound to the valid field.",
          source: "htmlValidator",
        };
        diagnostics.push(diagnostic);
      }
    }
    // Recursively validate child nodes
    if ((<any>node).children) {
      validateDom((<any>node).children, diagnostics, classProperties, content);
    }
  });
}

function getRange(content: string, node: any) {
  const startPosition = getLineAndColumnFromIndex(content, node.startIndex);
  const endPosition = getLineAndColumnFromIndex(content, node.endIndex);

  const range = new vscode.Range(
    new vscode.Position(startPosition.line, startPosition.column),
    new vscode.Position(endPosition.line, endPosition.column)
  );
  return range;
}
