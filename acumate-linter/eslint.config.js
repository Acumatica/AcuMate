const tsEslint = require("@typescript-eslint/eslint-plugin");
const unicorn = require("eslint-plugin-unicorn");
const parser = require("@typescript-eslint/parser");

module.exports = [{
	languageOptions: {
		parser,
		parserOptions: {
			project: "tsconfig.linter.json",
			sourceType: "module",
			ecmaVersion: 2019
		},
	},
	plugins: {
		"unicorn": unicorn,
		"@typescript-eslint": tsEslint
	},
	files: ["**/*.ts"],
	ignores: ["dist/"],
	rules: {
		"@typescript-eslint/await-thenable": "error",
		"@typescript-eslint/consistent-type-definitions": "error",
		"@typescript-eslint/dot-notation": "error",
		"@typescript-eslint/quotes": ["warn", "double", { "allowTemplateLiterals": true }],
		"@typescript-eslint/member-delimiter-style": "error",
		"@typescript-eslint/member-ordering": [
			"error",
			{
				"default": [
					"public-static-field",
					"private-static-field",
					"public-instance-field",
					"private-instance-field",
					"public-constructor",
					"private-constructor",
					"public-instance-method",
					"protected-instance-method",
					"private-instance-method"
				]
			}
		],
		"@typescript-eslint/method-signature-style": [
			"warn",
			"method"
		],
		"@typescript-eslint/naming-convention": [
			"error",
			{
				"selector": "variable",
				"format": [
					"camelCase",
					"UPPER_CASE",
					"PascalCase"
				],
				"leadingUnderscore": "allow",
				"trailingUnderscore": "forbid"
			}
		],
		"@typescript-eslint/no-empty-function": "error",
		"@typescript-eslint/no-extraneous-class": "off",
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-invalid-this": "error",
		"@typescript-eslint/no-magic-numbers": [
			"error",
			{
				"ignore": [
					-1,
					0,
					1,
					2,
					3
				],
				"ignoreEnums": true
			}
		],
		"@typescript-eslint/no-misused-promises": "error",
		"@typescript-eslint/no-this-alias": "error",
		"@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
		"@typescript-eslint/no-unused-vars": "off",
		"@typescript-eslint/prefer-for-of": "error",
		"comma-spacing": [
			"error",
			{
				"before": false,
				"after": true
			}
		],
		"arrow-body-style": "error",
		"indent": [
			"warn",
			"tab",
			{
				"ignoredNodes": [
					"ClassBody.body > PropertyDefinition[decorators.length > 0] > .key"
				],
				"SwitchCase": 1
			}
		],
		"space-before-blocks": "error",
		"space-infix-ops": "error",
		"key-spacing": "error",
		"keyword-spacing": [
			"error",
			{
				"before": true,
				"after": true
			}
		],
		"brace-style": [
			"warn",
			"stroustrup"
		],
		"constructor-super": "error",
		"consistent-return": "error",
		"curly": [
			"error",
			"multi-line"
		],
		"dot-notation": "off",
		"eqeqeq": [
			"error",
			"smart"
		],
		"id-denylist": [
			"error",
			"any",
			"Number",
			"number",
			"String",
			"string",
			"Boolean",
			"boolean",
			"Undefined",
			"undefined"
		],
		"id-match": "error",
		"newline-per-chained-call": "off",
		"no-cond-assign": "error",
		"no-duplicate-case": "error",
		"no-empty": [
			"error",
			{
				"allowEmptyCatch": true
			}
		],
		"semi": [
			"error",
			"always"
		],
		"no-trailing-spaces": "error",
		"no-empty-function": "off",
		"no-eval": "error",
		"no-invalid-this": "off",
		"no-magic-numbers": "off",
		"no-new-func": "error",
		"no-redeclare": "off",
		"no-sequences": "error",
		"no-template-curly-in-string": "error",
		"no-underscore-dangle": "off",
		"no-unused-vars": "off",
		"no-var": "error",
		"one-var": [
			"error",
			"never"
		],
		"prefer-const": [
			"error",
			{
				"destructuring": "all"
			}
		],
		"prefer-object-spread": "error",
		"prefer-template": "error",
		"unicorn/filename-case": [
			"error",
			{
				"cases": {
					"kebabCase": true,
					"pascalCase": true
				},
				"ignore": [
					"[A-Z0-9]{8}.ts$",
					"[A-Z0-9]{8}_.*.ts$"
				]
			}
		],
		"unicorn/prefer-switch": [
			"error",
			{
				"minimumCases": 4
			}
		]
	}
}];
