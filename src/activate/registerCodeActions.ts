import * as vscode from "vscode"

import { ACTION_NAMES, COMMAND_IDS } from "../core/CodeActionProvider"
import { EditorUtils } from "../core/EditorUtils"
import { TheaProvider } from "../core/webview/TheaProvider" // Renamed import
import { AI_IDENTITY_NAME } from "../../dist/thea-config" // Fixed: removed type-only import

export const registerCodeActions = (context: vscode.ExtensionContext) => {
	registerCodeActionPair(
		context,
		COMMAND_IDS.EXPLAIN,
		"EXPLAIN",
		`What would you like ${AI_IDENTITY_NAME} to explain?`,
		"E.g. How does the error handling work?",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.FIX,
		"FIX",
		`What would you like ${AI_IDENTITY_NAME} to fix?`,
		"E.g. Maintain backward compatibility",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.IMPROVE,
		"IMPROVE",
		`What would you like ${AI_IDENTITY_NAME} to improve?`,
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
		vscode.commands.registerCommand(
			command,
			async (
				argFilePath?: string,
				argSelectedText?: string,
				argStartLine?: number,
				argEndLine?: number,
				argDiagnostics?: vscode.Diagnostic[],
			) => {
				if (inputPrompt) {
					userInput = await vscode.window.showInputBox({
						prompt: inputPrompt,
						placeHolder: inputPlaceholder,
					})
				}

				let filePath: string
				let selectedText: string
				let startLine: number | undefined
				let endLine: number | undefined
				let diagnostics: vscode.Diagnostic[] | undefined

				// Determine if called from code action or direct command
				if (argFilePath !== undefined && argSelectedText !== undefined) {
					// Called from code action.
					filePath = argFilePath
					selectedText = argSelectedText
					startLine = argStartLine
					endLine = argEndLine
					diagnostics = argDiagnostics
				} else {
					// Called directly from command palette.
					const context = EditorUtils.getEditorContext()
					if (!context) return
					;({ filePath, selectedText, startLine, endLine, diagnostics } = context)
				}

				const params: Record<string, string | vscode.Diagnostic[]> = {
					filePath,
					selectedText,
				}

				if (startLine !== undefined) {
					params.startLine = startLine.toString()
				}
				if (endLine !== undefined) {
					params.endLine = endLine.toString()
				}
				if (diagnostics) {
					params.diagnostics = diagnostics
				}
				if (userInput) {
					params.userInput = userInput
				}

				await TheaProvider.handleCodeAction(command, promptType, params)
			},
		),
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
