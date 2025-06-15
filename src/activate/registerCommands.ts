import * as vscode from "vscode"
import delay from "delay"

import { TheaProvider } from "../core/webview/TheaProvider" // Renamed import
import { EXTENSION_NAME, EXTENSION_DISPLAY_NAME, HOMEPAGE_URL, COMMANDS } from "../../dist/thea-config" // Import branded constants

import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask" // Fixed: removed type-only import

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
	provider: TheaProvider // Renamed type
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context } = options

	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		context.subscriptions.push(
			vscode.commands.registerCommand(command, callback as (...args: unknown[]) => unknown),
		)
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	return {
		// Construct internal command ID using EXTENSION_NAME
		[`${EXTENSION_NAME}.activationCompleted`]: () => {},
		[COMMANDS.PLUS_BUTTON]: async () => {
			await provider.removeFromStack()
			await provider.postStateToWebview()
			await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		},
		[COMMANDS.MCP_BUTTON]: () => {
			void provider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
		},
		[COMMANDS.PROMPTS_BUTTON]: () => {
			void provider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
		},
		[COMMANDS.POPOUT_BUTTON]: () => openTheaInNewTab({ context, outputChannel }), // Renamed function call
		[COMMANDS.OPEN_NEW_TAB]: () => openTheaInNewTab({ context, outputChannel }), // Renamed function call
		[COMMANDS.SETTINGS_BUTTON]: () => {
			void provider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		},
		[COMMANDS.HISTORY_BUTTON]: () => {
			void provider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
		},
		[COMMANDS.HELP_BUTTON]: () => {
			vscode.env.openExternal(vscode.Uri.parse(HOMEPAGE_URL))
		},
		// Assuming this command ID uses EXTENSION_NAME prefix convention implicitly
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
		// Assuming this command ID uses EXTENSION_NAME prefix convention implicitly
		[`${EXTENSION_NAME}.registerHumanRelayCallback`]: registerHumanRelayCallback,
		// Assuming this command ID uses EXTENSION_NAME prefix convention implicitly
		[`${EXTENSION_NAME}.unregisterHumanRelayCallback`]: unregisterHumanRelayCallback,
		// Assuming this command ID uses EXTENSION_NAME prefix convention implicitly
		[`${EXTENSION_NAME}.handleHumanRelayResponse`]: handleHumanRelayResponse,
		[COMMANDS.NEW_TASK]: handleNewTask,
		// Assuming this command ID uses EXTENSION_NAME prefix convention implicitly
		[`${EXTENSION_NAME}.setCustomStoragePath`]: async () => {
			const { promptForCustomStoragePath } = await import("../shared/storagePathManager")
			await promptForCustomStoragePath()
		},
	}
}

const openTheaInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// Renamed function
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const tabProvider = new TheaProvider(context, outputChannel, "editor") // Renamed constructor
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		void (await vscode.commands.executeCommand("workbench.action.newGroupRight"))
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(TheaProvider.tabPanelId, EXTENSION_DISPLAY_NAME, targetCol, {
		// Renamed static property access
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	// TODO: Use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	newPanel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_light.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_dark.png"),
	}

	await tabProvider.resolveWebviewView(newPanel)

	// Handle panel closing events.
	newPanel.onDidDispose(() => {
		setPanel(undefined, "tab")
	})

	// Lock the editor group so clicking on files doesn't open them over the panel.
	void (await delay(100))
	void (await vscode.commands.executeCommand("workbench.action.lockEditorGroup"))
}
