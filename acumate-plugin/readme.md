# AcuMate Extension Documentation

## Description

**AcuMate** is a Visual Studio Code extension designed specifically for working with the **Acumatica ERP** platform's Modern UI. This extension streamlines development tasks, providing tools to improve productivity, consistency, and ease of use when working with Acumatica. 

## Settings

The AcuMate extension provides a range of settings to configure its behavior. Each of these settings can be customized through your VS Code `settings.json` file.

### Parameters

| Setting                          | Type      | Default           | Description                                                                                     |
| -------------------------------- | --------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `acuMate.backendUrl`             | `string`  | `http://localhost` | This is the URL for the backend.                                                                |
| `acuMate.login`                  | `string`  | `admin`           | Login credential to the backend.                                                                |
| `acuMate.password`               | `string`  | `123`             | Password for the backend.                                                                       |
| `acuMate.tenant`                 | `string`  | `""`              | Specifies the tenant to use; leave empty for single-tenant sites.                                |
| `acuMate.useCache`               | `boolean` | `true`            | Enables caching of server responses.                                                            |
| `acuMate.useBackend`             | `boolean` | `true`            | Enables the use of the backend for the plugin. Disabling this may cause some features to stop working. |
| `acuMate.usePrettier`            | `boolean` | `true`            | Applies Prettier formatting to generated files.                                                 |
| `acuMate.clearUsages`            | `boolean` | `true`            | Runs the `organizeUsages` command on generated files.                                           |


## Features

The **AcuMate** extension for Visual Studio Code offers a range of powerful features for developers working with Acumatica, especially focused on TypeScript and HTML integration. These features enhance productivity, improve code accuracy, and streamline the development process for Acumatica's Modern UI.

### TypeScript Features

1. **IntelliSense Enhancements**  
   - Provides IntelliSense for available views within the Acumatica graph, helping users navigate and select relevant views.
   - Filters out service views, such as selector views or those containing `#Cache`, to ensure only essential views are shown.
   - PXView hover cards surface backend metadata (display name, type, default control) for `PXFieldState` members as soon as `acuMate.useBackend` is enabled, keeping data definitions close at hand.

2. **Terminal Commands**  
   - **Create Screen**: Easily create a new screen by specifying the screen name, graph, primary view, and the number of files to generate.
   - **Create Screen Extension**: Quickly create an extension for an existing screen by specifying the screen name, extension name, and optionally, a feature switch.
   - **Quick Application Build Commands**: Simplifies the build process by providing easy-to-use commands, reducing the need to remember multiple commands.

3. **Additional IntelliSense Suggestions**  
   - **Create View**: Simplifies view creation with options for naming, specifying whether it’s single or a collection, and adding `viewInfo`, `graphConfig`, or `treeConfig` decorators.
   - **Create Field**: Allows quick creation of fields with options for field settings and relevant decorators.

4. **Snippets**  
   - **Event Hook Creation**: Quickly add event hooks to TypeScript code with built-in snippets.

5. **Graph Metadata Assistance**  
   - When `acuMate.useBackend` is enabled, AcuMate queries the connected site for the list of available graphs and surfaces them as completions inside the `@graphInfo` decorator's `graphType` value.  
   - The same metadata powers TypeScript diagnostics, warning when a `graphType` string does not match any graph returned by the backend so you can catch typos before running the UI.
   - The `@featureInstalled("FeatureName")` decorator gains backend-driven IntelliSense as you type the feature name and raises diagnostics when a missing/disabled feature is referenced, helping ensure feature-gated screens follow the site configuration.
   - Validates `@linkCommand("ActionName")` decorators on PXFieldState members, ensuring the referenced PXAction exists on the backend graph (case-insensitive comparison).
   - While editing a `@linkCommand("...")` decorator, AcuMate now surfaces completion items sourced from the backend action list so you can insert the exact action name without leaving the editor.
   - Screen extension TypeScript files (under `.../extensions/...`) automatically reuse the parent screen's `@graphInfo` metadata so backend validations, completions, and linkCommand checks keep working even when the extension file lacks its own decorator.
   - Hovering PXView field declarations displays the backend field’s display name, raw name, type, and default control. Hovering PXView properties shows cache type/name metadata, and hovering PXActionState members surfaces their backend display names so you can confirm bindings at a glance.
   - Fields whose names contain a double underscore (e.g., `__CustomField`) are treated as intentionally custom and are skipped by `graphInfo` diagnostics to avoid noise while prototyping.

### HTML Features

1. **HTML Validation Against TypeScript + Client Metadata**  
   - Confirms `view.bind` and `<using view="">` references resolve to real PXView/PXViewCollection properties, including inherited and mixin-provided bindings.
   - Verifies `<field name="...">` entries against the PXView resolved from the surrounding markup and ignores deliberate `unbound replace-content` placeholders.
   - Validates `state.bind` attributes point to PXAction members, and `qp-field control-state.bind` values follow the `<view>.<field>` format with existing fields.
   - Enforces `<qp-panel id="...">` bindings by making sure the id maps to an existing PXView, and reuses that view context when checking footer `<qp-button state.bind="...">` actions so dialogs only reference actions exposed by their owning view.
   - Requires `qp-panel` nodes and all `qp-*` controls to define `id` attributes (except for `qp-field`, `qp-label`, and `qp-include`) so missing identifiers and misbound panels are caught before packaging.
   - Enforces Acumatica-specific constructs: required qp-include parameters, rejection of undeclared include attributes, and qp-template name checks sourced from ScreenTemplates metadata.
   - Guards `<qp-template name="record-*">` usages so record templates only validate when the markup sits inside a `<qp-data-feed>` container, matching runtime restrictions.
   - Leverages client-controls config schemas to inspect `config.bind` JSON on qp-* controls, reporting malformed JSON, missing required properties, and unknown keys before runtime.
   - Parses customization attributes such as `before`, `after`, `append`, `prepend`, `move`, and ensures their CSS selectors resolve against the base screen HTML so misplaced selectors surface immediately instead of at publish time.
   - Integrates these diagnostics with ESLint + VS Code so warnings surface consistently in editors and CI.

2. **Go To Definition inside HTML**  
   - Navigate directly from `view.bind` attributes to the corresponding PXView declaration and backing view class.  
   - Jump from `<field name="...">` elements to the exact field property on the resolved PXView, even when the HTML attribute is still being typed.
   - Follow customization attribute selectors (e.g., `before="#toolbar .actions"`) into the base screen HTML snippet so extension authors can confirm the target fragment without leaving VS Code.

3. **Context-Aware HTML Completions**  
   - Offers IntelliSense suggestions for available `view.bind` values sourced from the PXScreen metadata.  
   - Provides field name suggestions that automatically scope to the closest parent view binding, so only valid fields appear.  
   - Attribute parsing tolerates empty values (`view.bind=""`) to keep suggestions responsive while editing.
   - Template name completions automatically filter out `record-*` entries unless the caret is inside a `<qp-data-feed>`, keeping suggestions aligned with validation rules.

   ### Logging & Observability

   - All extension subsystems log to a single **AcuMate** output channel, making it easy to trace backend requests, caching behavior, and command execution without hunting through multiple panes.
   - Every AcuMate command writes a structured log entry (arguments + timing) so build/validation flows can be audited when integrating with CI or troubleshooting user reports.
   - Backend API calls, cache hits/misses, and configuration reloads emit detailed log lines, giving immediate visibility into why a control lookup or metadata request might have failed.

4. **Backend Field Hovers**  
   - Hovering over `<field name="...">` or `<qp-field name="...">` immediately shows backend metadata (display name, type, default control type, originating view) sourced from the same data that powers TypeScript hovers.

### Suppressing Diagnostics

- Any HTML warning emitted by the validator can be silenced on a per-line basis by inserting `<!-- acumate-disable-next-line htmlValidator -->` immediately above the element that triggered the message. The directive only applies to the following line, keeping the rest of the document validated as usual.
- To switch off the validator for an entire HTML file, add `<!-- acumate-disable-file htmlValidator -->` anywhere in the document (commonly at the top). All HTML diagnostics in that file stay muted until the comment is removed.
- GraphInfo warnings inside TypeScript files respect both `// acumate-disable-next-line graphInfo` and `// acumate-disable-file graphInfo`, so you can either silence a single property or disable the validator for the entire file.
- HTML and TypeScript diagnostics expose lightbulb quick fixes for both directive forms: **Suppress with acumate-disable-next-line** inserts the scoped directive above the offending line, while **Suppress file with acumate-disable-file** drops the file-wide directive at the top of the document automatically.

## Scaffolding Workflows

- **Create Screen Wizard** walks through selecting the screen ID, backend graph, views, primary view, PXActions, view types (entity/grid/tree), and filtered field lists before generating `.ts` + `.html` files. Finished screens automatically run Prettier (if enabled) and organize imports.
- **Create Screen Extension Wizard** validates that the active VS Code editor is inside a screen folder, prompts for the extension name, reuses the parent graph metadata, then repeats the view/action/type/field selection flow to generate extension `.ts` + `.html` files beneath `extensions/`. The same Prettier + organize imports automation applies.

## Commands

The **AcuMate** extension provides several commands to streamline development tasks. Each command is accessible through the command palette in VS Code, categorized under "AcuMate."

### Available Commands

| Command                            | Title                                 | Description                                                                                                 |
|------------------------------------|---------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `acumate.createScreen`             | **Create Screen**                     | Creates a new screen by specifying the screen name, graph, primary view, and number of files to generate.   |
| `acumate.createScreenExtension`    | **Create Screen Extension from current screen** | Creates an extension for the current screen with options for screen name, extension name, and feature switch. |
| `acumate.buildMenu`                | **Open Build Menu**                   | Opens a menu to access various build options.                                                               |
| `acumate.buildScreensDev`          | **Build Screens (Dev)**              | Builds all screens in development mode.                                                                     |
| `acumate.buildScreens`             | **Build Screens (Production)**       | Builds all screens for production deployment.                                                               |
| `acumate.buildScreensByNamesDev`   | **Build Screens by Names (Dev)**     | Builds selected screens by name in development mode.                                                        |
| `acumate.buildScreensByNames`      | **Build Screens by Names (Production)** | Builds selected screens by name for production deployment.                                               |
| `acumate.buildScreensByModulesDev` | **Build Screens by Modules (Dev)**   | Builds screens by selected modules in development mode.                                                     |
| `acumate.buildScreensByModules`    | **Build Screens by Modules (Production)** | Builds screens by selected modules for production deployment.                                       |
| `acumate.buildCurrentScreenDev`    | **Build Current Screen (Dev)**       | Builds the currently active screen in development mode.                                                     |
| `acumate.buildCurrentScreen`       | **Build Current Screen (Production)** | Builds the currently active screen for production deployment.                                         |
| `acumate.watchCurrentScreen`       | **Watch Current Screen**             | Watches the currently active screen for changes and rebuilds as needed.                                     |
| `acumate.repeatLastBuildCommand`   | **Repeat Last Build Command**        | Repeats the last executed build command, useful for quick iterations.                                       |
| `acumate.dropCache`                | **Drop Local Cache**                 | Clears the local cache, ensuring that the next build retrieves fresh data from the backend.                 |
| `acumate.validateScreens`          | **Validate Screens (HTML)**          | Scans every `.html` under `src/screens` (or a folder you choose), reports progress with a cancellable notification, and logs validator diagnostics to the **AcuMate Validation** output channel without failing on warnings. |
| `acumate.validateTypeScriptScreens`| **Validate Screens (TypeScript)**    | Iterates through screen `.ts` files, runs the backend-powered `graphInfo` validator with cancellable progress, and streams any warnings/errors to the **AcuMate Validation** output channel so you can review them without interrupting development. |

### Quality & CI

1. **Automated Tests**  
   - Run `npm test` locally to compile, lint, and execute the VS Code integration suites (metadata, HTML providers, validator, scaffolding, build commands).
   - The GitHub Actions workflow in `.github/workflows/ci.yml` performs `npm ci` + `npm test` for every pull request (regardless of branch) and on pushes to `main`, using a Node 18.x / 20.x matrix to catch regressions before and after merges.
2. **Project Screen Validation**  
   - Inside VS Code, run **AcuMate: Validate Screens (HTML)** to queue the validator against all HTML files beneath `src/screens` (or any folder you input). A cancellable progress notification tracks the run, and results are aggregated in the **AcuMate Validation** output channel so you can inspect warnings without breaking your workflow.
   - For TypeScript coverage, run **AcuMate: Validate Screens (TypeScript)** to traverse the same folder structure, execute `collectGraphInfoDiagnostics` for each screen `.ts`, and summarize backend metadata mismatches in the output channel (requires `acuMate.useBackend = true`). This command is also cancellable so you can stop long-running validations instantly.
   - From the CLI, run `npm run validate:screens` (HTML) or `npm run validate:screens:ts` (TypeScript) to execute the same scans headlessly via the VS Code test runner. Override the roots with `SCREEN_VALIDATION_ROOT` or `TS_SCREEN_VALIDATION_ROOT` environment variables when needed. Both scripts log summaries instead of failing on warnings, ensuring automated runs focus on catching crashes.

