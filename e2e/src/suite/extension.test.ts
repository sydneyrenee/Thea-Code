import * as assert from "assert"
import * as vscode from "vscode"
import { EXTENSION_NAME, EXTENSION_DISPLAY_NAME } from "../../../dist/thea-config" // Import branded constant

suite(`${EXTENSION_DISPLAY_NAME} Extension`, () => {
	test("OPENROUTER_API_KEY environment variable is set", () => {
		if (!process.env.OPENROUTER_API_KEY) {
			assert.fail("OPENROUTER_API_KEY environment variable is not set")
		}
	})

	test("Commands should be registered", async () => {
		const expectedCommands = [
			`${EXTENSION_NAME}.plusButtonClicked`,
			`${EXTENSION_NAME}.mcpButtonClicked`,
			`${EXTENSION_NAME}.historyButtonClicked`,
			`${EXTENSION_NAME}.popoutButtonClicked`,
			`${EXTENSION_NAME}.settingsButtonClicked`,
			`${EXTENSION_NAME}.openInNewTab`,
			`${EXTENSION_NAME}.explainCode`,
			`${EXTENSION_NAME}.fixCode`,
			`${EXTENSION_NAME}.improveCode`,
		]

		const commands = await vscode.commands.getCommands(true)

		for (const cmd of expectedCommands) {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`)
		}
	})
})
