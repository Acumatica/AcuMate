# AcuMate Extension Documentation

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
