import { RuleTester, TestCaseError } from "@typescript-eslint/rule-tester";
import { acuGridConfigRule, gridPresetValues } from "../src/rules/grid-config-rule";

const ruleTester = new RuleTester({
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "tsconfig.test.json",
	}
});

const createClassCode = (decoratorsCode: string) =>
	`${decoratorsCode}
	export class Foo extends PXView {}`;

const errors: TestCaseError<"presetNotSet" | "presetSuggest">[] = [{
	messageId: "presetNotSet",
	suggestions: gridPresetValues.map(name => ({
		messageId: "presetSuggest",
		data: { name },
		output: createClassCode(`@gridConfig({ preset: ${name} })`)
	}))
}];

ruleTester.run("eslint-plugin-grid-config rule", acuGridConfigRule, {
	valid: [
		{
			name: "not a view",
			code: `@aaa({ graphType: "PX.Objects.GoodGraph" })
				export class Foo {}`,
		},
		{
			name: "no grid config decorator",
			code: createClassCode("@aaa({ graphType: \"PX.Objects.GoodGraph\" })"),
		},
		{
			name: "grid config decorator with correct preset",
			code: createClassCode("@gridConfig({ preset: GridPreset.Details })")
		}
	],
	invalid: [
		{
			name: "grid config decorator without options",
			code: createClassCode("@gridConfig"),
			errors,
		},
		{
			name: "grid config decorator without options, but with braces in decorator",
			code: createClassCode("@gridConfig()"),
			errors,
		},
		{
			name: "grid config decorator without preset",
			code: createClassCode("@gridConfig({})"),
			errors,
		},
		{
			name: "grid config decorator without preset, but other props",
			code: createClassCode("@gridConfig({ autoGrowInHeight: GridAutoGrowMode.Fit })"),
			errors: [{
				messageId: "presetNotSet",
				suggestions: gridPresetValues.map(name => ({
					messageId: "presetSuggest",
					data: { name },
					output: createClassCode(`@gridConfig({ preset: ${name}, autoGrowInHeight: GridAutoGrowMode.Fit })`)
				}))
			}],
		},
		{
			name: "grid config decorator without preset, but other props on multiline",
			code: createClassCode(`@gridConfig({
				autoGrowInHeight: GridAutoGrowMode.Fit
				})`),
			errors: [{
				messageId: "presetNotSet",
				suggestions: gridPresetValues.map(name => ({
					messageId: "presetSuggest",
					data: { name },
					output: createClassCode(`@gridConfig({ preset: ${name},
				autoGrowInHeight: GridAutoGrowMode.Fit
				})`)
				}))
			}],
		},
		{
			name: "grid config decorator with wrong preset",
			code: createClassCode(`@gridConfig({ preset: "aaa" })`),
			errors,
		},
	]
});
