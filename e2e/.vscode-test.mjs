/**
 * See: https://code.visualstudio.com/api/working-with-extensions/testing-extension
 */

import { defineConfig } from '@vscode/test-cli';
import { EXTENSION_ID } from "../dist/thea-config.js"; // Import branded constant

export default defineConfig({
	label: 'integrationTest',
	files: 'out/suite/**/*.test.js',
	workspaceFolder: '.',
	mocha: {
		ui: 'tdd',
		timeout: 60000,
	},
	launchArgs: [
		`--enable-proposed-api=${EXTENSION_ID}`, // Use constant
		'--disable-extensions'
	]
});
