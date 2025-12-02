import path from "path";
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
  filterClassesBySource,
} from "../../utils";
import { findParentViewName } from "../../providers/html-shared";
import { getIncludeMetadata } from "../../services/include-service";
import { getScreenTemplates } from "../../services/screen-template-service";
import { getClientControlsMetadata, ClientControlMetadata } from "../../services/client-controls-service";
import {
  getBaseScreenDocument,
  isCustomizationSelectorAttribute,
  queryBaseScreenElements,
  BaseScreenDocument,
  getCustomizationSelectorAttributes,
} from "../../services/screen-html-service";

// The validator turns the TypeScript model into CollectedClassInfo entries for every PXScreen/PXView
// and then uses that metadata when validating the HTML DOM.
import { AcuMateContext } from "../../plugin-context";
import { createSuppressionEngine, SuppressionEngine } from "../../diagnostics/suppression";

const includeIntrinsicAttributes = new Set(["id", "class", "style", "slot"]);

function pushHtmlDiagnostic(
  diagnostics: vscode.Diagnostic[],
  suppression: SuppressionEngine,
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Warning
) {
  if (suppression.isSuppressed(range.start.line, "htmlValidator")) {
    return;
  }

  diagnostics.push({
    severity,
    range,
    message,
    source: "htmlValidator",
    code: "htmlValidator",
  });
}

// Entrypoint invoked by the extension whenever an HTML file should be validated.
export async function validateHtmlFile(document: vscode.TextDocument) {
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = document.uri.fsPath;
  const content = document.getText();
  const suppression = createSuppressionEngine(content, "html");

  const tsFilePaths = getRelatedTsFiles(filePath);

  // Each CollectedClassInfo entry represents a TypeScript class along with a map of its
  // properties (PXActionState, PXView, PXViewCollection, PXFieldState) including inherited ones.
  const classProperties = tsFilePaths.length ? loadClassInfosFromFiles(tsFilePaths) : [];
  const relevantClassInfos = filterClassesBySource(classProperties, tsFilePaths);

  // Parse the HTML content
  const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath);
  const screenTemplateNames = new Set(
    getScreenTemplates({ startingPath: filePath, workspaceRoots })
  );
  const controlMetadata = new Map(
    getClientControlsMetadata({ startingPath: filePath, workspaceRoots }).map((control) => [control.tagName.toLowerCase(), control])
  );
  const baseScreenDocument = getBaseScreenDocument(filePath);

  const handler = new DomHandler(
    (error, dom): void => {
      if (error) {
        const range = new vscode.Range(0, 0, 0, 0);
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          `Parsing error: ${error.message}`,
          vscode.DiagnosticSeverity.Error
        );
      } else {
        // Custom validation logic
        // Custom validation logic goes here
        validateDom(
          dom,
          diagnostics,
          classProperties,
          relevantClassInfos,
          content,
          filePath,
          workspaceRoots,
          screenTemplateNames,
          controlMetadata,
          baseScreenDocument,
          suppression,
          undefined
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
  relevantClassInfos: CollectedClassInfo[],
  content: string,
  htmlFilePath: string,
  workspaceRoots: string[] | undefined,
  screenTemplateNames: Set<string>,
  controlMetadata: Map<string, ClientControlMetadata>,
  baseScreenDocument: BaseScreenDocument | undefined,
  suppression: SuppressionEngine,
  panelViewContext?: CollectedClassInfo
) {
  const classInfoMap = createClassInfoLookup(classProperties);
  const screenClasses = filterScreenLikeClasses(relevantClassInfos);
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
    let nextPanelViewContext = panelViewContext;
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
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          "The <qp-fieldset> element must be bound to a valid view."
        );
      }
    }

    if (hasScreenMetadata && node.type === "tag" && node.name === "qp-panel") {
      const panelId = typeof node.attribs?.id === "string" ? node.attribs.id.trim() : "";
      if (panelId.length) {
        const viewResolution = resolveView(panelId);
        if (!viewResolution) {
          const range = getRange(content, node);
          pushHtmlDiagnostic(
            diagnostics,
            suppression,
            range,
            "The <qp-panel> id must reference a valid view."
          );
        } else if (viewResolution.viewClass) {
          nextPanelViewContext = viewResolution.viewClass;
        }
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
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          "The <using> element must reference a valid view."
        );
      }
    }

    const actionBinding = node.attribs?.["state.bind"];
    if (canValidateActions && typeof actionBinding === "string" && actionBinding.length) {
      const panelHasAction = panelViewContext?.properties.get(actionBinding)?.kind === "action";
      if (!actionLookup.has(actionBinding) && !panelHasAction) {
        const range = getRange(content, node);
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          "The state.bind attribute must reference a valid PXAction."
        );
      }
    }

    if (node.type === "tag" && node.name === "qp-include") {
      validateIncludeNode(node, diagnostics, content, htmlFilePath, workspaceRoots, suppression);
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

    if (node.type === "tag" && node.name === "field") {
      validateFieldCustomizationSelectors(node);
    }

    if (
      node.type === "tag" &&
      (node.name === "field" || node.name === "qp-field") &&
      typeof node.attribs?.["control-type"] === "string"
    ) {
      validateControlTypeAttribute(node);
    }

    if (
      hasScreenMetadata &&
      node.type === "tag" &&
      node.name === "field" &&
      node.attribs.name
    ) {
      const isUnboundReplacement =
        Object.prototype.hasOwnProperty.call(node.attribs, "unbound") &&
        Object.prototype.hasOwnProperty.call(node.attribs, "replace-content");

      if (!isUnboundReplacement) {
        let viewName = findParentViewName(node);
        if (!viewName) {
          viewName = getViewNameFromCustomizationSelectors(node);
        }
        const fieldName = node.attribs.name;
        const viewResolution = resolveView(viewName);
        const viewClass = viewResolution?.viewClass;
        const fieldProperty = viewClass?.properties.get(fieldName);
        const isValidField = fieldProperty?.kind === "field";
        if (!isValidField) {
          const range = getRange(content, node);
          pushHtmlDiagnostic(
            diagnostics,
            suppression,
            range,
            viewName
              ? `The field "${fieldName}" is not defined on view "${viewName}".`
              : "The <field> element must be bound to the valid field."
          );
        }
      }
    }
    // Recursively validate child nodes
    if ((<any>node).children) {
      validateDom(
        (<any>node).children,
        diagnostics,
        classProperties,
        relevantClassInfos,
        content,
        htmlFilePath,
        workspaceRoots,
        screenTemplateNames,
        controlMetadata,
        baseScreenDocument,
        suppression,
        nextPanelViewContext
      );
    }
  });
  function validateTemplateName(templateName: string, node: any) {
    if (!screenTemplateNames.size) {
      return;
    }

    if (!screenTemplateNames.has(templateName)) {
      const range = getRange(content, node);
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The qp-template name "${templateName}" is not one of the predefined screen templates.`
      );
    }
  }

  function validateFieldCustomizationSelectors(node: any) {
    if (!baseScreenDocument) {
      return;
    }

    forEachCustomizationSelector(node, (attributeName, rawValue, normalizedValue) => {
      const range =
        getAttributeValueRange(content, node, attributeName, rawValue) ?? getRange(content, node);
      const { nodes, error } = queryBaseScreenElements(baseScreenDocument, normalizedValue);
      if (error) {
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          `The ${attributeName} selector "${rawValue}" is not a valid CSS selector (${error}).`
        );
        return;
      }

      if (!nodes.length) {
        const baseName = path.basename(baseScreenDocument.filePath);
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          `The ${attributeName} selector "${rawValue}" does not match any elements in ${baseName}.`
        );
      }
    });
  }

  function getViewNameFromCustomizationSelectors(node: any): string | undefined {
    if (!baseScreenDocument) {
      return undefined;
    }

    let selectorViewName: string | undefined;
    forEachCustomizationSelector(node, (_attributeName, _rawValue, normalizedValue) => {
      if (selectorViewName) {
        return;
      }

      const { nodes, error } = queryBaseScreenElements(baseScreenDocument, normalizedValue);
      if (error || !nodes.length) {
        return;
      }

      for (const target of nodes) {
        const candidateViewName = findParentViewName(target);
        if (candidateViewName) {
          selectorViewName = candidateViewName;
          return;
        }
      }
    });

    return selectorViewName;
  }

  function forEachCustomizationSelector(
    node: any,
    callback: (attributeName: string, rawValue: string, normalizedValue: string) => void
  ) {
    if (!node?.attribs) {
      return;
    }

    for (const [attributeName, attributeValue] of Object.entries(node.attribs)) {
      if (!isCustomizationSelectorAttribute(attributeName) || typeof attributeValue !== "string") {
        continue;
      }

      const normalizedValue = attributeValue.trim();
      if (!normalizedValue.length) {
        continue;
      }

      callback(attributeName, attributeValue, normalizedValue);
    }
  }

  function validateConfigBinding(bindingValue: string, node: any) {
    const trimmed = bindingValue.trim();
    if (!trimmed.startsWith("{")) {
      return;
    }

    const controlName = typeof node.name === "string" ? node.name.toLowerCase() : undefined;
    const control = controlName ? controlMetadata.get(controlName) : undefined;
    const definition = control?.config?.definition;
    if (!definition) {
      return;
    }

    const configObject = parseConfigObject(bindingValue);
    const range = getRange(content, node);
    if (!configObject) {
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The ${node.name} config.bind value must be valid object matching ${definition.typeName}.`
      );
      return;
    }

    const providedKeys = new Set(Object.keys(configObject));
    for (const property of definition.properties) {
      if (!property.optional && !providedKeys.has(property.name)) {
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          `The ${node.name} config.bind is missing required property "${property.name}".`
        );
      }
    }

    for (const key of providedKeys) {
      if (!definition.properties.some((property) => property.name === key)) {
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          `The ${node.name} config.bind property "${key}" is not defined by ${definition.typeName}.`
        );
      }
    }
  }

  function validateControlTypeAttribute(node: any) {
    if (!controlMetadata.size) {
      return;
    }

    const rawValue = node.attribs?.["control-type"];
    if (typeof rawValue !== "string") {
      return;
    }

    const normalizedValue = rawValue.trim();
    if (!normalizedValue.length) {
      return;
    }

    const metadata = controlMetadata.get(normalizedValue.toLowerCase());
    if (metadata) {
      return;
    }

    const range =
      getAttributeValueRange(content, node, "control-type", rawValue) ?? getRange(content, node);
    pushHtmlDiagnostic(
      diagnostics,
      suppression,
      range,
      `The control-type value "${normalizedValue}" does not match any known qp-controls.`
    );
  }


  function validateControlStateBinding(bindingValue: string, node: any) {
    const parts = bindingValue.split(".");
    const range = getRange(content, node);
    if (parts.length !== 2) {
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        "The control-state.bind attribute must use the <view>.<field> format."
      );
      return;
    }

    const viewName = parts[0]?.trim();
    const fieldName = parts[1]?.trim();
    if (!viewName || !fieldName) {
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        "The control-state.bind attribute must include both a view and field name."
      );
      return;
    }

    const viewResolution = resolveView(viewName);
    const viewClass = viewResolution?.viewClass;
    if (!viewClass) {
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The control-state.bind attribute references unknown view "${viewName}".`
      );
      return;
    }

    const fieldProperty = viewClass.properties.get(fieldName);
    if (!fieldProperty || fieldProperty.kind !== "field") {
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The control-state.bind attribute references unknown field "${fieldName}" on view "${viewName}".`
      );
    }
  }
}

function validateIncludeNode(
  node: any,
  diagnostics: vscode.Diagnostic[],
  content: string,
  htmlFilePath: string,
  workspaceRoots: string[] | undefined,
  suppression: SuppressionEngine
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
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The qp-include is missing required parameter "${parameter.name}".`
      );
    }
  }

  for (const attributeName of Object.keys(providedAttributes)) {
    if (attributeName === "url" || shouldIgnoreIncludeAttribute(attributeName)) {
      continue;
    }

    if (!parameterMap.has(attributeName)) {
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The qp-include attribute "${attributeName}" is not defined by the include template.`
      );
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

function getAttributeValueRange(
  content: string,
  node: any,
  attributeName: string,
  attributeValue: string
): vscode.Range | undefined {
  if (typeof node.startIndex !== "number" || typeof node.endIndex !== "number") {
    return undefined;
  }

  const sliceStart = node.startIndex;
  const sliceEnd = node.endIndex;
  const slice = content.substring(sliceStart, sliceEnd + 1);
  const lowerSlice = slice.toLowerCase();
  const lowerAttr = attributeName.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < lowerSlice.length) {
    const attrIndex = lowerSlice.indexOf(lowerAttr, searchIndex);
    if (attrIndex === -1) {
      break;
    }

    const precedingChar = attrIndex > 0 ? lowerSlice[attrIndex - 1] : undefined;
    if (precedingChar && /[A-Za-z0-9_.:-]/.test(precedingChar)) {
      searchIndex = attrIndex + lowerAttr.length;
      continue;
    }

    let cursor = attrIndex + lowerAttr.length;
    while (cursor < slice.length && /\s/.test(slice[cursor])) {
      cursor++;
    }

    if (cursor >= slice.length || slice[cursor] !== "=") {
      searchIndex = attrIndex + lowerAttr.length;
      continue;
    }

    cursor++;
    while (cursor < slice.length && /\s/.test(slice[cursor])) {
      cursor++;
    }

    if (cursor >= slice.length) {
      break;
    }

    let valueStart = cursor;
    let valueEnd = cursor;
    if (slice[cursor] === '"' || slice[cursor] === "'") {
      const quote = slice[cursor];
      valueStart = cursor + 1;
      valueEnd = valueStart;
      while (valueEnd < slice.length && slice[valueEnd] !== quote) {
        valueEnd++;
      }
      if (valueEnd >= slice.length) {
        valueEnd = slice.length;
      }
    } else {
      while (valueEnd < slice.length && !/[\s>]/.test(slice[valueEnd])) {
        valueEnd++;
      }
    }

    const candidate = slice.substring(valueStart, valueEnd);
    if (candidate === attributeValue) {
      const absoluteStart = sliceStart + valueStart;
      const absoluteEnd = sliceStart + valueEnd;
      const startPosition = getLineAndColumnFromIndex(content, absoluteStart);
      const endPosition = getLineAndColumnFromIndex(content, absoluteEnd);
      return new vscode.Range(
        new vscode.Position(startPosition.line, startPosition.column),
        new vscode.Position(endPosition.line, endPosition.column)
      );
    }

    searchIndex = valueEnd + 1;
  }

  return undefined;
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
