import globals from "globals"
import pluginJs from "@eslint/js"
import tseslintPlugin from "@typescript-eslint/eslint-plugin"
import tseslintParser from "@typescript-eslint/parser"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"

export default [
	// Base configuration for all JavaScript and TypeScript files
	{
		files: ["**/*.{js,mjs,cjs,jsx}"],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
				...globals.jest, // Add Jest globals
			},
		},
		plugins: {
			react: reactPlugin,
			"react-hooks": reactHooksPlugin,
		},
		rules: {
			...pluginJs.configs.recommended.rules,
			"react/jsx-uses-react": "error",
			"react/jsx-uses-vars": "error",
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
		},
	},
	// TypeScript-specific configuration
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parser: tseslintParser,
			parserOptions: {
				ecmaVersion: 2021,
				sourceType: "module",
				ecmaFeatures: {
					jsx: true,
				},
				// Make project optional to avoid errors with files outside the project
				project: null,
			},
			globals: {
				...globals.browser,
				...globals.node,
				...globals.jest, // Add Jest globals
			},
		},
		plugins: {
			"@typescript-eslint": tseslintPlugin,
			react: reactPlugin,
			"react-hooks": reactHooksPlugin,
		},
		rules: {
			...pluginJs.configs.recommended.rules,
			...tseslintPlugin.configs.recommended.rules,
			"react/jsx-uses-react": "error",
			"react/jsx-uses-vars": "error",
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
		},
	},
	// Ignore patterns
	{
		ignores: ["node_modules/", "dist/", "build/", "coverage/", "*.cjs"],
	},
]
