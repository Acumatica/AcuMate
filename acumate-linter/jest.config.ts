import type { InitialOptionsTsJest } from 'ts-jest';

const baseConfig: InitialOptionsTsJest = {
	moduleFileExtensions: [
		"ts",
		"js",
		"json"
	],
	moduleNameMapper: {
		"@typescript-eslint/utils/(.*)": "<rootDir>/node_modules/@typescript-eslint/utils/dist/$1",
		"eslint/use-at-your-own-risk": "<rootDir>/node_modules/eslint/lib/unsupported-api.js",
		"ts-api-utils": "<rootDir>/node_modules/ts-api-utils/lib/index.cjs"
	},
	transform: {
		"^.+\\.ts$": "ts-jest",
		"^.+\\.js$": "babel-jest"
	},
	testRegex: "\\.spec\\.(ts|js)$",
	preset: "ts-jest/presets/js-with-ts",
	testTimeout: 100000,
	testEnvironment: "node",
	testRunner: 'jest-circus',
	testResultsProcessor: "jest-bamboo-reporter",
	collectCoverage: false,
	collectCoverageFrom: [
		"src/**/*.{js,ts}",
		"!**/*.spec.{js,ts}",
		"!**/node_modules/**",
		"!**/test/**"
	],
	coverageDirectory: "<rootDir>/test/coverage-jest",
	coverageReporters: [
		"json",
		"lcov",
		"text",
		"html"
	]
};

export default baseConfig;
