import { RuleTester } from "@typescript-eslint/rule-tester";
import { acuGridConfigRule } from "../src/rules/grid-config-rule";
import * as path from "path";

const ruleTester = new RuleTester({
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "tsconfig.test.json",
	}
});

ruleTester.run("eslint-plugin-grid-config rule", acuGridConfigRule, {
	valid: [
		{
			name: "not a view",
			code: `@aaa({ graphType: "PX.Objects.GoodGraph" })
				export class Foo {}`,
			options: [{ dataUrl: path.resolve("./test/data") }]
		},
		{
			name: "no grid config decorator",
			code: `@aaa({ graphType: "PX.Objects.GoodGraph" })
				export class Foo extends PXView {}`,
			options: [{ dataUrl: path.resolve("./test/data") }]
		},
		{
			name: "grid config decorator with correct preset",
			code: `@gridConfig({ preset: GridPreset.Details })
				export class Foo extends PXView {}`,
			options: [{ dataUrl: path.resolve("./test/data") }]
		}
	],
	invalid: [
		{
			name: "grid config decorator without options",
			code: `@gridConfig()
				export class Foo extends PXView {}`,
			options: [{ dataUrl: path.resolve("./test/data") }],
			errors: [{ messageId: "presetNotSet" }]
		},
		{
			name: "grid config decorator without preset",
			code: `@gridConfig({})
				export class Foo extends PXView {}`,
			options: [{ dataUrl: path.resolve("./test/data") }],
			errors: [{ messageId: "presetNotSet" }]
		},
		{
			name: "grid config decorator with wrong preset",
			code: `@gridConfig({ preset: "aaa" })
				export class Foo extends PXView {}`,
			options: [{ dataUrl: path.resolve("./test/data") }],
			errors: [{ messageId: "presetNotSet" }],
		},]
});
