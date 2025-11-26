import vscode from "vscode";
import { Parser, DomHandler } from "htmlparser2";
import {
  getLineAndColumnFromIndex,
  CollectedClassInfo,
  ViewResolution,
  resolveViewBinding,
  createClassInfoLookup,
  getRelatedTsFiles,
  loadClassInfosFromFiles,
  filterScreenLikeClasses,
} from "../../utils";
import { findParentViewName } from "../../providers/html-shared";

// The validator turns the TypeScript model into CollectedClassInfo entries for every PXScreen/PXView
// and then uses that metadata when validating the HTML DOM.
import { AcuMateContext } from "../../plugin-context";

// Entrypoint invoked by the extension whenever an HTML file should be validated.
export async function validateHtmlFile(document: vscode.TextDocument) {
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = document.uri.fsPath;
  const content = document.getText();

  const tsFilePaths = getRelatedTsFiles(filePath);
  if (!tsFilePaths.length) {
    return;
  }

  // Each CollectedClassInfo entry represents a TypeScript class along with a map of its
  // properties (PXActionState, PXView, PXViewCollection, PXFieldState) including inherited ones.
  const classProperties = loadClassInfosFromFiles(tsFilePaths);

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

// Traverses the DOM tree, resolving view bindings to PXView classes so we can validate
// qp-fieldset nodes and their child field nodes against the TypeScript metadata.
function validateDom(
  dom: any[],
  diagnostics: vscode.Diagnostic[],
  classProperties: CollectedClassInfo[],
  content: string
) {
  const classInfoMap = createClassInfoLookup(classProperties);
  const screenClasses = filterScreenLikeClasses(classProperties);
  const viewResolutionCache = new Map<string, ViewResolution | undefined>();

  // Screen classes contain PXView and PXViewCollection properties. We cache resolutions so
  // repeated use of the same view name does not require scanning every screen class again.
  function resolveView(viewName: string | undefined): ViewResolution | undefined {
    if (!viewName) {
      return undefined;
    }

    if (viewResolutionCache.has(viewName)) {
      return viewResolutionCache.get(viewName);
    }

    const resolution = resolveViewBinding(viewName, screenClasses, classInfoMap);
    viewResolutionCache.set(viewName, resolution);
    return resolution;
  }

  // Custom validation logic goes here
  dom.forEach((node) => {
    if (
      node.type === "tag" &&
      node.name === "qp-fieldset" &&
      node.attribs[`view.bind`]
    ) {
      const viewName = node.attribs[`view.bind`];
      const viewResolution = resolveView(viewName);
      const hasValidView =
        viewResolution &&
        viewResolution.property.viewClassName &&
        viewResolution.viewClass &&
        viewResolution.viewClass.type === "PXView";

      if (!hasValidView) {
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

    if (node.type === "tag" && node.name === "using" && node.attribs.view) {
      const viewName = node.attribs.view;
      const viewResolution = resolveView(viewName);
      const hasValidView =
        viewResolution &&
        viewResolution.property.viewClassName &&
        viewResolution.viewClass &&
        viewResolution.viewClass.type === "PXView";

      if (!hasValidView) {
        const range = getRange(content, node);
        const diagnostic: vscode.Diagnostic = {
          severity: vscode.DiagnosticSeverity.Warning,
          range,
          message: "The <using> element must reference a valid view.",
          source: "htmlValidator",
        };
        diagnostics.push(diagnostic);
      }
    }

    if (node.type === "tag" && node.name === "field" && node.attribs.name) {
      const viewname = findParentViewName(node);
      const fieldName = node.attribs.name;
      const viewResolution = resolveView(viewname);
      const viewClass = viewResolution?.viewClass;
      const fieldProperty = viewClass?.properties.get(fieldName);
      const isValidField = fieldProperty?.kind === "field";
      if (!isValidField) {
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

// Converts parser indices into VS Code ranges for diagnostics.
function getRange(content: string, node: any) {
  const startPosition = getLineAndColumnFromIndex(content, node.startIndex);
  const endPosition = getLineAndColumnFromIndex(content, node.endIndex);

  const range = new vscode.Range(
    new vscode.Position(startPosition.line, startPosition.column),
    new vscode.Position(endPosition.line, endPosition.column)
  );
  return range;
}
