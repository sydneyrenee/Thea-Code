import * as vscode from "vscode"

import { ACTION_NAMES, COMMAND_IDS } from "../core/CodeActionProvider"
import { EditorUtils } from "../core/EditorUtils"
import { ClineProvider } from "../core/webview/ClineProvider"
// TODO: Update this path if the generated file is elsewhere relative to src/activate
import { EXTENSION_DISPLAY_NAME } from "../../dist/thea-config" // Import from generated config

export const registerCodeActions = (context: vscode.ExtensionContext) => {
	registerCodeActionPair(
		context,
		COMMAND_IDS.EXPLAIN,
		"EXPLAIN",
		`What would you like ${EXTENSION_DISPLAY_NAME} to explain?`, // Use imported constant
		"E.g. How does the error handling work?",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.FIX,
		"FIX",
		`What would you like ${EXTENSION_DISPLAY_NAME} to fix?`, // Use imported constant
		"E.g. Maintain backward compatibility",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.IMPROVE,
		"IMPROVE",
		`What would you like ${EXTENSION_DISPLAY_NAME} to improve?`, // Use imported constant
		"E.g. Focus on performance optimization",
	)

	registerCodeAction(context, COMMAND_IDS.ADD_TO_CONTEXT, "ADD_TO_CONTEXT")
}

const registerCodeAction = (
	context: vscode.ExtensionContext,
	command: string,
	promptType: keyof typeof ACTION_NAMES,
	inputPrompt?: string,
	inputPlaceholder?: string,
) => {
	let userInput: string | undefined

	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (...args: any[]) => {
			if (inputPrompt) {
				userInput = await vscode.window.showInputBox({
					prompt: inputPrompt,
					placeHolder: inputPlaceholder,
				})
			}

			// Handle both code action and direct command cases.
			let filePath: string
			let selectedText: string
			let diagnostics: any[] | undefined

			if (args.length > 1) {
				// Called from code action.
				;[filePath, selectedText, diagnostics] = args
			} else {
				// Called directly from command palette.
				const context = EditorUtils.getEditorContext()
				if (!context) return
				;({ filePath, selectedText, diagnostics } = context)
			}

			const params = {
				...{ filePath, selectedText },
				...(diagnostics ? { diagnostics } : {}),
				...(userInput ? { userInput } : {}),
			}

			await ClineProvider.handleCodeAction(command, promptType, params)
		}),
	)
}

const registerCodeActionPair = (
	context: vscode.ExtensionContext,
	baseCommand: string,
	promptType: keyof typeof ACTION_NAMES,
	inputPrompt?: string,
	inputPlaceholder?: string,
) => {
	// Register new task version.
	registerCodeAction(context, baseCommand, promptType, inputPrompt, inputPlaceholder)

	// Register current task version.
	registerCodeAction(context, `${baseCommand}InCurrentTask`, promptType, inputPrompt, inputPlaceholder)
}
