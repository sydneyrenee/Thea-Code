import * as vscode from "vscode"
import delay from "delay"

import { ClineProvider } from "../core/webview/ClineProvider"
import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"
// TODO: Update this path if the generated file is elsewhere relative to src/activate
import { EXTENSION_NAME, EXTENSION_DISPLAY_NAME, HOMEPAGE_URL, COMMANDS } from "../../dist/thea-config"

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
 */
export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

/**
 * Set panel references
 */
export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel } = options

	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		// Note: We still register using the command string from the map key,
		// but the map itself uses the constants for definition.
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	// Use COMMANDS constants for keys
	return {
		[COMMANDS.PLUS_BUTTON]: async () => {
			await provider.removeClineFromStack()
			await provider.postStateToWebview()
			await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		},
		[COMMANDS.MCP_BUTTON]: () => {
			provider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
		},
		[COMMANDS.PROMPTS_BUTTON]: () => {
			provider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
		},
		[COMMANDS.POPOUT_BUTTON]: () => openClineInNewTab({ context, outputChannel }),
		[COMMANDS.OPEN_NEW_TAB]: () => openClineInNewTab({ context, outputChannel }),
		[COMMANDS.SETTINGS_BUTTON]: () => {
			provider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		},
		[COMMANDS.HISTORY_BUTTON]: () => {
			provider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
		},
		[COMMANDS.HELP_BUTTON]: () => {
			vscode.env.openExternal(vscode.Uri.parse(HOMEPAGE_URL))
		},
		// Assuming these commands were intended to be prefixed - using dynamic prefixing
		[`${EXTENSION_NAME}.showHumanRelayDialog`]: (params: { requestId: string; promptText: string }) => {
			const panel = getPanel()
			if (panel) {
				panel?.webview.postMessage({
					type: "showHumanRelayDialog",
					requestId: params.requestId,
					promptText: params.promptText,
				})
			}
		},
		[`${EXTENSION_NAME}.registerHumanRelayCallback`]: registerHumanRelayCallback,
		[`${EXTENSION_NAME}.unregisterHumanRelayCallback`]: unregisterHumanRelayCallback,
		[`${EXTENSION_NAME}.handleHumanRelayResponse`]: handleHumanRelayResponse,
		[`${EXTENSION_NAME}.newTask`]: handleNewTask,
		[`${EXTENSION_NAME}.setCustomStoragePath`]: async () => {
			const { promptForCustomStoragePath } = await import("../shared/storagePathManager")
			await promptForCustomStoragePath()
		},
	}
}

const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const tabProvider = new ClineProvider(context, outputChannel, "editor")
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, EXTENSION_DISPLAY_NAME, targetCol, { // Use imported constant
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	// TODO: Use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	newPanel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "rocket.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "rocket.png"),
	}

	await tabProvider.resolveWebviewView(newPanel)

	// Handle panel closing events.
	newPanel.onDidDispose(() => {
		setPanel(undefined, "tab")
	})

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")
}

