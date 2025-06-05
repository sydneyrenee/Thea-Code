/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	projects: [
		{
			displayName: "backend",
			testEnvironment: "node",
			testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
			setupFiles: ["<rootDir>/src/__mocks__/jest.setup.ts"],
			transform: {
				"^.+\\.tsx?$": [
					"ts-jest",
					{
						tsconfig: {
							module: "CommonJS",
							moduleResolution: "node",
							esModuleInterop: true,
							allowJs: true,
						},
						diagnostics: {
							ignoreCodes: ["TS2339", "TS2307", "TS2345"]
						},
					},
				],
			},
			transformIgnorePatterns: [
				"node_modules/(?!(@modelcontextprotocol|delay|p-wait-for|globby|serialize-error|strip-ansi|default-shell|os-name|strip-bom)/)",
			],
			moduleNameMapper: {
				"^vscode$": "<rootDir>/src/__mocks__/vscode.js",
                                "@modelcontextprotocol/sdk$": "<rootDir>/src/__mocks__/@modelcontextprotocol/sdk/index.js",
                                "^@modelcontextprotocol/sdk/server/mcp\\.js$": "@modelcontextprotocol/sdk/server/mcp.js",
                                "^@modelcontextprotocol/sdk/server/streamableHttp\\.js$": "@modelcontextprotocol/sdk/server/streamableHttp.js",
                                "@modelcontextprotocol/sdk/(.*)": "<rootDir>/src/__mocks__/@modelcontextprotocol/sdk/$1",
				"^delay$": "<rootDir>/src/__mocks__/delay.js",
				"^p-wait-for$": "<rootDir>/src/__mocks__/p-wait-for.js",
				"^globby$": "<rootDir>/src/__mocks__/globby.js",
				"^serialize-error$": "<rootDir>/src/__mocks__/serialize-error.js",
				"^strip-ansi$": "<rootDir>/src/__mocks__/strip-ansi.js",
				"^default-shell$": "<rootDir>/src/__mocks__/default-shell.js",
				"^os-name$": "<rootDir>/src/__mocks__/os-name.js",
				"^strip-bom$": "<rootDir>/src/__mocks__/strip-bom.js",
			},
		},
		{
			displayName: "frontend",
			testEnvironment: "jsdom",
			testMatch: ["<rootDir>/webview-ui/src/**/__tests__/**/*.test.ts"],
			setupFilesAfterEnv: ["<rootDir>/webview-ui/src/setupTests.ts"],
			transform: {
				"^.+\\.tsx?$": [
					"ts-jest",
					{
						tsconfig: {
							module: "ESNext",
							moduleResolution: "node",
							esModuleInterop: true,
							allowJs: true,
							jsx: "react-jsx",
							lib: ["dom", "dom.iterable", "esnext"],
						},
						diagnostics: {
							ignoreCodes: ["TS2339", "TS2307", "TS2345"]
						},
					},
				],
			},
			moduleNameMapper: {
				"\\.(css|less|scss|sass)$": "identity-obj-proxy",
				"\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": "<rootDir>/webview-ui/src/__mocks__/fileMock.js",
				"^@/(.*)$": "<rootDir>/webview-ui/src/$1"
			},
			transformIgnorePatterns: [
				"node_modules/(?!(@testing-library)/)"
			],
		}
	],
	transformIgnorePatterns: [
		"node_modules/(?!(@modelcontextprotocol|delay|p-wait-for|globby|serialize-error|strip-ansi|default-shell|os-name|strip-bom)/)",
	],
	modulePathIgnorePatterns: [".vscode-test"],
        reporters: [["jest-simple-dot-reporter", {}]],
        globalSetup: "<rootDir>/test/globalSetup.ts",
        globalTeardown: "<rootDir>/test/globalTeardown.ts",
}
