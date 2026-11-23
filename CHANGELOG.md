# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]
### Added
- Support for resolving `customizationScreens/<Project>/screens/...` extensions back to base screen `.ts` and `.html` files.
- Support for resolving `src/...` TypeScript module imports and propagating `PXScreen`/`PXView` types across interface-merged extension classes.
- Sequential HTML customization placement tracking (`before`, `after`, `append`, `prepend`) so later elements in an extension file referencing earlier custom fields validate, hover, complete, and navigate accurately.
- Fallback to `ui/features` for feature metadata on pre-26R1 Acumatica instances and suppression of repeated `404` retry loops when `/ui/meta-data/*` is unavailable.

### Fixed
- Removed the hardcoded `WebSites\Pure\Site\FrontendSources\` assumption in workspace validation, scaffolding, and path helpers so AcuMate works on installed Acumatica instances and standalone workspaces without a `.git` repository.
- Scoped `CachedDataService` entries by backend URL and tenant, normalized missing trailing slashes in `acuMate.backedUrl`, and cleared in-memory metadata caches on settings changes or `acumate.dropCache`.
  
## [1.0.1] - 2026-01-22
### Fixed
- Removed the requirement for `acuMate.tenant`, allowing single-tenant Acumatica instances to leave the setting empty without blocking backend-powered features.

## [1.0.0] - 2026-01-20
### Added
- First public release of the AcuMate VS Code extension with backend-aware TypeScript IntelliSense, HTML validation/completions, scaffolding commands, and screen validation tasks.
- CLI commands (`validate:screens`, `validate:screens:ts`) for running the same diagnostics outside VS Code and reusing them in CI.