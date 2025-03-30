import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { Terminal } from "../integrations/terminal/Terminal"
import { t } from "../i18n"
// TODO: Update this path if the generated file is elsewhere relative to src/activate
import { COMMANDS, EXTENSION_DISPLAY_NAME } from "../../dist/thea-config" // Import from generated config

const TERMINAL_COMMAND_IDS = {
	ADD_TO_CONTEXT: COMMANDS.TERMINAL_ADD_TO_CONTEXT,
	FIX: COMMANDS.TERMINAL_FIX,
	FIX_IN_CURRENT_TASK: COMMANDS.TERMINAL_FIX_CURRENT,
	EXPLAIN: COMMANDS.TERMINAL_EXPLAIN,
	EXPLAIN_IN_CURRENT_TASK: COMMANDS.TERMINAL_EXPLAIN_CURRENT,
} as const

export const registerTerminalActions = (context: vscode.ExtensionContext) => {
	registerTerminalAction(context, TERMINAL_COMMAND_IDS.ADD_TO_CONTEXT, "TERMINAL_ADD_TO_CONTEXT")

	registerTerminalActionPair(context, TERMINAL_COMMAND_IDS.FIX, "TERMINAL_FIX", `What would you like ${EXTENSION_DISPLAY_NAME} to fix?`)

	registerTerminalActionPair(
		context,
		TERMINAL_COMMAND_IDS.EXPLAIN,
		"TERMINAL_EXPLAIN",
		`What would you like ${EXTENSION_DISPLAY_NAME} to explain?`,
	)
}

const registerTerminalAction = (
	context: vscode.ExtensionContext,
	command: string,
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
	inputPrompt?: string,
) => {
	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (args: any) => {
			let content = args.selection
			if (!content || content === "") {
				content = await Terminal.getTerminalContents(promptType === "TERMINAL_ADD_TO_CONTEXT" ? -1 : 1)
			}

			if (!content) {
				vscode.window.showWarningMessage(t("common:warnings.no_terminal_content"))
				return
			}

			const params: Record<string, any> = {
				terminalContent: content,
			}

			if (inputPrompt) {
				params.userInput =
					(await vscode.window.showInputBox({
						prompt: inputPrompt,
					})) ?? ""
			}

			await ClineProvider.handleTerminalAction(command, promptType, params)
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
