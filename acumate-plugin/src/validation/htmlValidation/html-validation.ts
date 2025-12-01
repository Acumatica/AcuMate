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
  collectActionProperties,
  parseConfigObject,
} from "../../utils";
import { findParentViewName } from "../../providers/html-shared";
import { getIncludeMetadata } from "../../services/include-service";
import { getScreenTemplates } from "../../services/screen-template-service";
import { getClientControlsMetadata, ClientControlMetadata } from "../../services/client-controls-service";

// The validator turns the TypeScript model into CollectedClassInfo entries for every PXScreen/PXView
// and then uses that metadata when validating the HTML DOM.
import { AcuMateContext } from "../../plugin-context";

const includeIntrinsicAttributes = new Set(["id", "class", "style", "slot"]);

// Entrypoint invoked by the extension whenever an HTML file should be validated.
export async function validateHtmlFile(document: vscode.TextDocument) {
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = document.uri.fsPath;
  const content = document.getText();

  const tsFilePaths = getRelatedTsFiles(filePath);

  // Each CollectedClassInfo entry represents a TypeScript class along with a map of its
  // properties (PXActionState, PXView, PXViewCollection, PXFieldState) including inherited ones.
  const classProperties = tsFilePaths.length ? loadClassInfosFromFiles(tsFilePaths) : [];

  // Parse the HTML content
  const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath);
  const screenTemplateNames = new Set(
    getScreenTemplates({ startingPath: filePath, workspaceRoots })
  );
  const controlMetadata = new Map(
    getClientControlsMetadata({ startingPath: filePath, workspaceRoots }).map((control) => [control.tagName, control])
  );

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
        validateDom(
          dom,
          diagnostics,
          classProperties,
          content,
          filePath,
          workspaceRoots,
          screenTemplateNames,
          controlMetadata
        );
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
  content: string,
  htmlFilePath: string,
  workspaceRoots: string[] | undefined,
  screenTemplateNames: Set<string>,
  controlMetadata: Map<string, ClientControlMetadata>
) {
  const classInfoMap = createClassInfoLookup(classProperties);
  const screenClasses = filterScreenLikeClasses(classProperties);
  const actionLookup = collectActionProperties(screenClasses);
  const hasScreenMetadata = screenClasses.length > 0;
  const canValidateActions = classProperties.length > 0;
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
      hasScreenMetadata &&
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

    if (hasScreenMetadata && node.type === "tag" && node.name === "using" && node.attribs.view) {
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

    const actionBinding = node.attribs?.["state.bind"];
    if (canValidateActions && typeof actionBinding === "string" && actionBinding.length) {
      if (!actionLookup.has(actionBinding)) {
        const range = getRange(content, node);
        const diagnostic: vscode.Diagnostic = {
          severity: vscode.DiagnosticSeverity.Warning,
          range,
          message: "The state.bind attribute must reference a valid PXAction.",
          source: "htmlValidator",
        };
        diagnostics.push(diagnostic);
      }
    }

    if (node.type === "tag" && node.name === "qp-include") {
      validateIncludeNode(node, diagnostics, content, htmlFilePath, workspaceRoots);
    }

    if (
      node.type === "tag" &&
      node.name === "qp-template" &&
      typeof node.attribs?.name === "string" &&
      node.attribs.name.length
    ) {
      validateTemplateName(node.attribs.name, node);
    }

    if (
      hasScreenMetadata &&
      node.type === "tag" &&
      node.name === "qp-field" &&
      typeof node.attribs?.["control-state.bind"] === "string" &&
      node.attribs["control-state.bind"].length
    ) {
      validateControlStateBinding(node.attribs["control-state.bind"], node);
    }

    if (
      node.type === "tag" &&
      typeof node.attribs?.["config.bind"] === "string" &&
      node.attribs["config.bind"].length
    ) {
      validateConfigBinding(node.attribs["config.bind"], node);
    }

    if (
      hasScreenMetadata &&
      node.type === "tag" &&
      node.name === "field" &&
      node.attribs.name
    ) {
      const viewSpecified = node.attribs.name.includes(".");
      const [viewFromNameAttribute, fieldFromNameAttribute] = viewSpecified ? node.attribs.name.split(".") : [];
      

      const isUnboundReplacement =
        Object.prototype.hasOwnProperty.call(node.attribs, "unbound") &&
        Object.prototype.hasOwnProperty.call(node.attribs, "replace-content");

      if (!isUnboundReplacement) {
        const viewname = viewSpecified ? viewFromNameAttribute : findParentViewName(node);
        const fieldName = viewSpecified ? fieldFromNameAttribute : node.attribs.name;
        const viewResolution = resolveView(viewname);
        const viewClass = viewResolution?.viewClass;
        const fieldProperty = viewClass?.properties.get(fieldName);
        const isValidField = fieldProperty?.kind === "field";
        if (!isValidField) {
          const range = getRange(content, node);
          const diagnostic = {
            severity: vscode.DiagnosticSeverity.Warning,
            range: range,
            message: "The <field> element must be bound to a valid field.",
            source: "htmlValidator",
          };
          diagnostics.push(diagnostic);
        }
      }
    }
    // Recursively validate child nodes
    if ((<any>node).children) {
      validateDom(
        (<any>node).children,
        diagnostics,
        classProperties,
        content,
        htmlFilePath,
        workspaceRoots,
        screenTemplateNames,
        controlMetadata
      );
    }
  });
  function validateTemplateName(templateName: string, node: any) {
    if (!screenTemplateNames.size) {
      return;
    }

    if (!screenTemplateNames.has(templateName)) {
      const range = getRange(content, node);
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: `The qp-template name "${templateName}" is not one of the predefined screen templates.`,
        source: "htmlValidator",
      });
    }
  }

  function validateConfigBinding(bindingValue: string, node: any) {
    const trimmed = bindingValue.trim();
    if (!trimmed.startsWith("{")) {
      return;
    }

    const control = controlMetadata.get(node.name);
    const definition = control?.config?.definition;
    if (!definition) {
      return;
    }

    const configObject = parseConfigObject(bindingValue);
    const range = getRange(content, node);
    if (!configObject) {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: `The ${node.name} config.bind value must be valid JSON matching ${definition.typeName}.`,
        source: "htmlValidator",
      });
      return;
    }

    const providedKeys = new Set(Object.keys(configObject));
    for (const property of definition.properties) {
      if (!property.optional && !providedKeys.has(property.name)) {
        diagnostics.push({
          severity: vscode.DiagnosticSeverity.Warning,
          range,
          message: `The ${node.name} config.bind is missing required property "${property.name}".`,
          source: "htmlValidator",
        });
      }
    }

    for (const key of providedKeys) {
      if (!definition.properties.some((property) => property.name === key)) {
        diagnostics.push({
          severity: vscode.DiagnosticSeverity.Warning,
          range,
          message: `The ${node.name} config.bind property "${key}" is not defined by ${definition.typeName}.`,
          source: "htmlValidator",
        });
      }
    }
  }


  function validateControlStateBinding(bindingValue: string, node: any) {
    const parts = bindingValue.split(".");
    const range = getRange(content, node);
    if (parts.length !== 2) {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: "The control-state.bind attribute must use the <view>.<field> format.",
        source: "htmlValidator",
      });
      return;
    }

    const viewName = parts[0]?.trim();
    const fieldName = parts[1]?.trim();
    if (!viewName || !fieldName) {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: "The control-state.bind attribute must include both a view and field name.",
        source: "htmlValidator",
      });
      return;
    }

    const viewResolution = resolveView(viewName);
    const viewClass = viewResolution?.viewClass;
    if (!viewClass) {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: `The control-state.bind attribute references unknown view "${viewName}".`,
        source: "htmlValidator",
      });
      return;
    }

    const fieldProperty = viewClass.properties.get(fieldName);
    if (!fieldProperty || fieldProperty.kind !== "field") {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: `The control-state.bind attribute references unknown field "${fieldName}" on view "${viewName}".`,
        source: "htmlValidator",
      });
    }
  }
}

function validateIncludeNode(
  node: any,
  diagnostics: vscode.Diagnostic[],
  content: string,
  htmlFilePath: string,
  workspaceRoots: string[] | undefined
) {
  const includeUrl = node.attribs?.url;
  if (typeof includeUrl !== "string" || !includeUrl.length) {
    return;
  }

  const metadata = getIncludeMetadata({
    includeUrl,
    sourceHtmlPath: htmlFilePath,
    workspaceRoots,
  });
  if (!metadata || metadata.parameters.length === 0) {
    return;
  }

  const range = getRange(content, node);
  const providedAttributes = node.attribs ?? {};
  const parameterMap = new Map(metadata.parameters.map((param) => [param.name, param]));

  for (const parameter of metadata.parameters) {
    if (parameter.required && !Object.prototype.hasOwnProperty.call(providedAttributes, parameter.name)) {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: `The qp-include is missing required parameter "${parameter.name}".`,
        source: "htmlValidator",
      });
    }
  }

  for (const attributeName of Object.keys(providedAttributes)) {
    if (attributeName === "url" || shouldIgnoreIncludeAttribute(attributeName)) {
      continue;
    }

    if (!parameterMap.has(attributeName)) {
      diagnostics.push({
        severity: vscode.DiagnosticSeverity.Warning,
        range,
        message: `The qp-include attribute "${attributeName}" is not defined by the include template.`,
        source: "htmlValidator",
      });
    }
  }
}

function shouldIgnoreIncludeAttribute(attributeName: string): boolean {
  if (!attributeName) {
    return true;
  }

  if (includeIntrinsicAttributes.has(attributeName)) {
    return true;
  }

  if (attributeName.startsWith("data-") || attributeName.startsWith("aria-")) {
    return true;
  }

  if (attributeName.includes(".")) {
    return true;
  }

  return false;
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
