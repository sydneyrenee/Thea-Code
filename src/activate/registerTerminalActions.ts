import * as vscode from "vscode"
import { TheaProvider } from "../core/webview/TheaProvider" // Renamed import
import { Terminal } from "../integrations/terminal/Terminal"
import { t } from "../i18n"
import { COMMANDS } from "../../dist/thea-config" // Import branded constants
import type { AI_IDENTITY_NAME } from "../../dist/thea-config" // Import branded constant
const TERMINAL_COMMAND_IDS = {
	ADD_TO_CONTEXT: COMMANDS.TERMINAL_ADD_TO_CONTEXT,
	FIX: COMMANDS.TERMINAL_FIX,
	FIX_IN_CURRENT_TASK: COMMANDS.TERMINAL_FIX_CURRENT,
	EXPLAIN: COMMANDS.TERMINAL_EXPLAIN,
	EXPLAIN_IN_CURRENT_TASK: COMMANDS.TERMINAL_EXPLAIN_CURRENT,
} as const

export const registerTerminalActions = (context: vscode.ExtensionContext) => {
	registerTerminalAction(context, TERMINAL_COMMAND_IDS.ADD_TO_CONTEXT, "TERMINAL_ADD_TO_CONTEXT")

	registerTerminalActionPair(
		context,
		TERMINAL_COMMAND_IDS.FIX,
		"TERMINAL_FIX",
		`What would you like ${AI_IDENTITY_NAME} to fix?`,
	)

	registerTerminalActionPair(
		context,
		TERMINAL_COMMAND_IDS.EXPLAIN,
		"TERMINAL_EXPLAIN",
		`What would you like ${AI_IDENTITY_NAME} to explain?`,
	)
}

const registerTerminalAction = (
	context: vscode.ExtensionContext,
	command: string,
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
	inputPrompt?: string,
) => {
	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (args: { selection?: string }) => {
			let content = args.selection
			if (!content || content === "") {
				content = await Terminal.getTerminalContents(promptType === "TERMINAL_ADD_TO_CONTEXT" ? -1 : 1)
			}

			if (!content) {
				void vscode.window.showWarningMessage(t("common:warnings.no_terminal_content"))
				return
			}

			const params: Record<string, string> = {
				terminalContent: content,
			}

			if (inputPrompt) {
				params.userInput =
					(await vscode.window.showInputBox({
						prompt: inputPrompt,
					})) ?? ""
			}

			await TheaProvider.handleTerminalAction(command, promptType, params) // Renamed static method call
		}),
	)
}

const registerTerminalActionPair = (
	context: vscode.ExtensionContext,
	baseCommand: string,
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
	inputPrompt?: string,
) => {
	// Register new task version
	registerTerminalAction(context, baseCommand, promptType, inputPrompt)
	// Register current task version
	registerTerminalAction(context, `${baseCommand}InCurrentTask`, promptType, inputPrompt)
}
