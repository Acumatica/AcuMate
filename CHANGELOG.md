# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]
### Added
- Added an HTML validation warning when a `<field>` with child elements carries `config-*`, `config.bind`, or `control-type` without `replace-content`, since `qp-fieldset` silently drops those attributes at runtime.

### Fixed
- Allowed `control-state.bind="state"` on `<qp-field>` elements inside `<field replace-content>` without triggering a `<view>.<field>` format warning.
  
## [1.0.1] - 2026-01-22
### Fixed
- Removed the requirement for `acuMate.tenant`, allowing single-tenant Acumatica instances to leave the setting empty without blocking backend-powered features.

## [1.0.0] - 2026-01-20
### Added
- First public release of the AcuMate VS Code extension with backend-aware TypeScript IntelliSense, HTML validation/completions, scaffolding commands, and screen validation tasks.
- CLI commands (`validate:screens`, `validate:screens:ts`) for running the same diagnostics outside VS Code and reusing them in CI.