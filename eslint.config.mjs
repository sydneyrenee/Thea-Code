import globals from "globals"
import pluginJs from "@eslint/js"
import tseslintPlugin from "@typescript-eslint/eslint-plugin"
import tseslintParser from "@typescript-eslint/parser"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import * as espree from "espree"
import { globalIgnores } from "eslint/config"

const commonTsConfig = {
	languageOptions: {
		parser: tseslintParser,
		parserOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			ecmaFeatures: {},
		},
		globals: {
			...globals.node,
			...globals.jest,
			...globals.mocha,
		},
	},
	plugins: {
		"@typescript-eslint": tseslintPlugin,
	},
	rules: {
		...tseslintPlugin.configs["recommended-type-checked"].rules,
		"@typescript-eslint/no-explicit-any": "warn",
	},
}

export default [
	{
		files: ["src/__mocks__/**/*.{ts,tsx,js,jsx}"],
		languageOptions: {
			parser: espree, // Use espree for mock files
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				ecmaFeatures: {
					jsx: true,
				},
			},
			globals: {
				...globals.browser,
				...globals.node,
				...globals.jest,
				...globals.mocha,
			},
		},
		plugins: {
			react: reactPlugin,
			"react-hooks": reactHooksPlugin,
		},
		rules: {
			// Explicitly turn off type-aware rules for mock files
			"@typescript-eslint/await-thenable": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/restrict-plus-operands": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/unbound-method": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"no-undef": "off",
			"no-import-assign": "off",
			"@typescript-eslint/no-require-imports": "off",
		},
	},
	globalIgnores([
		"node_modules/",
		"dist/",
		"build/",
		"coverage/",
		"*.cjs",
		"src/__mocks__/**/*",
		// "webview-ui/", // Removed from ignores so subproject linting works
		// "e2e/", // Removed from ignores so subproject linting works
		"esbuild.js",
		"jest.config.js",
		"eslint.config.mjs",
		"temp_similarity_check.js",
		"scripts/",
		"test/",
		"benchmark/", // Re-enabled ignore to fix ESLint parsing issues
		"**/*.md",
		"**/*.json",
		"**/*.yaml",
		"**/*.mmd",
		"**/*.log",
		"**/*.bak",
		".clinerules",
		".clinerules-code",
		".dockerignore",
		".env.sample",
		".git-blame-ignore-revs",
		".gitattributes",
		".gitconfig",
		"LICENSE",
		"assets/",
		"audio/",
		"cline_docs/",
		"locales/",
		"mock/",
		"package.json",
		"package-lock.json",
		"branding.json",
		"knip.json",
		"tsconfig.json",
		"transformer_architecture.md",
		"xlstm_vs_transformers_comparison.md",
		"PRIVACY.md",
		"README.md",
		"CHANGELOG.md",
		"CODE_OF_CONDUCT.md",
		"CONTRIBUTING.md",
		"ellipsis.yaml",
		".idea/",
		".changeset/",
		".gitignore",
		".idx/",
		".npmrc",
		".nvmrc",
		".prettierignore",
		".rooignore",
		".roomodes",
		".vscodeignore",
		"flake.lock",
		"flake.nix",
		"**/*.gitkeep",
		"**/*.snap",
	]),
	{
		files: ["src/**/*.{ts,tsx}", "!src/**/*.js", "!src/__mocks__/**/*"],
		...commonTsConfig,
		languageOptions: {
			...commonTsConfig.languageOptions,
			parserOptions: {
				...commonTsConfig.languageOptions.parserOptions,
				ecmaFeatures: {
					jsx: true,
				},
				project: "./tsconfig.json",
			},
		},
	},
	{
		files: ["e2e/src/**/*.{ts,tsx}", "!e2e/src/**/*.js"],
		...commonTsConfig,
		languageOptions: {
			...commonTsConfig.languageOptions,
			parserOptions: {
				...commonTsConfig.languageOptions.parserOptions,
				ecmaFeatures: {
					jsx: true,
				},
				project: "./e2e/tsconfig.json",
			},
		},
	},
	{
		files: ["test/**/*.{ts,tsx}", "!test/benchmark/**", "!test/e2e/**", "!test/**/*.js"],
		...commonTsConfig,
		languageOptions: {
			...commonTsConfig.languageOptions,
			parserOptions: {
				...commonTsConfig.languageOptions.parserOptions,
				ecmaFeatures: {
					jsx: true,
				},
				project: "./tsconfig.json",
			},
		},
	},
	{
		files: ["**/*.{js,mjs,cjs,jsx}"],
		languageOptions: {
			parser: espree,
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
				...globals.jest,
				...globals.mocha,
			},
		},
		plugins: {
			react: reactPlugin,
			"react-hooks": reactHooksPlugin,
		},
		rules: {
			...pluginJs.configs.recommended.rules,
			...reactPlugin.configs.recommended.rules,
			...reactHooksPlugin.configs.recommended.rules,
			"no-undef": "error",
			"no-import-assign": "error",
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
]
