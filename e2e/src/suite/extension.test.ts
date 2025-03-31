import * as assert from "assert"
import * as vscode from "vscode"
import { COMMANDS } from "../../../dist/thea-config";


suite("Thea Code Extension", () => {
	test("OPENROUTER_API_KEY environment variable is set", () => {
		if (!process.env.OPENROUTER_API_KEY) {
			assert.fail("OPENROUTER_API_KEY environment variable is not set")
		}
	})

	test("Commands should be registered", async () => {
		const expectedCommands = [
			COMMANDS.PLUS_BUTTON,
			COMMANDS.MCP_BUTTON,
			COMMANDS.HISTORY_BUTTON,
			COMMANDS.POPOUT_BUTTON,
			COMMANDS.SETTINGS_BUTTON,
			COMMANDS.OPEN_NEW_TAB,
			COMMANDS.EXPLAIN_CODE,
			COMMANDS.FIX_CODE,
			COMMANDS.IMPROVE_CODE,
		]

		const commands = await vscode.commands.getCommands(true)

		for (const cmd of expectedCommands) {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`)
		}
	})
})
