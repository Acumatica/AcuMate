# AcuMate Extension Documentation

## Description

**AcuMate** is a Visual Studio Code extension designed specifically for working with the **Acumatica ERP** platform's Modern UI. This extension streamlines development tasks, providing tools to improve productivity, consistency, and ease of use when working with Acumatica. AcuMate offers customizable settings to connect seamlessly with your backend, manage authentication, optimize caching, and enforce code quality standards with integrated Prettier support. 

## Settings

The AcuMate extension provides a range of settings to configure its behavior. Each of these settings can be customized through your VS Code `settings.json` file.

### Parameters

| Setting                          | Type      | Default           | Description                                                                                     |
| -------------------------------- | --------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `acuMate.backendUrl`             | `string`  | `http://localhost` | This is the URL for the backend.                                                                |
| `acuMate.login`                  | `string`  | `admin`           | Login credential to the backend.                                                                |
| `acuMate.password`               | `string`  | `123`             | Password for the backend.                                                                       |
| `acuMate.tenant`                 | `string`  | `""`              | Specifies the tenant to use.                                                                    |
| `acuMate.useCache`               | `boolean` | `true`            | Enables caching of server responses.                                                            |
| `acuMate.useBackend`             | `boolean` | `true`            | Enables the use of the backend for the plugin. Disabling this may cause some features to stop working. |
| `acuMate.useAuthentification`    | `boolean` | `true`            | Uses credentials to access the Acumatica backend.                                               |
| `acuMate.usePrettier`            | `boolean` | `true`            | Applies Prettier formatting to generated files.                                                 |
| `acuMate.clearUsages`            | `boolean` | `true`            | Runs the `organizeUsages` command on generated files.                                           |

Each of these settings can be adjusted to optimize your development experience with the AcuMate extension.


## Features

The **AcuMate** extension for Visual Studio Code offers a range of powerful features for developers working with Acumatica, especially focused on TypeScript and HTML integration. These features enhance productivity, improve code accuracy, and streamline the development process for Acumatica's Modern UI.

### TypeScript Features

1. **IntelliSense Enhancements**  
   - Provides IntelliSense for available views within the Acumatica graph, helping users navigate and select relevant views.
   - Filters out service views, such as selector views or those containing `#Cache`, to ensure only essential views are shown.

2. **Terminal Commands**  
   - **Create Screen**: Easily create a new screen by specifying the screen name, graph, primary view, and the number of files to generate.
   - **Create Screen Extension**: Quickly create an extension for an existing screen by specifying the screen name, extension name, and optionally, a feature switch.
   - **Quick Application Build Commands**: Simplifies the build process by providing easy-to-use commands, reducing the need to remember multiple commands.

3. **Additional IntelliSense Suggestions**  
   - **Create View**: Simplifies view creation with options for naming, specifying whether it’s single or a collection, and adding `viewInfo`, `graphConfig`, or `treeConfig` decorators.
   - **Create Field**: Allows quick creation of fields with options for field settings and relevant decorators.

4. **Snippets**  
   - **Event Hook Creation**: Quickly add event hooks to TypeScript code with built-in snippets.

### HTML Features

1. **HTML Validation Against TypeScript Code**  
   - Ensures HTML code aligns with TypeScript by validating:
     - Field names against the TypeScript code.
     - View names to confirm they are accurate according to the TypeScript definitions.
   - Integrates Acumatica-specific validation rules for ESLint, ensuring that code quality standards are met and enforced across both Visual Studio Code and Visual Studio.



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

