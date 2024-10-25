import { RuleTester } from "@typescript-eslint/rule-tester";
import { acuGraphRule } from "../src/rules/acu-graph-rule";
import * as path from "path";

const ruleTester = new RuleTester({
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "tsconfig.test.json",
	}
});

ruleTester.run("aculint-graph rule", acuGraphRule, {
	valid: [
		{
			name: "no graphInfo decorator",
			code: `@aaa({ graphType: "PX.Objects.GoodGraph" })
				export class AB123000 extends PXScreen {}`,
			options: [{ dataUrl: path.resolve("./test/data") }]
		},
		{
			name: "correct graphName present in file",
			code: `@graphInfo({ graphType: "PX.Objects.GoodGraph" })
				export class AB123000 extends PXScreen {}`,
			options: [{ dataUrl: path.resolve("./test/data") }]
		}
	],
	invalid: [
		{
			name: "no graphType value in decorator",
			code: `@graphInfo({ })
				export class AB123000 extends PXScreen {}`,
			options: [{ dataUrl: path.resolve("./test/data") }],
			errors: [{ messageId: "noGraphName" }]
		},
		{
			name: "wrong graphType value in decorator",
			code: `@graphInfo({ graphType: "aaa" })
				export class AB123000 extends PXScreen {}`,
			options: [{ dataUrl: path.resolve("./test/data") }],
			errors: [{ messageId: "badGraphName" }]
		}
	]
});
