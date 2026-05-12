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
import { findParentViewName, findViewNameAtOrAbove } from "../../providers/html-shared";
import { getIncludeMetadata, resolveIncludeFilePath } from "../../services/include-service";
import { getScreenTemplates } from "../../services/screen-template-service";
import { getClientControlsMetadata, ClientControlMetadata } from "../../services/client-controls-service";
import { AcuMateContext } from "../../plugin-context";
import {
  getBaseScreenDocument,
  isCustomizationSelectorAttribute,
  queryBaseScreenElements,
  BaseScreenDocument,
  getCustomizationSelectorAttributes,
  loadHtmlDocument,
  getScreenDocumentDisplayName,
} from "../../services/screen-html-service";
import { createSuppressionEngine, SuppressionEngine } from "../../diagnostics/suppression";

// The validator turns the TypeScript model into CollectedClassInfo entries for every PXScreen/PXView
// and then uses that metadata when validating the HTML DOM.
const includeIntrinsicAttributes = new Set(["id", "class", "style", "slot"]);
const idOptionalTags = new Set([
  "qp-field",
  "qp-label",
  "qp-include",
  "qp-informer-rack",
  "qp-longrun-indicator",
  "qp-nested-screen",
  "qp-wait-cursor",
]);

interface IncludeTemplateFieldValidationContext {
  classInfoMap: Map<string, CollectedClassInfo>;
  screenClasses: CollectedClassInfo[];
  templateDocument?: BaseScreenDocument;
  viewResolutionCache: Map<string, ViewResolution | undefined>;
}

interface IncludeFieldValidationContext extends IncludeTemplateFieldValidationContext {
  parameterValues: Map<string, string>;
}

type IncludeTemplateFieldValidationCache = Map<string, IncludeTemplateFieldValidationContext | undefined>;

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
          undefined,
          false,
          undefined,
          new Map()
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
  panelViewContext?: CollectedClassInfo,
  isInsideDataFeed = false,
  includeFieldContext: IncludeFieldValidationContext | undefined = undefined,
  includeFieldContextCache: IncludeTemplateFieldValidationCache = new Map()
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

  function getIncludeFieldValidationContext(node: any): IncludeFieldValidationContext | undefined {
    const includeUrl = node.attribs?.url;
    if (typeof includeUrl !== "string" || !includeUrl.length || hasTemplateExpression(includeUrl)) {
      return undefined;
    }

    const includeHtmlPath = resolveIncludeFilePath(includeUrl, htmlFilePath, workspaceRoots);
    if (!includeHtmlPath) {
      return undefined;
    }

    const normalizedIncludePath = path.normalize(includeHtmlPath);
    let templateContext = includeFieldContextCache.get(normalizedIncludePath);
    if (!includeFieldContextCache.has(normalizedIncludePath)) {
      templateContext = loadIncludeTemplateFieldValidationContext(normalizedIncludePath);
      includeFieldContextCache.set(normalizedIncludePath, templateContext);
    }

    if (!templateContext) {
      return undefined;
    }

    return {
      ...templateContext,
      parameterValues: getIncludeParameterValues(node),
    };
  }

  function loadIncludeTemplateFieldValidationContext(
    includeHtmlPath: string
  ): IncludeTemplateFieldValidationContext | undefined {
    const includeTsFilePaths = getRelatedTsFiles(includeHtmlPath);
    const includeClassProperties = includeTsFilePaths.length
      ? loadClassInfosFromFiles(includeTsFilePaths)
      : [];
    const includeRelevantClassInfos = filterClassesBySource(includeClassProperties, includeTsFilePaths);
    const screenClasses = filterScreenLikeClasses(includeRelevantClassInfos);
    const templateDocument = loadHtmlDocument(includeHtmlPath);

    if (!screenClasses.length && !templateDocument) {
      return undefined;
    }

    return {
      classInfoMap: createClassInfoLookup(includeClassProperties),
      screenClasses,
      templateDocument,
      viewResolutionCache: new Map(),
    };
  }

  function getIncludeParameterValues(node: any): Map<string, string> {
    const values = new Map<string, string>();
    const attributes = node.attribs ?? {};
    for (const [attributeName, attributeValue] of Object.entries(attributes)) {
      if (typeof attributeValue === "string") {
        values.set(attributeName, attributeValue);
      }
    }
    return values;
  }

  // Custom validation logic goes here
  dom.forEach((node) => {
    let nextPanelViewContext = panelViewContext;
    let nextIncludeFieldContext = includeFieldContext;
    const normalizedTagName =
      node.type === "tag" && typeof node.name === "string" ? node.name.toLowerCase() : "";
    const elementId = node.type === "tag" ? getElementId(node) : "";
    const nodeIsDataFeed = normalizedTagName === "qp-data-feed";
    const currentDataFeedContext = isInsideDataFeed || nodeIsDataFeed;

    if (node.type === "tag") {
      const requiresIdAttribute =
        normalizedTagName === "qp-panel" ||
        (normalizedTagName && controlMetadata.has(normalizedTagName) && !idOptionalTags.has(normalizedTagName));
      if (requiresIdAttribute && !elementId.length && !hasConfigId(node)) {
        const range = getRange(content, node);
        const message =
          normalizedTagName === "qp-panel"
            ? "The <qp-panel> element must define an id attribute."
            : `The <${node.name}> element must define an id attribute.`;
        pushHtmlDiagnostic(diagnostics, suppression, range, message);
      }

      validateCustomizationSelectors(node);
    }

    if (
      hasScreenMetadata &&
      node.type === "tag" &&
      node.name === "qp-fieldset" &&
      node.attribs[`view.bind`] &&
      !hasTemplateExpression(node.attribs[`view.bind`])
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
      if (elementId.length && !hasTemplateExpression(elementId)) {
        const viewResolution = resolveView(elementId);
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

    if (
      hasScreenMetadata &&
      node.type === "tag" &&
      node.name === "using" &&
      node.attribs.view &&
      !hasTemplateExpression(node.attribs.view)
    ) {
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
    if (
      canValidateActions &&
      typeof actionBinding === "string" &&
      actionBinding.length &&
      !hasTemplateExpression(actionBinding)
    ) {
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
      nextIncludeFieldContext = getIncludeFieldValidationContext(node);
    }

    if (
      node.type === "tag" &&
      node.name === "qp-template" &&
      typeof node.attribs?.name === "string" &&
      node.attribs.name.length
    ) {
      validateTemplateName(node.attribs.name, node, currentDataFeedContext);
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
      const viewSpecified = node.attribs.name.includes(".");
      const [viewFromNameAttribute, fieldFromNameAttribute] = viewSpecified ? node.attribs.name.split(".") : [];

      const isUnboundField = Object.prototype.hasOwnProperty.call(node.attribs, "unbound");

      if (!isUnboundField) {
        let viewName = viewSpecified ? viewFromNameAttribute : findParentViewName(node);
        let includeViewNameAllowsAnyViewFallback = false;
        if (!viewName) {
          viewName = getViewNameFromCustomizationSelectors(node);
        }
        if (!viewName && hasTemplateCustomizationSelector(node)) {
          return;
        }
        if (!viewName && includeFieldContext) {
          const includeViewName = getViewNameFromIncludeCustomizationSelectors(node, includeFieldContext);
          includeViewNameAllowsAnyViewFallback = hasTemplateExpression(includeViewName);
          viewName = includeViewName;
        }

        if (includeFieldContext) {
          includeViewNameAllowsAnyViewFallback ||= hasTemplateExpression(viewName);
          viewName = resolveIncludeTemplateValue(viewName, includeFieldContext);
        }

        const rawFieldName = viewSpecified ? fieldFromNameAttribute : node.attribs.name;
        const fieldName = includeFieldContext
          ? resolveIncludeTemplateValue(rawFieldName, includeFieldContext)
          : rawFieldName;
        if (hasTemplateExpression(viewName) || hasTemplateExpression(fieldName)) {
          return;
        }
        const viewResolution = resolveView(viewName);
        const viewClass = viewResolution?.viewClass;
        const fieldProperty = viewClass?.properties.get(fieldName);
        const isValidField =
          fieldProperty?.kind === "field" ||
          isFieldDefinedInIncludeContext(
            fieldName,
            viewName,
            includeFieldContext,
            includeViewNameAllowsAnyViewFallback
          );
        if (!isValidField) {
          const range = getRange(content, node);
          pushHtmlDiagnostic(
            diagnostics,
            suppression,
            range,
            viewName
              ? `The field "${fieldName}" is not defined on view "${viewName}".`
              : "The <field> element must be bound to a valid field."
          );
        }
      }
    }

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
        nextPanelViewContext,
        currentDataFeedContext,
        nextIncludeFieldContext,
        includeFieldContextCache
      );
    }
  });
  function validateTemplateName(templateName: string, node: any, insideDataFeed: boolean) {
    const normalizedTemplateName = templateName.trim();
    if (hasTemplateExpression(normalizedTemplateName)) {
      return;
    }

    if (normalizedTemplateName.startsWith("record-") && !insideDataFeed) {
      const range = getRange(content, node);
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        "Templates prefixed with record- can only be used inside a <qp-data-feed> element."
      );
      return;
    }

    if (!screenTemplateNames.size) {
      return;
    }

    if (!screenTemplateNames.has(normalizedTemplateName)) {
      const range = getRange(content, node);
      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The qp-template name "${normalizedTemplateName}" is not one of the predefined screen templates.`
      );
    }
  }

  function validateCustomizationSelectors(node: any) {
    if (!baseScreenDocument) {
      return;
    }

    forEachCustomizationSelector(node, (attributeName, rawValue, normalizedValue) => {
      if (hasTemplateExpression(normalizedValue)) {
        return;
      }

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
        const baseName = getScreenDocumentDisplayName(baseScreenDocument);
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

      if (hasTemplateExpression(normalizedValue)) {
        return;
      }

      const { nodes, error } = queryBaseScreenElements(baseScreenDocument, normalizedValue);
      if (error || !nodes.length) {
        return;
      }

      for (const target of nodes) {
        const candidateViewName = findViewNameAtOrAbove(target);
        if (candidateViewName) {
          selectorViewName = candidateViewName;
          return;
        }
      }
    });

    return selectorViewName;
  }

  function getViewNameFromIncludeCustomizationSelectors(
    node: any,
    context: IncludeFieldValidationContext
  ): string | undefined {
    const includeDocument = context.templateDocument;
    if (!includeDocument) {
      return undefined;
    }

    let selectorViewName: string | undefined;
    forEachCustomizationSelector(node, (_attributeName, _rawValue, normalizedValue) => {
      if (selectorViewName) {
        return;
      }

      if (hasTemplateExpression(normalizedValue)) {
        return;
      }

      const { nodes, error } = queryBaseScreenElements(includeDocument, normalizedValue);
      if (error || !nodes.length) {
        return;
      }

      for (const target of nodes) {
        const candidateViewName = findViewNameAtOrAbove(target);
        if (candidateViewName) {
          selectorViewName = candidateViewName;
          return;
        }
      }
    });

    return selectorViewName;
  }

  function isFieldDefinedInIncludeContext(
    fieldName: string | undefined,
    viewName: string | undefined,
    context: IncludeFieldValidationContext | undefined,
    allowAnyViewFallback = false
  ): boolean {
    if (!context || !fieldName || hasTemplateExpression(fieldName)) {
      return false;
    }

    const normalizedViewName = viewName?.trim();
    if (normalizedViewName && !hasTemplateExpression(normalizedViewName)) {
      const viewResolution = resolveIncludeView(normalizedViewName, context);
      const fieldProperty = viewResolution?.viewClass?.properties.get(fieldName);
      if (fieldProperty?.kind === "field") {
        return true;
      }

      return allowAnyViewFallback ? isFieldDefinedInAnyIncludeView(fieldName, context) : false;
    }

    return isFieldDefinedInAnyIncludeView(fieldName, context);
  }

  function resolveIncludeView(
    viewName: string,
    context: IncludeFieldValidationContext
  ): ViewResolution | undefined {
    if (context.viewResolutionCache.has(viewName)) {
      return context.viewResolutionCache.get(viewName);
    }

    const resolution = resolveViewBinding(viewName, context.screenClasses, context.classInfoMap);
    context.viewResolutionCache.set(viewName, resolution);
    return resolution;
  }

  function isFieldDefinedInAnyIncludeView(
    fieldName: string,
    context: IncludeFieldValidationContext
  ): boolean {
    for (const screenClass of context.screenClasses) {
      for (const property of screenClass.properties.values()) {
        if (property.kind !== "view" && property.kind !== "viewCollection") {
          continue;
        }

        const viewClass = property.viewClassName
          ? context.classInfoMap.get(property.viewClassName)
          : undefined;
        const fieldProperty = viewClass?.properties.get(fieldName);
        if (fieldProperty?.kind === "field") {
          return true;
        }
      }
    }

    return false;
  }

  function resolveIncludeTemplateValue(
    value: string | undefined,
    context: IncludeFieldValidationContext
  ): string | undefined {
    if (!value) {
      return value;
    }

    return value.replace(/{{\s*([^}\s]+)\s*}}/g, (match, parameterName: string) => {
      const parameterValue = context.parameterValues.get(parameterName)?.trim();
      return parameterValue || match;
    }).trim();
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

  function hasTemplateCustomizationSelector(node: any): boolean {
    let hasTemplateSelector = false;
    forEachCustomizationSelector(node, (_attributeName, _rawValue, normalizedValue) => {
      if (hasTemplateExpression(normalizedValue)) {
        hasTemplateSelector = true;
      }
    });
    return hasTemplateSelector;
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
      if (hasTemplateExpression(bindingValue)) {
        return;
      }

      pushHtmlDiagnostic(
        diagnostics,
        suppression,
        range,
        `The ${node.name} config.bind value must be valid object matching ${definition.typeName}.`
      );
      return;
    }

    const providedKeys = new Set(Object.keys(configObject));
    // commented out to reduce noise in diagnostics
    /*for (const property of definition.properties) {
      if (!property.optional && !providedKeys.has(property.name)) {
        pushHtmlDiagnostic(
          diagnostics,
          suppression,
          range,
          `The ${node.name} config.bind is missing required property "${property.name}".`
        );
      }
    }*/

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
    if (!normalizedValue.length || hasTemplateExpression(normalizedValue)) {
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
    if (hasTemplateExpression(bindingValue)) {
      return;
    }

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

  function hasConfigId(node: any): boolean {
    const rawConfig = node.attribs?.["config.bind"];
    if (typeof rawConfig !== "string" || !rawConfig.length) {
      return false;
    }

    const configObject = parseConfigObject(rawConfig);
    if (configObject) {
      return Object.prototype.hasOwnProperty.call(configObject, "id");
    }

    return hasTemplateExpression(rawConfig);
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
  if (typeof includeUrl !== "string" || !includeUrl.length || hasTemplateExpression(includeUrl)) {
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

function hasTemplateExpression(value: string | undefined): boolean {
  return typeof value === "string" && /{{\s*[^}]+\s*}}/.test(value);
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

function getElementId(node: any): string {
  const rawId = node.attribs?.id;
  return typeof rawId === "string" ? rawId.trim() : "";
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
