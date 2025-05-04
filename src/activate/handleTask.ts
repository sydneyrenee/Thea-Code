import * as vscode from "vscode"
import { COMMAND_IDS } from "../core/CodeActionProvider"
import { TheaProvider } from "../core/webview/TheaProvider" // Renamed import
import { t } from "../i18n"
import { VIEWS } from "../../dist/thea-config" // Import branded constants

export const handleNewTask = async (params: { prompt?: string } | null | undefined) => {
	let prompt = params?.prompt
	if (!prompt) {
		prompt = await vscode.window.showInputBox({
			prompt: t("common:input.task_prompt"),
			placeHolder: t("common:input.task_placeholder"),
		})
	}
	if (!prompt) {
		await vscode.commands.executeCommand(`${VIEWS.SIDEBAR}.focus`) 
		return
	}

	await TheaProvider.handleCodeAction(COMMAND_IDS.NEW_TASK, "NEW_TASK", { // Renamed static method call
		userInput: prompt,
	})
}
