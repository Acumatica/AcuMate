# AcuMate

AcuMate is Acumatica's open-source Visual Studio Code plugin for building Modern UI screens. 

## VS Code extension
- Surfaces backend metadata directly in TypeScript hovers and IntelliSense, validating `@graphInfo`, `@featureInstalled`, and `@linkCommand` decorators against the connected site.
- Adds Acumatica-aware HTML tooling (validation, go-to-definition, completions) for `view.bind`, `qp-*` controls, templates, and action bindings.
- Provides project scaffolding: Create Screen / Screen Extension wizards, build menus, validation runners, and quick fixes for suppressing diagnostics when needed.
- Streams logs and validation output through dedicated VS Code channels so long-running metadata requests and builds stay traceable.

## Getting Started

### Prerequisites
- Node.js 18 LTS or newer (the extension CI runs on Node 18/20).
- VS Code 1.54+ for local extension development.

### Install / develop the VS Code extension
1. `cd acumate-plugin`
2. `npm install`
3. `npm run compile` (or `npm run watch` while iterating)
4. Launch VS Code with the `Run Extension` target or package the extension via `npm run vscode:prepublish` and install the generated `.vsix`.
5. Run `npm test` to execute the integration suite, or `npm run validate:screens` / `npm run validate:screens:ts` to trigger the HTML and TypeScript validators headlessly.

## Repository Structure

```
acumate-plugin/     # VS Code extension source, scripts, and tests
acumate-linter/     # Standalone ESLint plugin shared by CI + editors
VSCode/             # VS Code workspace settings used for local development
CHANGELOG.md        # Release notes for both packages
vsc-extension-quickstart.md  # Legacy notes for extension authors
```

Refer to [acumate-plugin/readme.md](acumate-plugin/readme.md) for the full extension features list, settings reference, and command catalog.

## Development Workflow
- Run `npm run lint` inside `acumate-plugin` before opening a PR; the CI workflow mirrors `npm ci && npm test`.
- When editing shared logic (e.g., metadata helpers), update both documentation and tests—diagnostics surface in VS Code and via CLI.

## Contributing
- File bugs and feature requests through GitHub issues.
- Add entries to [CHANGELOG.md](CHANGELOG.md) under **Unreleased** for every PR.
