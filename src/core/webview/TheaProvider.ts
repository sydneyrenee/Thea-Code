import os from "os"
import EventEmitter from "events"

import delay from "delay"
import axios from "axios"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"

import { GlobalState, TheaCodeSettings, TokenUsage } from "../../schemas" // Added TokenUsage import
import { t } from "../../i18n"
import { setPanel } from "../../activate/registerCommands"
import { ApiConfiguration, ModelInfo } from "../../shared/api"
import { findLast } from "../../shared/array"
import { supportPrompt, type PromptParams } from "../../shared/support-prompt"
import { HistoryItem } from "../../shared/HistoryItem"
import { ExtensionMessage, TheaMessage } from "../../shared/ExtensionMessage" // Added TheaMessage import
import { Mode, PromptComponent, defaultModeSlug } from "../../shared/modes"
import { Terminal, TERMINAL_SHELL_INTEGRATION_TIMEOUT } from "../../integrations/terminal/Terminal"
import { getTheme } from "../../integrations/theme/getTheme"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { McpHub } from "../../services/mcp/management/McpHub"
import { McpServerManager } from "../../services/mcp/management/McpServerManager"
import { ShadowCheckpointService } from "../../services/checkpoints/ShadowCheckpointService"
import { setSoundEnabled } from "../../utils/sound"
import { setTtsEnabled, setTtsSpeed } from "../../utils/tts"
import { ContextProxy } from "../config/ContextProxy"
import { ProviderSettingsManager } from "../config/ProviderSettingsManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { buildApiHandler } from "../../api"
import type { ACTION_NAMES } from "../CodeActionProvider"
import { TheaTask, TheaTaskOptions } from "../TheaTask" // Corrected import
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { telemetryService } from "../../services/telemetry/TelemetryService"
import { getWorkspacePath } from "../../utils/path"
import { webviewMessageHandler } from "./webviewMessageHandler"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { EXTENSION_DISPLAY_NAME, VIEWS, CONFIG } from "../../../dist/thea-config" // Correct import path and add EXTENSION_CONFIG_DIR, CONFIG
import { TheaTaskStack } from "./thea/TheaTaskStack" // Renamed import
import { TheaStateManager } from "./thea/TheaStateManager" // Renamed import
import { TheaApiManager } from "./api/TheaApiManager" // Renamed import
import { TheaTaskHistory } from "./history/TheaTaskHistory" // Renamed import
import { TheaCacheManager } from "./cache/TheaCacheManager" // Renamed import
import { TheaMcpManager } from "./mcp/TheaMcpManager" // Renamed import
import { logger } from "../../utils/logging"

/**
 * https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts
 * https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
 */

export type TheaProviderEvents = {
	// Renamed
	theaTaskCreated: [task: TheaTask] // Renamed event and type
	// Added missing events from original TheaEvents
	message: [{ taskId: string; action: "created" | "updated"; message: TheaMessage }]
	taskStarted: [taskId: string]
	taskPaused: [taskId: string]
	taskUnpaused: [taskId: string]
	taskAskResponded: [taskId: string]
	taskAborted: [taskId: string]
	taskSpawned: [taskId: string, childTaskId: string]
	taskCompleted: [taskId: string, usage: TokenUsage]
	taskTokenUsageUpdated: [taskId: string, usage: TokenUsage]
}

export class TheaProvider extends EventEmitter<TheaProviderEvents> implements vscode.WebviewViewProvider {
	// TODO: Rename
	public static readonly sideBarId = VIEWS.SIDEBAR
	public static readonly tabPanelId = VIEWS.TAB_PANEL
	private static activeInstances: Set<TheaProvider> = new Set() // TODO: Rename
	private disposables: vscode.Disposable[] = []
	// not private, so it can be accessed from webviewMessageHandler
	view?: vscode.WebviewView | vscode.WebviewPanel
	// not private, so it can be accessed from webviewMessageHandler
	// callers could update to get viewLaunched() getter function
	isViewLaunched = false
	// not private, so it can be accessed from webviewMessageHandler
	workspaceTracker?: WorkspaceTracker
	// not protected, so it can be accessed from webviewMessageHandler.
	// Could modify code to use getMcpHub() instead.
	mcpHub?: McpHub // Change from private to protected
	// not private, so it can be accessed from webviewMessageHandler
	latestAnnouncementId = "mar-30-2025-3-11" // update for v3.11.0 announcement
	// Add messageHandler property for testing
	messageHandler = webviewMessageHandler
	// not private, so it can be accessed from webviewMessageHandler
	settingsImportedAt?: number
	public readonly contextProxy: ContextProxy
	public readonly providerSettingsManager: ProviderSettingsManager
	public readonly customModesManager: CustomModesManager
	private readonly theaTaskStackManager: TheaTaskStack
	private readonly theaStateManager: TheaStateManager
	private readonly theaApiManager: TheaApiManager
	private readonly theaTaskHistoryManager: TheaTaskHistory
	private readonly theaCacheManager: TheaCacheManager
	private readonly theaMcpManager: TheaMcpManager

	constructor(
		readonly context: vscode.ExtensionContext,
		// not private, so it can be accessed from webviewMessageHandler
		readonly outputChannel: vscode.OutputChannel,
		private readonly renderContext: "sidebar" | "editor" = "sidebar",
	) {
		super()

		this.outputChannel.appendLine("TheaProvider instantiated")
		this.contextProxy = new ContextProxy(context)
		TheaProvider.activeInstances.add(this)

		// Register this provider with the telemetry service to enable it to add
		// properties like mode and provider.
		telemetryService.setProvider(this)

		this.workspaceTracker = new WorkspaceTracker(this)

		this.providerSettingsManager = new ProviderSettingsManager(this.context)

		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})
		this.theaTaskStackManager = new TheaTaskStack() // Renamed property and constructor
		this.theaStateManager = new TheaStateManager(
			this.context,
			this.providerSettingsManager,
			this.customModesManager,
		) // Renamed property and constructor
		this.theaStateManager.getCustomModes = () => this.customModesManager.getCustomModes() // Renamed property
		this.theaApiManager = new TheaApiManager(
			this.context,
			this.outputChannel,
			this.contextProxy,
			this.providerSettingsManager,
		) // Renamed property and constructor
		this.theaTaskHistoryManager = new TheaTaskHistory(this.context, this.contextProxy) // Renamed property and constructor
		this.theaCacheManager = new TheaCacheManager(this.context) // Renamed property and constructor
		this.theaMcpManager = new TheaMcpManager(this.context) // Renamed property and constructor

		// Initialize MCP Hub through the singleton manager
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub // Keep local reference
				this.mcpHub = hub // Keep local reference if needed
				this.theaMcpManager.setMcpHub(hub) // Renamed property
			})
			.catch((error) => {
				this.outputChannel.appendLine(`Failed to initialize MCP Hub: ${error}`)
			})
	}

	// Stack related methods (addToStack, removeFromStack, getCurrent, getStackSize, getCurrentTaskStack, finishSubTask)
	// removed and delegated to StackManager instance.

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		this.outputChannel.appendLine("Disposing TheaProvider...") // TODO: Rename
		await this.theaTaskStackManager.removeCurrentTheaTask() // Renamed property
		this.outputChannel.appendLine("Cleared task")

		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.outputChannel.appendLine("Disposed webview")
		}

		while (this.disposables.length) {
			const x = this.disposables.pop()

			if (x) {
				x.dispose()
			}
		}

		this.workspaceTracker?.dispose()
		this.workspaceTracker = undefined
		void this.mcpHub?.dispose()
		this.mcpHub = undefined
		this.customModesManager?.dispose()
		void this.theaMcpManager?.dispose() // Renamed property
		this.outputChannel.appendLine("Disposed all disposables")
		TheaProvider.activeInstances.delete(this) // TODO: Rename

		// Unregister from McpServerManager
		McpServerManager.unregisterProvider(this)
	}

	public static getVisibleInstance(): TheaProvider | undefined {
		// TODO: Rename
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	public static async getInstance(): Promise<TheaProvider | undefined> {
		// TODO: Rename
		let visibleProvider = TheaProvider.getVisibleInstance() // TODO: Rename

		// If no visible provider, try to show the sidebar view
		if (!visibleProvider) {
			await vscode.commands.executeCommand(`${VIEWS.SIDEBAR}.focus`)
			// Wait briefly for the view to become visible
			await delay(100)
			visibleProvider = TheaProvider.getVisibleInstance() // TODO: Rename
		}

		// If still no visible provider, return
		if (!visibleProvider) {
			return
		}

		return visibleProvider
	}

	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await TheaProvider.getInstance() // TODO: Rename
		if (!visibleProvider) {
			return false
		}

		// check if there is a  instance in the stack (if this provider has an active task)
		if (visibleProvider.theaTaskStackManager.getCurrentTheaTask()) {
			// Renamed property
			return true
		}

		return false
	}

	public static async handleCodeAction(
		command: string,
		promptType: keyof typeof ACTION_NAMES,
		params: Partial<PromptParams>,
	): Promise<void> {
		const visibleProvider = await TheaProvider.getInstance() // TODO: Rename

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.theaStateManager.getState() // Renamed property

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command.endsWith("addToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})

			return
		}

		if (visibleProvider.theaTaskStackManager.getCurrentTheaTask() && command.endsWith("InCurrentTask")) {
			// Renamed property
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text: prompt })
			return
		}

		await visibleProvider.initWithTask(prompt) // TODO: Rename
	}

	public static async handleTerminalAction(
		command: string,
		promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
		params: Partial<PromptParams>,
	): Promise<void> {
		const visibleProvider = await TheaProvider.getInstance() // TODO: Rename
		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.theaStateManager.getState() // Renamed property

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command.endsWith("AddToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})
			return
		}

		if (visibleProvider.theaTaskStackManager.getCurrentTheaTask() && command.endsWith("InCurrentTask")) {
			// Renamed property
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "sendMessage",
				text: prompt,
			})
			return
		}

		await visibleProvider.initWithTask(prompt) // TODO: Rename
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.outputChannel.appendLine("Resolving webview view")

		if (!this.contextProxy.isInitialized) {
			await this.contextProxy.initialize()
		}

		this.view = webviewView

		// Set panel reference according to webview type
		if ("onDidChangeViewState" in webviewView) {
			// Tag page type
			setPanel(webviewView, "tab")
		} else if ("onDidChangeVisibility" in webviewView) {
			// Sidebar Type
			setPanel(webviewView, "sidebar")
		}

		// Ensure messageHandler is properly set up
		this.messageHandler = webviewMessageHandler

		// Initialize out-of-scope variables that need to recieve persistent global state values
		void this.theaStateManager.getState().then(({ soundEnabled, terminalShellIntegrationTimeout }) => {
			// Renamed property
			setSoundEnabled(soundEnabled ?? false)
			Terminal.setShellIntegrationTimeout(terminalShellIntegrationTimeout ?? TERMINAL_SHELL_INTEGRATION_TIMEOUT)
		})

		// Initialize tts enabled state
		void this.theaStateManager.getState().then(({ ttsEnabled }) => {
			// Renamed property
			setTtsEnabled(ttsEnabled ?? false)
		})

		// Initialize tts speed state
		void this.theaStateManager.getState().then(({ ttsSpeed }) => {
			// Renamed property
			setTtsSpeed(ttsSpeed ?? 1)
		})

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [this.contextProxy.extensionUri],
		}

		webviewView.webview.html =
			this.contextProxy.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: this.getHtmlContent(webviewView.webview)

		// Sets up an event listener to listen for messages passed from the webview view context
		// and executes code based on the message that is recieved
		this.setWebviewMessageListener(webviewView.webview)

		// Logs show up in bottom panel > Debug Console
		//console.log("registering listener")

		// Listen for when the panel becomes visible
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView and WebviewPanel have all the same properties except for this visibility listener
			// panel
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						void this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			// sidebar
			webviewView.onDidChangeVisibility(
				() => {
					if (this.view?.visible) {
						void this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables,
			)
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				await this.dispose()
			},
			null,
			this.disposables,
		)

		// Listen for when color changes
		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					// Sends latest theme name to webview
					await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
				}
			},
			null,
			this.disposables,
		)

		// If the extension is starting a new session, clear previous task state.
		await this.theaTaskStackManager.removeCurrentTheaTask() // Renamed property

		this.outputChannel.appendLine("Webview view resolved")
	}

	public async initWithSubTask(parent: TheaTask, task?: string, images?: string[]) {
		// Renamed type
		return this.initWithTask(task, images, parent) // TODO: Rename
	}

	// when initializing a new task, (not from history but from a tool command new_task) there is no need to remove the previouse task
	// since the new task is a sub task of the previous one, and when it finishes it is removed from the stack and the caller is resumed
	// in this way we can have a chain of tasks, each one being a sub task of the previous one until the main task is finished
	public async initWithTask(task?: string, images?: string[], parentTask?: TheaTask) {
		// Renamed type
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled: enableDiff,
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.theaStateManager.getState() // Renamed property

		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		const theaTask = new TheaTask({
			// Renamed constructor and variable
			provider: this,
			apiConfiguration, // This already comes from StateManager.getState()
			customInstructions: effectiveInstructions,
			enableDiff,
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			task,
			images,
			experiments,
			rootTask: this.theaTaskStackManager.getSize() > 0 ? this.theaTaskStackManager["stack"][0] : undefined, // Renamed property
			parentTask,
			taskNumber: this.theaTaskStackManager.getSize() + 1, // Renamed property
			onCreated: (task) => this.emit("theaTaskCreated", task), // Renamed event and payload
		})

		// Delegate adding task to stack manager, handle provider-level validation first
		const state = await this.theaStateManager.getState() // Renamed property
		if (!state || typeof state.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
		await this.theaTaskStackManager.addTheaTask(theaTask) // Renamed property
		this.log(
			`[subtasks] ${theaTask.parentTask ? "child" : "parent"} task ${theaTask.taskId}.${theaTask.instanceId} instantiated`, // Use renamed variable
		)
		return theaTask // Return renamed variable
	}

	public async initWithHistoryItem(historyItem: HistoryItem & { rootTask?: TheaTask; parentTask?: TheaTask }) {
		// Renamed type
		await this.theaTaskStackManager.removeCurrentTheaTask() // Renamed property

		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled: enableDiff,
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.theaStateManager.getState() // Renamed property

		const modePrompt = customModePrompts?.[mode] as PromptComponent
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		const taskId = historyItem.id
		const globalStorageDir = this.contextProxy.globalStorageUri.fsPath
		const workspaceDir = this.cwd

		const checkpoints: Pick<TheaTaskOptions, "enableCheckpoints" | "checkpointStorage"> = {
			// Renamed type
			enableCheckpoints,
			checkpointStorage,
		}

		if (enableCheckpoints) {
			try {
				checkpoints.checkpointStorage = await ShadowCheckpointService.getTaskStorage({
					taskId,
					globalStorageDir,
					workspaceDir,
				})

				this.log(
					`[TheaProvider#initWithHistoryItem] Using ${checkpoints.checkpointStorage} storage for ${taskId}`, // TODO: Rename
				)
			} catch (error) {
				checkpoints.enableCheckpoints = false
				this.log(
					`[TheaProvider#initWithHistoryItem] Error getting task storage: ${error instanceof Error ? error.message : String(error)}`,
				) // TODO: Rename
			}
		}

		const theaTask = new TheaTask({
			// Renamed constructor and variable
			provider: this,
			apiConfiguration, // This already comes from StateManager.getState()
			customInstructions: effectiveInstructions,
			enableDiff,
			...checkpoints,
			fuzzyMatchThreshold,
			historyItem,
			experiments,
			rootTask: historyItem.rootTask,
			parentTask: historyItem.parentTask,
			taskNumber: historyItem.number,
			onCreated: (task) => this.emit("theaTaskCreated", task), // Renamed event and payload
		})
		// Delegate adding  to stack manager, handle provider-level validation first
		const stateForHistory = await this.theaStateManager.getState() // Renamed property
		if (!stateForHistory || typeof stateForHistory.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
		await this.theaTaskStackManager.addTheaTask(theaTask) // Renamed property
		this.log(
			`[subtasks] ${theaTask.parentTask ? "child" : "parent"} task ${theaTask.taskId}.${theaTask.instanceId} instantiated`, // Use renamed variable
		)
		return theaTask // Return renamed variable
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		const localPort = "5173"
		const localServerUrl = `localhost:${localPort}`

		// Check if local dev server is running.
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch {
			vscode.window.showErrorMessage(t("common:errors.hmr_not_running"))

			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()

		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])

		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} data:`,
			`script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src https://* https://*.posthog.com ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="${stylesUri.toString()}">
					<link href="${codiconsUri.toString()}" rel="stylesheet" />
					<script nonce="${nonce}">
						window.IMAGES_BASE_URI = "${imagesUri.toString()}"
					</script>
					<title>${EXTENSION_DISPLAY_NAME}</title> 
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		// Get the local path to main script run in the webview,
		// then convert it to a uri we can use in the webview.

		// The CSS file from the React build output
		const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])
		// The JS file from the React build output
		const scriptUri = getUri(webview, this.contextProxy.extensionUri, ["webview-ui", "build", "assets", "index.js"])

		// The codicon font from the React build output
		// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-codicons-sample/src/extension.ts
		// we installed this package in the extension so that we can access it how its intended from the extension (the font file is likely bundled in vscode), and we just import the css fileinto our react app we don't have access to it
		// don't forget to add font-src ${webview.cspSource};
		const codiconsUri = getUri(webview, this.contextProxy.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const imagesUri = getUri(webview, this.contextProxy.extensionUri, ["assets", "images"])

		// const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.js"))

		// const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "reset.css"))
		// const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "vscode.css"))

		// // Same for stylesheet
		// const stylesheetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.css"))

		// Use a nonce to only allow a specific script to be run.
		/*
		content security policy of your webview to only allow scripts that have a specific nonce
		create a content security policy meta tag so that only loading scripts with a nonce is allowed
		As your extension grows you will likely want to add custom styles, fonts, and/or images to your webview. If you do, you will need to update the content security policy meta tag to explicity allow for these resources. E.g.
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
		- 'unsafe-inline' is required for styles due to vscode-webview-toolkit's dynamic style injection
		- since we pass base64 images to the webview, we need to specify img-src ${webview.cspSource} data:;

		in meta tag we add nonce attribute: A cryptographic nonce (only used once) to allow scripts. The server must generate a unique nonce value each time it transmits a policy. It is critical to provide a nonce that cannot be guessed as bypassing a resource's policy is otherwise trivial.
		*/
		const nonce = getNonce()

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}' https://us-assets.i.posthog.com; connect-src https://openrouter.ai https://us.i.posthog.com https://us-assets.i.posthog.com;">
            <link rel="stylesheet" type="text/css" href="${stylesUri.toString()}">
			<link href="${codiconsUri.toString()}" rel="stylesheet" />
			<script nonce="${nonce}">
				window.IMAGES_BASE_URI = "${imagesUri.toString()}"
			</script>
            <title>${EXTENSION_DISPLAY_NAME}</title> 
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
          </body>
        </html>
      `
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is recieved.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		// Use the messageHandler property for consistency with tests
		const onReceiveMessage = async (message: WebviewMessage) => {
			// Call the messageHandler with the correct 'this' context
			return this.messageHandler(this, message)
		}

		webview.onDidReceiveMessage(onReceiveMessage, null, this.disposables)
	}

	// API Management methods (handleModeSwitch, updateApiConfiguration, upsertApiConfiguration, OAuth callbacks)
	// removed and delegated to ApiManager instance.

	// Note: Provider still needs access to the *result* of handleModeSwitch to update current  API handler.
	// Note: Provider still needs access to updateApiConfiguration result? No, API handler update happens internally now.

	// Wrapper method to handle mode switch and update current
	public async handleModeSwitchAndUpdate(newMode: Mode) {
		// Capture telemetry here as Provider has taskId
		const currentTaskId = this.theaTaskStackManager.getCurrentTheaTask()?.taskId // Renamed property
		if (currentTaskId) {
			telemetryService.captureModeSwitch(currentTaskId, newMode)
		}
		// Delegate mode switch logic and get the config to load
		const configToLoad = await this.theaApiManager.handleModeSwitch(newMode) // Renamed property
		// If a new config was loaded/associated, update the current  instance
		if (configToLoad) {
			const currentTheaTask = this.theaTaskStackManager.getCurrentTheaTask() // Renamed property
			if (currentTheaTask) {
				// Use the buildApiHandler potentially from the ApiManager or global scope
				currentTheaTask.api = buildApiHandler(configToLoad)
			}
		}
		// Post updated state to webview
		await this.postStateToWebview()
	}

	async cancelTask() {
		const theaTask = this.theaTaskStackManager.getCurrentTheaTask() // Renamed property

		if (!theaTask) {
			return
		}

		console.log(`[subtasks] cancelling task ${theaTask.taskId}.${theaTask.instanceId}`) // Use renamed variable

		const { historyItem } = await this.theaTaskHistoryManager.getTaskWithId(theaTask.taskId) // Renamed property
		// Preserve parent and root task information for history item.
		const rootTask = theaTask.rootTask // Use renamed variable
		const parentTask = theaTask.parentTask // Use renamed variable

		await theaTask.abortTask() // Use renamed variable

		await pWaitFor(
			() =>
				this.theaTaskStackManager.getCurrentTheaTask()! === undefined || // Renamed property
				this.theaTaskStackManager.getCurrentTheaTask()!.isStreaming === false || // Renamed property
				this.theaTaskStackManager.getCurrentTheaTask()!.didFinishAbortingStream || // Renamed property
				// If only the first chunk is processed, then there's no
				// need to wait for graceful abort (closes edits, browser,
				// etc).
				this.theaTaskStackManager.getCurrentTheaTask()!.isWaitingForFirstChunk, // Renamed property
			{
				timeout: 3_000,
			},
		).catch(() => {
			console.error("Failed to abort task")
		})

		const currentForAbandon = this.theaTaskStackManager.getCurrentTheaTask() // Renamed property
		if (currentForAbandon) {
			// 'abandoned' will prevent this  instance from affecting
			// future  instances. This may happen if its hanging on a
			// streaming request.
			currentForAbandon.abandoned = true
		}

		// Clears task again, so we need to abortTask manually above.
		await this.initWithHistoryItem({ ...historyItem, rootTask, parentTask })
	}

	async updateCustomInstructions(instructions?: string) {
		// User may be clearing the field.
		await this.contextProxy.setValue("customInstructions", instructions || undefined) // Use contextProxy directly

		const currentTheaTaskForInstructions = this.theaTaskStackManager.getCurrentTheaTask() // Renamed property
		if (currentTheaTaskForInstructions) {
			currentTheaTaskForInstructions.customInstructions = instructions || undefined
		}

		await this.postStateToWebview()
	}

	// MCP related methods removed - delegated to McpManager

	// Cache/Settings directory and model cache methods removed - delegated to TheaCacheManager.

	// OAuth Callbacks and Upsert Config are now handled by ApiManager

	// Task history methods removed - delegated to TheaTaskHistory manager.

	// Wrapper methods to call manager and handle provider-specific logic (posting state, passing callbacks)
	public async getTaskWithId(id: string) {
		// Made public for  access
		// Simple delegation for getting task data
		return this.theaTaskHistoryManager.getTaskWithId(id) // Renamed property
	}

	public async showTaskWithId(id: string) {
		// Changed from private to public for backward compatibility
		// Delegate, passing necessary provider methods/context as callbacks
		await this.theaTaskHistoryManager.showTaskWithId(
			// Renamed property
			id,
			() => this.theaTaskStackManager.getCurrentTheaTask(), // Renamed property
			// Pass provider method - Type 'Promise<TheaTask>' is assignable to 'Promise<void>'? Let's assume type compatibility for now or history manager adjusts.
			(historyItem) =>
				this.initWithHistoryItem(historyItem as HistoryItem & { rootTask?: TheaTask; parentTask?: TheaTask }),
			// Pass provider method with proper typing
			(action: string) =>
				this.postMessageToWebview({ type: "action", action: action as ExtensionMessage["action"] }), // Fixed type safety issue
		)
		// Note: postStateToWebview might be needed here or is handled by initWithHistoryItem implicitly
	}

	public async exportTaskWithId(id: string) {
		// Changed from private to public for backward compatibility
		// Simple delegation
		return this.theaTaskHistoryManager.exportTaskWithId(id) // Renamed property
	}

	public async deleteTaskWithId(id: string) {
		// Changed from private to public for backward compatibility
		// Delegate, passing necessary provider methods/context as callbacks
		await this.theaTaskHistoryManager.deleteTaskWithId(
			// Renamed property
			id,
			() => this.theaTaskStackManager.getCurrentTheaTask(), // Renamed property
			(message) => this.theaTaskStackManager.finishSubTask(message), // Renamed property
		)
		// Post updated state after deletion attempt (manager handles internal state update)
		await this.postStateToWebview()
	}

	// deleteTaskFromState is purely state management, keep delegation simple via contextProxy or state manager?
	// Let's keep it internal to the history manager for now, provider calls deleteTaskWithId which calls this internally if needed.
	// async deleteTaskFromState(id: string) { ... } // Removed from provider interface

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		console.log("Posting state to webview:", state)
		await this.postMessageToWebview({ type: "state", state })
	}

	async getStateToPostToWebview() {
		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			alwaysAllowExecute,
			alwaysAllowBrowser,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
			soundEnabled,
			ttsEnabled,
			ttsSpeed,
			diffEnabled,
			enableCheckpoints,
			checkpointStorage,
			taskHistory,
			soundVolume,
			browserViewportSize,
			screenshotQuality,
			remoteBrowserHost,
			remoteBrowserEnabled,
			cachedChromeHostUrl,
			writeDelayMs,
			terminalOutputLineLimit,
			terminalShellIntegrationTimeout,
			fuzzyMatchThreshold,
			mcpEnabled,
			enableMcpServerCreation,
			alwaysApproveResubmit,
			requestDelaySeconds,
			rateLimitSeconds,
			currentApiConfigName,
			listApiConfigMeta,
			pinnedApiConfigs,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			experiments,
			maxOpenTabsContext,
			maxWorkspaceFiles,
			browserToolEnabled,
			telemetrySetting,
			showTheaIgnoredFiles, // Correct destructured variable name
			language,
			maxReadFileLine,
		} = await this.theaStateManager.getState() // Renamed property

		const telemetryKey = process.env.POSTHOG_API_KEY
		const machineId = vscode.env.machineId
		const allowedCommands = vscode.workspace.getConfiguration(CONFIG.SECTION).get<string[]>("allowedCommands") || []
		const cwd = this.cwd

		// Safely access packageJSON version with proper type checking
		const packageJSON = this.context.extension?.packageJSON as { version?: string } | undefined
		return {
			version: packageJSON?.version ?? "",
			osInfo: os.platform() === "win32" ? "win32" : "unix",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowReadOnlyOutsideWorkspace: alwaysAllowReadOnlyOutsideWorkspace ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowWriteOutsideWorkspace: alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			alwaysAllowSubtasks: alwaysAllowSubtasks ?? false,
			uriScheme: vscode.env.uriScheme,
			currentTaskItem: this.theaTaskStackManager.getCurrentTheaTask()?.taskId // Renamed property
				? (taskHistory || []).find(
						(item: HistoryItem) => item.id === this.theaTaskStackManager.getCurrentTheaTask()?.taskId,
					) // Renamed property
				: undefined,
			Messages: this.theaTaskStackManager.getCurrentTheaTask()?.taskStateManager.theaTaskMessages || [], // Renamed property & access via state manager
			clineMessages: this.theaTaskStackManager.getCurrentTheaTask()?.taskStateManager.theaTaskMessages || [], // Add required property to satisfy ExtensionState type
			taskHistory: (taskHistory || [])
				.filter((item: HistoryItem) => item.ts && item.task)
				.sort((a: HistoryItem, b: HistoryItem) => b.ts - a.ts),
			soundEnabled: soundEnabled ?? false,
			ttsEnabled: ttsEnabled ?? false,
			ttsSpeed: ttsSpeed ?? 1.0,
			diffEnabled: diffEnabled ?? true,
			enableCheckpoints: enableCheckpoints ?? true,
			checkpointStorage: checkpointStorage ?? "task",
			shouldShowAnnouncement:
				telemetrySetting !== "unset" && lastShownAnnouncementId !== this.latestAnnouncementId,
			allowedCommands,
			soundVolume: soundVolume ?? 0.5,
			browserViewportSize: browserViewportSize ?? "900x600",
			screenshotQuality: screenshotQuality ?? 75,
			remoteBrowserHost,
			remoteBrowserEnabled: remoteBrowserEnabled ?? false,
			cachedChromeHostUrl: cachedChromeHostUrl,
			writeDelayMs: writeDelayMs ?? 1000,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			terminalShellIntegrationTimeout: terminalShellIntegrationTimeout ?? TERMINAL_SHELL_INTEGRATION_TIMEOUT,
			fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
			mcpEnabled: mcpEnabled ?? true,
			enableMcpServerCreation: enableMcpServerCreation ?? true,
			alwaysApproveResubmit: alwaysApproveResubmit ?? false,
			requestDelaySeconds: requestDelaySeconds ?? 10,
			rateLimitSeconds: rateLimitSeconds ?? 0,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			pinnedApiConfigs: pinnedApiConfigs ?? {},
			mode: mode ?? defaultModeSlug,
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			experiments, // Add the experiments property
			customModes: await this.customModesManager.getCustomModes(),
			mcpServers: this.theaMcpManager?.getAllServers() ?? [], // Renamed property
			maxOpenTabsContext: maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: maxWorkspaceFiles ?? 200,
			cwd,
			browserToolEnabled: browserToolEnabled ?? true,
			telemetrySetting,
			telemetryKey,
			machineId,
			showTheaIgnoredFiles: showTheaIgnoredFiles ?? true, // Use correctly destructured variable
			language,
			renderContext: this.renderContext,
			maxReadFileLine: maxReadFileLine ?? 500,
			settingsImportedAt: this.settingsImportedAt,
		}
	}

	/**
	 * Storage
	 * https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	 * https://www.eliostruyf.com/devhack-code-extension-storage-options/
	 */

	// State management methods (getState, updateGlobalState, getGlobalState, setValue, getValue, getValues, setValues)
	// removed and delegated to StateManager instance or contextProxy directly.
	// Note: getStateToPostToWebview remains as it combines state with runtime context.

	// updateTaskHistory method removed - delegated to TheaTaskHistory manager.

	// ContextProxy delegation methods removed - use contextProxy directly or via state manager.

	// cwd getter remains

	get cwd() {
		return getWorkspacePath()
	}

	// Removed duplicate cwd getter

	// dev

	async resetState() {
		const answer = await vscode.window.showInformationMessage(
			t("common:confirmation.reset_state"),
			{ modal: true },
			t("common:answers.yes"),
		)

		if (answer !== t("common:answers.yes")) {
			return
		}

		await this.contextProxy.resetAllState()
		await this.providerSettingsManager.resetAllConfigs() // No change needed here, already correct
		await this.customModesManager.resetCustomModes()
		await this.theaTaskStackManager.removeCurrentTheaTask() // Use manager
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	// logging

	public log(message: string) {
		this.outputChannel.appendLine(message)
		logger.info(message)
	}

	// integration tests

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.theaTaskStackManager.getCurrentTheaTask()?.taskStateManager.theaTaskMessages || [] // Access via state manager
	}

	// getMcpHub removed - use McpManager.getMcpHub()

	/**
	 * Returns properties to be included in every telemetry event
	 * This method is called by the telemetry service to get context information
	 * like the current mode, API provider, etc.
	 */
	public async getTelemetryProperties(): Promise<Record<string, string | number | boolean | undefined>> {
		const { mode, apiConfiguration, language } = await this.theaStateManager.getState() // Use manager
		// Safely access packageJSON version with proper type checking
		const packageJSON = this.context.extension?.packageJSON as { version?: string } | undefined
		const appVersion = packageJSON?.version
		const vscodeVersion = vscode.version
		const platform = process.platform

		const properties: Record<string, string | number | boolean | undefined> = {
			vscodeVersion,
			platform,
		}

		// Add extension version
		if (appVersion) {
			properties.appVersion = appVersion
		}

		// Add language
		if (language) {
			properties.language = language
		}

		// Add current mode
		if (mode) {
			properties.mode = mode
		}

		// Add API provider
		if (apiConfiguration?.apiProvider) {
			properties.apiProvider = apiConfiguration.apiProvider
		}

		// Add model ID if available
		const currentTheaTask = this.theaTaskStackManager.getCurrentTheaTask() // Use manager // Renamed variable
		if (currentTheaTask?.api) {
			const { id: modelId } = currentTheaTask.api.getModel()
			if (modelId) {
				properties.modelId = modelId
			}
		}

		if (currentTheaTask?.diffStrategy) {
			properties.diffStrategy = currentTheaTask.diffStrategy.getName()
		}

		return properties
	}

	// --- Manager Getters for  ---

	public get theaStateManagerInstance(): TheaStateManager {
		// Renamed getter and type
		return this.theaStateManager // Renamed property
	}

	public get theaTaskHistoryManagerInstance(): TheaTaskHistory {
		// Renamed getter and type
		return this.theaTaskHistoryManager // Renamed property
	}

	public get theaMcpManagerInstance(): TheaMcpManager {
		// Renamed getter and type
		return this.theaMcpManager // Renamed property
	}

	// --- Proxy Methods for Backward Compatibility ---
	// These methods delegate to the appropriate manager instances to maintain compatibility with existing code

	// StateManager proxy methods
	public async getState() {
		return this.theaStateManager.getState() // Renamed property
	}

	public async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		return this.theaStateManager.updateGlobalState(key, value) // Renamed property
	}

	public getGlobalState<K extends keyof GlobalState>(key: K) {
		return this.theaStateManager.getGlobalState(key) // Renamed property
	}

	public async setValue<K extends keyof TheaCodeSettings>(key: K, value: TheaCodeSettings[K]) {
		await this.theaStateManager.setValue(key, value) // Renamed property
		// Update current  instance if needed
		if (key === "currentApiConfigName" && this.getCurrent()) {
			// getCurrent returns TheaTask | undefined
			const config = await this.providerSettingsManager.loadConfig(value as string)
			if (config) {
				this.getCurrent()!.api = buildApiHandler(config) // getCurrent returns TheaTask | undefined
			}
			// Post state to webview after API configuration update
			await this.postStateToWebview()
		} else if ((key as string) === "apiConfiguration" && this.getCurrent()) {
			// getCurrent returns TheaTask | undefined
			// If the API configuration itself is updated, update the current  instance
			this.getCurrent()!.api = buildApiHandler(value as ApiConfiguration) // getCurrent returns TheaTask | undefined
			// Post state to webview after API configuration update
			await this.postStateToWebview()
		}
		return value
	}

	public getValue<K extends keyof TheaCodeSettings>(key: K) {
		return this.theaStateManager.getValue(key) // Renamed property
	}

	public getValues() {
		return this.theaStateManager.getValues() // Renamed property
	}

	public async setValues(values: TheaCodeSettings) {
		return this.theaStateManager.setValues(values) // Renamed property
	}

	// Stack proxy methods
	public async addToStack(task: TheaTask) {
		// Renamed parameter and type
		return this.theaTaskStackManager.addTheaTask(task) // Renamed property
	}

	public async removeFromStack() {
		return this.theaTaskStackManager.removeCurrentTheaTask() // Renamed property
	}

	public getCurrent(): TheaTask | undefined {
		// Add return type
		return this.theaTaskStackManager.getCurrentTheaTask() // Renamed property
	}

	public getStackSize() {
		return this.theaTaskStackManager.getSize() // Renamed property
	}

	public getCurrentTaskStack() {
		return this.theaTaskStackManager.getTaskStack() // Renamed property
	}

	public async finishSubTask(message?: string) {
		return this.theaTaskStackManager.finishSubTask(message) // Renamed property
	}

	// ApiManager proxy methods
	public async handleModeSwitch(newMode: Mode) {
		return this.handleModeSwitchAndUpdate(newMode)
	}
	public async updateApiConfiguration(apiConfiguration: ApiConfiguration) {
		return this.theaApiManager.updateApiConfiguration(apiConfiguration) // Renamed property
	}

	public async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration) {
		return this.theaApiManager.upsertApiConfiguration(configName, apiConfiguration) // Renamed property
	}

	// TheaCacheManager proxy methods
	public async ensureCacheDirectoryExists() {
		return this.theaCacheManager.ensureCacheDirectoryExists() // Renamed property
	}

	public async ensureSettingsDirectoryExists() {
		return this.theaCacheManager.ensureSettingsDirectoryExists() // Renamed property
	}

	public async readModelsFromCache(filename: string) {
		return this.theaCacheManager.readModelsFromCache(filename) // Renamed property
	}

	public async writeModelsToCache(filename: string, data: Record<string, ModelInfo>) {
		return this.theaCacheManager.writeModelsToCache(filename, data) // Renamed property
	}

	// ApiManager OAuth callback proxy methods
	public async handleGlamaCallback(code: string) {
		return this.theaApiManager.handleGlamaCallback(code) // Renamed property
	}

	public async handleOpenRouterCallback(code: string) {
		return this.theaApiManager.handleOpenRouterCallback(code) // Renamed property
	}

	public async handleRequestyCallback(code: string) {
		return this.theaApiManager.handleRequestyCallback(code) // Renamed property
	}

	// McpManager proxy methods
	public async ensureMcpServersDirectoryExists() {
		return this.theaMcpManager.ensureMcpServersDirectoryExists() // Renamed property
	}

	// Removed duplicate proxy methods since the original methods were changed from private to public

	public getMcpHub() {
		return this.theaMcpManager.getMcpHub() // Renamed property
	}
}
