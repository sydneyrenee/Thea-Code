// Extracted from src/core/webview/ClineProvider-original.ts

import delay from "delay"
import axios from "axios"
import EventEmitter from "events"
import fs from "fs/promises"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"

import { changeLanguage, t } from "../../i18n"
import { supportPrompt } from "../../shared/support-prompt"
import { HistoryItem } from "../../shared/HistoryItem"
import { ApiConfigMeta, ExtensionMessage, ExtensionState } from "../../shared/ExtensionMessage" // Added ExtensionState
// Removed duplicate import line
import { checkoutDiffPayloadSchema, checkoutRestorePayloadSchema, WebviewMessage } from "../../shared/WebviewMessage"
import { Mode, defaultModeSlug, getModeBySlug, getGroupName } from "../../shared/modes"
import { EXPERIMENT_IDS, experiments as Experiments, ExperimentId } from "../../shared/experiments" // Consolidated imports
import { Terminal } from "../../integrations/terminal/Terminal"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { selectImages } from "../../integrations/misc/process-images"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { McpHub } from "../../services/mcp/McpHub"
import { ShadowCheckpointService } from "../../services/checkpoints/ShadowCheckpointService";
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { GlobalFileNames } from "../../shared/globalFileNames"
import { BrowserSession } from "../../services/browser/BrowserSession"
import { discoverChromeInstances } from "../../services/browser/browserDiscovery"
import { searchWorkspaceFiles } from "../../services/search/file-search"
import { playSound, setSoundEnabled, setSoundVolume } from "../../utils/sound"
import { playTts, setTtsEnabled, setTtsSpeed, stopTts } from "../../utils/tts"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { searchCommits } from "../../utils/git"
import { getDiffStrategy } from "../diff/DiffStrategy"
import { SYSTEM_PROMPT } from "../prompts/system"
import { ConfigManager } from "../config/ConfigManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { ContextProxy } from "../contextProxy"
import { buildApiHandler } from "../../api"
import { getOpenRouterModels } from "../../api/providers/openrouter"
import { getGlamaModels } from "../../api/providers/glama"
import { getUnboundModels } from "../../api/providers/unbound"
import { getRequestyModels } from "../../api/providers/requesty"
import { getOllamaModels } from "../../api/providers/ollama"
import { getVsCodeLmModels } from "../../api/providers/vscode-lm"
import { getLmStudioModels } from "../../api/providers/lmstudio"
import { ACTION_NAMES } from "../CodeActionProvider"
import { Cline, ClineOptions } from "../Cline"
import { openMention } from "../mentions"
import { getNonce } from "./getNonce"
import { TelemetrySetting } from "../../shared/TelemetrySetting";
import { getUri } from "./getUri"
import { telemetryService } from "../../services/telemetry/TelemetryService"
import { getWorkspacePath } from "../../utils/path"
import { GlobalStateKey, SecretKey, ConfigurationValues, SECRET_KEYS } from "../../shared/globalState" // Added SECRET_KEYS
import { findLast } from "../../shared/array"

// Add missing ApiConfiguration import
import { ApiConfiguration, ApiHandlerOptions } from "../../shared/api"

// Import constants from thea-config
import {
    VIEWS, EXTENSION_DISPLAY_NAME,
    configSection
} from "../../../dist/thea-config"

// Import our new modular components
import { ClineStack } from "./cline/ClineStack"
import { ClineStateManager } from "./cline/ClineStateManager"
import { ClineApiManager } from "./api/ClineApiManager"
import { ClineTaskHistory } from "./history/ClineTaskHistory"
import { ClineCacheManager } from "./cache/ClineCacheManager"
import { ClineMcpManager } from "./mcp/ClineMcpManager"

/**
 * https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts
 * https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
 */

export type ClineProviderEvents = {
	clineCreated: [cline: Cline]
}

export class ClineProvider extends EventEmitter<ClineProviderEvents> implements vscode.WebviewViewProvider {
	public static readonly sideBarId = VIEWS.SIDEBAR
	public static readonly tabPanelId = VIEWS.TAB_PANEL
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private isViewLaunched = false
	private workspaceTracker?: WorkspaceTracker
	protected mcpHub?: McpHub
	private latestAnnouncementId = "mar-20-2025-3-10" // update to some unique identifier when we add a new announcement
	private contextProxy: ContextProxy
	configManager: ConfigManager
	customModesManager: CustomModesManager

	// Module instances
	private clineStack: ClineStack
	private stateManager: ClineStateManager
	private apiManager: ClineApiManager
	private taskHistory: ClineTaskHistory
	private cacheManager: ClineCacheManager
	private mcpManager: ClineMcpManager

	get cwd() {
		return getWorkspacePath()
	}

	constructor(
		readonly context: vscode.ExtensionContext,
	// Original lines: 108-136 (Constructor structure significantly changed)
		private readonly outputChannel: vscode.OutputChannel,
		private readonly renderContext: "sidebar" | "editor" = "sidebar",
	) {
		super()

		this.outputChannel.appendLine("ClineProvider instantiated")
		this.contextProxy = new ContextProxy(context)
		ClineProvider.activeInstances.add(this)

		// Register this provider with the telemetry service
		telemetryService.setProvider(this)

		// Initialize all module instances
		this.clineStack = new ClineStack()
		this.stateManager = new ClineStateManager(this.context)
		this.apiManager = new ClineApiManager(this.context, this.outputChannel)
		this.taskHistory = new ClineTaskHistory(this.context)
		this.cacheManager = new ClineCacheManager(this.context)
		this.mcpManager = new ClineMcpManager(this.context, this)

		// Initialize workspace tracker and config managers
		this.workspaceTracker = new WorkspaceTracker(this)
		this.configManager = new ConfigManager(this.context)
		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebview()
		})

		// Set reference to custom modes getter for state manager
		this.stateManager.getCustomModes = () => this.customModesManager.getCustomModes()

		// Initialize MCP Hub through the singleton manager
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub;
				this.mcpManager.setMcpHub(hub);
			})
			.catch((error) => {
				this.outputChannel.appendLine(`Failed to initialize MCP Hub: ${error}`)
			})
	}

	// DELEGATIONS TO CLINESTACK MODULE
	async addClineToStack(cline: Cline) {
		// First, add the cline to the stack
		await this.clineStack.addCline(cline)
		
		// Then do the state check that was in the original code
	// --- START DELEGATIONS (New section in refactoring, replaces direct implementations below) ---
		const state = await this.getState()
		if (!state || typeof state.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
	}

	async removeClineFromStack() {
		return this.clineStack.removeCurrentCline()
	}

	getCurrentCline(): Cline | undefined {
		return this.clineStack.getCurrentCline()
	}

	getClineStackSize(): number {
		return this.clineStack.getSize()
	}

	getCurrentTaskStack(): string[] {
		return this.clineStack.getTaskStack()
	}

	async finishSubTask(lastMessage?: string) {
		return this.clineStack.finishSubTask(lastMessage)
	}

	// DELEGATIONS TO STATE MANAGER
	async getState() {
		return this.stateManager.getState()
	}

	async updateGlobalState(key: GlobalStateKey, value: any) {
		return this.stateManager.updateGlobalState(key, value)
	}

	async getGlobalState(key: GlobalStateKey) {
		return this.stateManager.getGlobalState(key)
	}

	async storeSecret(key: SecretKey, value?: string) {
		return this.stateManager.storeSecret(key, value)
	}

	async setValues(values: Partial<ConfigurationValues>) {
		return this.stateManager.setValues(values)
	}

	// DELEGATIONS TO API MANAGER
	async updateApiConfiguration(apiConfiguration: ApiConfiguration) {
		await this.apiManager.updateApiConfiguration(apiConfiguration)
		if (this.getCurrentCline()) {
			this.getCurrentCline()!.api = buildApiHandler(apiConfiguration)
		}
	}

	async handleModeSwitch(newMode: Mode) {
		// Capture mode switch telemetry event
		const currentTaskId = this.getCurrentCline()?.taskId
		if (currentTaskId) {
			telemetryService.captureModeSwitch(currentTaskId, newMode)
		}
		await this.apiManager.handleModeSwitch(newMode)
		await this.postStateToWebview()
	}

	async handleOpenRouterCallback(code: string) {
		await this.apiManager.handleOpenRouterCallback(code)
		await this.postStateToWebview()
	}

	async handleGlamaCallback(code: string) {
		await this.apiManager.handleGlamaCallback(code)
		await this.postStateToWebview()
	}

	async handleRequestyCallback(code: string) {
		await this.apiManager.handleRequestyCallback(code)
		await this.postStateToWebview()
	}

	async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration) {
		try {
			await this.apiManager.upsertApiConfiguration(configName, apiConfiguration)
			await this.postStateToWebview()
		} catch (error) {
			this.outputChannel.appendLine(`Error creating new API configuration: ${error.message}`)
			vscode.window.showErrorMessage(t("common:errors.create_api_config"))
		}
	}

	// DELEGATIONS TO TASK HISTORY
	async getTaskWithId(id: string) {
		return this.taskHistory.getTaskWithId(id)
	}

	async showTaskWithId(id: string) {
		return this.taskHistory.showTaskWithId(
			id,
			() => this.getCurrentCline(),
			async (historyItem) => {
				await this.initClineWithHistoryItem(historyItem);
				return;
			},
			() => this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		)
	}

	async exportTaskWithId(id: string) {
		return this.taskHistory.exportTaskWithId(id)
	}

	async deleteTaskWithId(id: string) {
		return this.taskHistory.deleteTaskWithId(
			id,
			() => this.getCurrentCline(),
			(message) => this.finishSubTask(message)
		)
	}

	async deleteTaskFromState(id: string) {
		await this.taskHistory.deleteTaskFromState(id)
		await this.postStateToWebview()
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		return this.taskHistory.updateTaskHistory(item)
	}

	// DELEGATIONS TO CACHE MANAGER
	async ensureCacheDirectoryExists() {
		return this.cacheManager.ensureCacheDirectoryExists()
	}

	async ensureSettingsDirectoryExists() {
		return this.cacheManager.ensureSettingsDirectoryExists()
	}

	async readModelsFromCache(filename: string) {
		return this.cacheManager.readModelsFromCache(filename)
	}

	// DELEGATIONS TO MCP MANAGER
	async ensureMcpServersDirectoryExists() {
		return this.mcpManager.ensureMcpServersDirectoryExists()
	}

	getMcpHub(): McpHub | undefined {
		return this.mcpManager.getMcpHub()
	}

	// FROM ORIGINAL CLINE PROVIDER - KEEP THESE
	async dispose() {
		this.outputChannel.appendLine("Disposing ClineProvider...")
		await this.removeClineFromStack()
		this.outputChannel.appendLine("Cleared task")
	// --- END DELEGATIONS ---

	// Original lines: 218-246
		if (this.view && "dispose" in this.view) {
	// Original lines: ~218-246
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
		this.mcpHub?.dispose()
		this.mcpHub = undefined
		this.customModesManager?.dispose()
		this.outputChannel.appendLine("Disposed all disposables")
		ClineProvider.activeInstances.delete(this)

		// Unregister from McpServerManager
		McpServerManager.unregisterProvider(this)
	}

	// Helper function to generate system prompt based on current state and message context
	private async generateSystemPrompt(message: WebviewMessage) {
		const {
			apiConfiguration,
	// Original lines: 2088-2155 (generateSystemPrompt logic extracted from setWebviewMessageListener)
			customModePrompts,
			customInstructions,
			browserViewportSize,
	// Original logic was helper within setWebviewMessageListener: ~2088-2155
			diffEnabled,
			mcpEnabled,
			fuzzyMatchThreshold,
			experiments,
			enableMcpServerCreation,
			browserToolEnabled,
			language,
		} = await this.getState()

		// Create diffStrategy based on current model and settings
		// Check if apiConfiguration has model IDs before accessing, to handle potential fallback state
		const modelIdString =
			apiConfiguration && ('apiModelId' in apiConfiguration || 'openRouterModelId' in apiConfiguration)
			? (apiConfiguration.apiModelId || apiConfiguration.openRouterModelId || "")
			: "";

		const diffStrategy = getDiffStrategy(
			modelIdString,
			fuzzyMatchThreshold,
			Experiments.isEnabled(experiments, EXPERIMENT_IDS.DIFF_STRATEGY),
			Experiments.isEnabled(experiments, EXPERIMENT_IDS.MULTI_SEARCH_AND_REPLACE),
		)
		const cwd = this.cwd

		const mode = message.mode ?? defaultModeSlug
		const customModes = await this.customModesManager.getCustomModes()

		const rooIgnoreInstructions = this.getCurrentCline()?.rooIgnoreController?.getInstructions()

		// Determine if browser tools can be used based on model support, mode, and user settings
		let modelSupportsComputerUse = false

		try {
			const tempApiHandler = buildApiHandler(apiConfiguration)
			modelSupportsComputerUse = tempApiHandler.getModel().info.supportsComputerUse ?? false
		} catch (error) {
			console.error("Error checking if model supports computer use:", error)
		}

		const modeConfig = getModeBySlug(mode, customModes)
		const modeSupportsBrowser = modeConfig?.groups.some((group) => getGroupName(group) === "browser") ?? false
		const canUseBrowserTool = modelSupportsComputerUse && modeSupportsBrowser && (browserToolEnabled ?? true)

		const systemPrompt = await SYSTEM_PROMPT(
			this.context,
			cwd,
			canUseBrowserTool,
			mcpEnabled ? this.mcpManager.getMcpHub() : undefined, // Use manager method
			diffStrategy,
			browserViewportSize ?? "900x600",
			mode,
			customModePrompts,
			customModes,
			customInstructions,
			diffEnabled,
			experiments,
			enableMcpServerCreation,
			language,
			rooIgnoreInstructions,
		)
		return systemPrompt
	}

	// Cleaned up erroneous comments and braces

	public static getVisibleInstance(): ClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	// Original lines: 248-250
	}

	public static async getInstance(): Promise<ClineProvider | undefined> {
		let visibleProvider = ClineProvider.getVisibleInstance()
	// Original lines: 252-269

		// If no visible provider, try to show the sidebar view
		if (!visibleProvider) {
			await vscode.commands.executeCommand(`${VIEWS.SIDEBAR}.focus`)
	// Original lines: 252-269
			// Wait briefly for the view to become visible
			await delay(100)
			visibleProvider = ClineProvider.getVisibleInstance()
		}

		// If still no visible provider, return
		if (!visibleProvider) {
			return
		}

		return visibleProvider
	}

	// Original lines: 271-283
	public static async isActiveTask(): Promise<boolean> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return false
		}

	// Original lines: 271-283
			// Check if there is a cline instance in the stack (if this provider has an active task)
		if (visibleProvider.getCurrentCline()) {
			return true
		}

		return false
	}

	// Original lines: 285-316
	// Static code action handlers from original
	public static async handleCodeAction(
		command: string,
		promptType: keyof typeof ACTION_NAMES,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		// Check if command exists and endsWith is a valid function before calling
		if (command && typeof command.endsWith === 'function' && command.endsWith("AddToContext")) {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})

			return
		}

		// Check if command exists and endsWith is a valid function before calling
		if (visibleProvider.getCurrentCline() && command && typeof command.endsWith === 'function' && command.endsWith("InCurrentTask")) {
			await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text: prompt })
			return
		}

		// Default: Start a new task
		await visibleProvider.initClineWithTask(prompt)
	}

	public static async handleTerminalAction(
		command: string,
		promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (promptType === "TERMINAL_ADD_TO_CONTEXT") { // Use promptType for clarity
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: prompt,
			})
			return
		}

		// For TERMINAL_FIX or TERMINAL_EXPLAIN:
		// Check if command exists and endsWith is a valid function before calling
		if (visibleProvider.getCurrentCline() && command && typeof command.endsWith === 'function' && command.endsWith("InCurrentTask")) {
		   await visibleProvider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text: prompt })
			return
		}

		// Default: Start a new task if no current task or not "InCurrentTask" command
		await visibleProvider.initClineWithTask(prompt)
	}

	// Implementation of webview methods
	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.view = webviewView

		// Set viewer options
		this.view.webview.options = {
			enableScripts: true,
	// Original lines: ~353-458 (Structure changed)
			localResourceRoots: [
				vscode.Uri.file(path.join(this.context.extensionPath, "dist")),
				vscode.Uri.file(path.join(this.context.extensionPath, "public")),
				vscode.Uri.file(path.join(this.context.extensionPath, "assets")),
			],
		}

		// Set viewer HTML content
		const usingHMR = process.env.USING_HMR === "true"
		this.view.webview.html = usingHMR
			? await this.getHMRHtmlContent(this.view.webview)
			: this.getHtmlContent(this.view.webview)

		// Add listener for webview messages
		this.setWebviewMessageListener(this.view.webview)

		// Mark view as launched
		this.isViewLaunched = true

		// Post state to webview
	// Original lines: 460-462 (initClineWithSubTask)
		await this.postStateToWebview()
	}

	// Task initialization methods
	public async initClineWithSubTask(parent: Cline, task?: string, images?: string[]) {
		// Put the parent cline into "paused" state - Removed parent.pauseTask() as it doesn't exist
		// parent.pauseTask()
	// Original lines: ~464-505 (initClineWithTask structure changed)


		// Initialize state-dependent settings (sound, TTS, terminal)
		this.getState().then(({ soundEnabled, terminalShellIntegrationTimeout, ttsEnabled, ttsSpeed }) => {
			setSoundEnabled(soundEnabled ?? false);
			Terminal.setShellIntegrationTimeout(terminalShellIntegrationTimeout ?? 3000); // Assuming default from original import
			setTtsEnabled(ttsEnabled ?? false);
			setTtsSpeed(ttsSpeed ?? 1.0);
		});

		// Add listener for webview messages (Moved from original position)
		if (this.view) { // Add null check
			this.setWebviewMessageListener(this.view.webview);
		}

		// Listen for visibility changes
		if (this.view) { // Add null check
			if ("onDidChangeViewState" in this.view) { // Replace webviewView with this.view
				this.view.onDidChangeViewState( // Replace webviewView with this.view
					() => {
						if (this.view?.visible) {
							this.postMessageToWebview({ type: "action", action: "didBecomeVisible" });
						}
					},
					null,
					this.disposables,
				);
			} else if ("onDidChangeVisibility" in this.view) { // Replace webviewView with this.view
				this.view.onDidChangeVisibility( // Replace webviewView with this.view
					() => {
						if (this.view?.visible) {
							this.postMessageToWebview({ type: "action", action: "didBecomeVisible" });
						}
					},
					null,
					this.disposables,
				);
			}

			// Listen for disposal
			this.view.onDidDispose( // Replace webviewView with this.view
				async () => {
					await this.dispose();
				},
				null,
				this.disposables,
			);
		} // End null check for this.view

		// Listen for theme changes
		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					// Need getTheme function - assuming it exists or importing it
					// import { getTheme } from "../../integrations/theme/getTheme"; 
					// await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) });
					// For now, comment out until getTheme is confirmed available
					console.log("Theme changed, placeholder for sending theme update.");
				}
			},
			null,
			this.disposables,
		);

		// Clear previous task state on new session (from original)
		await this.removeClineFromStack();

		await this.initClineWithTask(task, images, parent)
	}
	// Original lines: 460-462

	public async initClineWithTask(task?: string, images?: string[], parentTask?: Cline): Promise<Cline> {
		// Get necessary state for Cline constructor
		const {
			apiConfiguration,
			customModePrompts,
			diffEnabled: enableDiff,
	// Original lines: ~464-505 (Structure changed)
			enableCheckpoints,
			checkpointStorage,
			fuzzyMatchThreshold,
			mode,
			customInstructions: globalInstructions,
			experiments,
		} = await this.getState()

		const modePrompt = customModePrompts?.[mode] // Add type assertion if needed
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		// Create cline instance with full options
		const cline = new Cline({
			provider: this,
			apiConfiguration, // Added
			customInstructions: effectiveInstructions, // Added
			enableDiff, // Added
			enableCheckpoints, // Added
			checkpointStorage, // Added
			fuzzyMatchThreshold, // Added
			task, // Existing
			images, // Added
			experiments, // Added
			rootTask: this.clineStack.getSize() > 0 ? this.clineStack.getCurrentCline() : undefined, // Added approximation
			parentTask, // Existing
			taskNumber: this.clineStack.getSize() + 1, // Added
			onCreated: (cline) => this.emit("clineCreated", cline), // Added
		}); // Added missing closing brace and parenthesis

		// Removed incompatible event listeners for reverted Cline.ts
		// cline.on("stateUpdateNeeded", () => { ... });
		// cline.on("postWebviewMessage", (message) => { ... });

		await this.addClineToStack(cline)

		// Notify that a new cline instance has been created
		this.emit("clineCreated", cline)

		// Send task startup message
		await this.postMessageToWebview({
			type: "taskStarted",
			taskId: cline.taskId,
			task,
			mode: await this.getGlobalState("mode"),
		})

		// Optionally post images to webview
		if (images && images.length > 0) {
	// Original lines: ~507-571 (initClineWithHistoryItem structure changed)
			this.postMessageToWebview({ type: "images", images })
		}
		
		return cline;
	}

	public async initClineWithHistoryItem(historyItem: HistoryItem & { rootTask?: Cline; parentTask?: Cline }): Promise<Cline> {
		// Clear current cline
		await this.removeClineFromStack()

		// Initialize new cline

	// Original lines: ~507-571 (Structure changed)
		const { getTaskDirectoryPath } = await import("../../shared/storagePathManager")

		// Get necessary state for Cline constructor
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
		} = await this.getState()

		const modePrompt = customModePrompts?.[mode]
		const effectiveInstructions = [globalInstructions, modePrompt?.customInstructions].filter(Boolean).join("\n\n")

		const taskId = historyItem.id
		const globalStorageDir = this.contextProxy.globalStorageUri.fsPath
		const workspaceDir = this.cwd // Use getter

		const checkpoints: Pick<ClineOptions, "enableCheckpoints" | "checkpointStorage"> = {
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
				this.log(`[initClineWithHistoryItem] Using ${checkpoints.checkpointStorage} storage for ${taskId}`)
			} catch (error) {
				checkpoints.enableCheckpoints = false
				this.log(`[initClineWithHistoryItem] Error getting task storage: ${error.message}`)
			}
		}


		const options: ClineOptions = {
			// taskId: historyItem.id, // Not part of options, passed via historyItem
			// taskTs: historyItem.ts, // Not part of options, passed via historyItem
			provider: this,
			apiConfiguration, // Added
			customInstructions: effectiveInstructions, // Added
			enableDiff, // Added
			...checkpoints, // Added checkpoint options
			fuzzyMatchThreshold, // Added
			historyItem, // Pass the whole history item
			experiments, // Added
			// task: historyItem.task, // Included in historyItem
			// initializing: true, // Removed, handled internally in Cline now?
			rootTask: historyItem.rootTask,
			parentTask: historyItem.parentTask,
			taskNumber: historyItem.number, // Added
			onCreated: (cline) => this.emit("clineCreated", cline), // Added
		}

		const globalStoragePath = this.context.globalStorageUri.fsPath
		const taskDirPath = await getTaskDirectoryPath(globalStoragePath, historyItem.id)

		const apiConversationHistoryPath = path.join(taskDirPath, "api_conversation_history.json")
		const uiMessagesPath = path.join(taskDirPath, "ui_messages.json")

		// Load conversation history if available
		try {
			const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryPath, "utf8"))
			// options.apiConversationHistory = apiConversationHistory // Removed: Handled internally by Cline
		} catch (error) {
			console.log("No apiConversationHistory found or error reading:", error)
		}

		try {
			const uiMessages = JSON.parse(await fs.readFile(uiMessagesPath, "utf8"))
			// options.uiMessages = uiMessages // Removed: Handled internally by Cline
		} catch (error) {
			console.log("No uiMessages found or error reading:", error)
		}

		// Create cline instance with history
		const cline = new Cline(options)

		// Removed incompatible event listeners for reverted Cline.ts
		// cline.on("stateUpdateNeeded", () => { ... });
		// cline.on("postWebviewMessage", (message) => { ... });

		await this.addClineToStack(cline)
		this.emit("clineCreated", cline)

		// Send task startup message
		await this.postMessageToWebview({
			type: "taskStarted",
			taskId: cline.taskId,
			task: historyItem.task,
			mode: await this.getGlobalState("mode"),
		})

		// Post full history
		const currentCline = this.getCurrentCline()
		if (currentCline) {
			// This will replay all messages from the history
			for (const message of currentCline.clineMessages) {
				await this.postMessageToWebview(message)
			}
		}
	// Original lines: 573-575 (postMessageToWebview)

		// Removed non-existent 'initializing' property access
		
		return cline;
	}

	// Original lines: ~577-652 (getHMRHtmlContent structure changed)
	// Webview communication methods
	public async postMessageToWebview(message: ExtensionMessage) {
		if (this.view) {
			await this.view.webview.postMessage(message)
		}
	}

	// Original lines: 573-575
	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		const hmrPort = process.env.HMR_PORT || 5173
		const proxyUrl = `http://localhost:${hmrPort}`
		const res = await axios.get(proxyUrl)

		// Extract the HTML content from the response
	// Original lines: ~577-652 (Structure changed)
		let html = res.data

		// Update the script sources to use vscode-resource: instead of /
		// and all URLs to include the HMR port
		html = html
			.replace(/src="(?!http)([^"]+)"/g, (match: string, src: string) => { // Added types
	// Original lines: ~654-737 (getHtmlContent structure changed)
				return `src="${proxyUrl}/${src}"`
			})
			.replace(/href="(?!http)([^"]+)"/g, (match: string, href: string) => { // Added types
				return `href="${proxyUrl}/${href}"`
			})

		return html
	}

	private getHtmlContent(webview: vscode.Webview): string {
		// Get base HTML content URI
		const stylesUri = getUri(webview, this.context.extensionUri, ["dist", "assets", "main.css"])
		const scriptUri = getUri(webview, this.context.extensionUri, ["dist", "assets", "main.js"])
		const codiconsUri = getUri(webview, this.context.extensionUri, ["dist", "assets", "codicon.css"])
		const nonce = getNonce()
	// Original lines: ~654-737 (Structure changed)

		const mode = "production"
		const workspaceName = vscode.workspace.name || "workspace"
		const sessionId = Math.floor(Math.random() * 1000000)

		return /* html */ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
				<title>${EXTENSION_DISPLAY_NAME}</title>
				<link rel="stylesheet" href="${codiconsUri}">
				<link rel="stylesheet" href="${stylesUri}">
			</head>
			<body>
				<div id="root"></div>
				<script nonce="${nonce}">
					window.__WEBSOCKET__DOMAIN__ = '';
					window.initialMode = "${mode}";
	// Original lines: ~739-2086 (setWebviewMessageListener structure changed, logic heavily refactored)
					window.workspaceName = "${workspaceName}";
					window.sessionId = ${sessionId};
					window.acquireVsCodeApi = acquireVsCodeApi;
				</script>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
		`
	}

	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				// Handle received message from webview
				const { type } = message
				const cline = this.getCurrentCline()
	// Original lines: ~739-2086 (Large switch statement, significantly refactored)

				switch (type) {
					case "ready":
						await this.postStateToWebview()
						break

					case "chat":
						if (message.text) {
							// TODO: check if session expired and reinitialize session if needed
							// Original logic: Always initialize a new task for messages from UI chat input.
							// This ensures a fresh slate as described in the original comment.
							await this.initClineWithTask(message.text, message.images)
						} // Keep the closing brace from the original 'if (message.text)'
						break

					case "checkoutDiff": { // Reverted to original logic structure
						const result = checkoutDiffPayloadSchema.safeParse(message.payload)

						if (result.success) {
							// Call checkpointDiff on the current Cline instance
							await this.getCurrentCline()?.checkpointDiff(result.data)
						} else {
							console.error("Invalid checkout diff payload", message.payload)
						}
					}
						break

					case "checkoutRestore": { // Reverted to original logic structure
						const result = checkoutRestorePayloadSchema.safeParse(message.payload)

						if (result.success) {
							await this.cancelTask() // Call cancelTask like original

							try {
								// Wait for the new Cline instance created by cancelTask to initialize
								await pWaitFor(() => this.getCurrentCline()?.isInitialized === true, { timeout: 3_000 })
							} catch (error) {
								vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
							}

							try {
								// Call checkpointRestore on the *new* current Cline instance
								await this.getCurrentCline()?.checkpointRestore(result.data)
							} catch (error) {
								vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
							}
						} else {
							 console.error("Invalid checkout restore payload", message.payload) // Fixed: Use message.payload
						}
						break
					}


					// --- START INSERTED MODEL REFRESH/REQUEST LOGIC ---
					case "refreshOpenRouterModels": {
						const { apiConfiguration: configForRefresh } = await this.getState()
						// Pass the outputChannel as in the original code
						const openRouterModels = await getOpenRouterModels(this.outputChannel)
						if (Object.keys(openRouterModels).length > 0) {
							const cacheDir = await this.cacheManager.ensureCacheDirectoryExists()
							// Write directly to the file as in the original code
							await fs.writeFile(
								path.join(cacheDir, GlobalFileNames.openRouterModels),
								JSON.stringify(openRouterModels),
							)
							await this.postMessageToWebview({ type: "openRouterModels", openRouterModels })
						}
						break
					}
					case "refreshGlamaModels": { // Added break statement
						const glamaModels = await getGlamaModels(this.outputChannel) // Pass outputChannel

						if (Object.keys(glamaModels).length > 0) {
							const cacheDir = await this.cacheManager.ensureCacheDirectoryExists() // Use cacheManager
							await this.cacheManager.writeModelsToCache( // Use cacheManager
								GlobalFileNames.glamaModels,
								glamaModels,
							)
							await this.postMessageToWebview({ type: "glamaModels", glamaModels })
						}
						break // Added break statement
					}
					case "refreshUnboundModels": { // Added break statement
						const unboundModels = await getUnboundModels(this.outputChannel) // Pass outputChannel

						if (Object.keys(unboundModels).length > 0) {
							const cacheDir = await this.cacheManager.ensureCacheDirectoryExists() // Use cacheManager
							await this.cacheManager.writeModelsToCache( // Use cacheManager
								GlobalFileNames.unboundModels,
								unboundModels,
							)
							await this.postMessageToWebview({ type: "unboundModels", unboundModels })
						}
						break // Added break statement
					}
					case "refreshRequestyModels": { // Added break statement
						const requestyModels = await getRequestyModels(this.outputChannel) // Pass outputChannel

						if (Object.keys(requestyModels).length > 0) {
							const cacheDir = await this.cacheManager.ensureCacheDirectoryExists() // Use cacheManager
							await this.cacheManager.writeModelsToCache( // Use cacheManager
								GlobalFileNames.requestyModels,
								requestyModels,
							)
							await this.postMessageToWebview({ type: "requestyModels", requestyModels })
						}
						break // Added break statement
					}
					case "refreshOpenAiModels": { // Added break statement
						if (message?.values?.baseUrl && message?.values?.apiKey) {
							// Need to decide how to handle this. For now, commenting out.
							// this.postMessageToWebview({ type: "openAiModels", openAiModels: Object.keys(openAiModels) }) // Example: Send only keys
						}
						break // Added break statement
					}
					case "requestOllamaModels": { // Added break statement
						const ollamaModels = await getOllamaModels(this.outputChannel)
						// Type mismatch: getOllamaModels returns Record<string, ModelInfo>, ExtensionMessage expects string[]
						// Need to decide how to handle this. For now, commenting out.
						// this.postMessageToWebview({ type: "ollamaModels", ollamaModels: Object.keys(ollamaModels) }) // Example: Send only keys
						break // Added break statement
					}
					case "requestLmStudioModels": { // Added break statement
						const lmStudioModels = await getLmStudioModels(this.outputChannel)
						// TODO: Cache like we do for OpenRouter, etc?
						this.postMessageToWebview({ type: "lmStudioModels", lmStudioModels }) // Assuming ExtensionMessage expects Record<string, ModelInfo> here
						break // Added break statement
					}
					case "requestVsCodeLmModels": { // Added break statement
						const vsCodeLmModels = await getVsCodeLmModels(this.outputChannel) // Pass outputChannel
						// TODO: Cache like we do for OpenRouter, etc?
						this.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
						break // Added break statement
					}
					// --- END INSERTED MODEL REFRESH/REQUEST LOGIC ---
					// --- START INSERTED SETTINGS/BASIC ACTIONS LOGIC ---
					case "apiConfiguration": // Already handled by delegation
						// if (message.apiConfiguration) {
						// 	await this.updateApiConfiguration(message.apiConfiguration)
						// }
						// await this.postStateToWebview()
						break
					case "customInstructions":
						await this.updateCustomInstructions(message.text)
						break
					case "alwaysAllowReadOnly":
						await this.updateGlobalState("alwaysAllowReadOnly", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowReadOnlyOutsideWorkspace":
						await this.updateGlobalState("alwaysAllowReadOnlyOutsideWorkspace", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowWrite":
						await this.updateGlobalState("alwaysAllowWrite", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowWriteOutsideWorkspace":
						await this.updateGlobalState("alwaysAllowWriteOutsideWorkspace", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowExecute":
						await this.updateGlobalState("alwaysAllowExecute", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowBrowser":
						await this.updateGlobalState("alwaysAllowBrowser", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowMcp":
						await this.updateGlobalState("alwaysAllowMcp", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowModeSwitch":
						await this.updateGlobalState("alwaysAllowModeSwitch", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "alwaysAllowSubtasks":
						await this.updateGlobalState("alwaysAllowSubtasks", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "askResponse":
						// TODO: Verify Cline has handleWebviewAskResponse or adapt
						this.getCurrentCline()?.handleWebviewAskResponse(
							message.askResponse!,
							message.text,
							message.images,
						)
						break
					case "clearTask":
						await this.finishSubTask(t("common:tasks.canceled"))
						await this.postStateToWebview()
						break
					case "didShowAnnouncement":
						await this.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
						await this.postStateToWebview()
						break
					// Sound/TTS handlers
					case "playSound":
						if (message.audioType) {
							const soundPath = path.join(this.context.extensionPath, "audio", `${message.audioType}.wav`)
							playSound(soundPath)
						}
						break
					case "soundEnabled":
						const soundEnabled = message.bool ?? false // Use message.bool
						await this.updateGlobalState("soundEnabled", soundEnabled)
						setSoundEnabled(soundEnabled)
						await this.postStateToWebview()
						break
					case "soundVolume":
						const soundVolume = message.value ?? 0.5 // Use message.value
						await this.updateGlobalState("soundVolume", soundVolume)
						setSoundVolume(soundVolume)
						await this.postStateToWebview()
						break
					case "ttsEnabled":
						const ttsEnabled = message.bool ?? false // Use message.bool
						await this.updateGlobalState("ttsEnabled", ttsEnabled)
						setTtsEnabled(ttsEnabled)
						await this.postStateToWebview()
						break
					case "ttsSpeed":
						const ttsSpeed = message.value ?? 1.0 // Use message.value
						await this.updateGlobalState("ttsSpeed", ttsSpeed)
						setTtsSpeed(ttsSpeed)
						await this.postStateToWebview()
						break
					case "playTts":
						if (message.text) {
							playTts(message.text, {
								onStart: () => this.postMessageToWebview({ type: "ttsStart", text: message.text }),
								onStop: () => this.postMessageToWebview({ type: "ttsStop", text: message.text }),
							})
						}
						break
					case "stopTts":
						stopTts()
						break
					// Diff/Checkpoint/Browser settings
					case "diffEnabled":
						const diffEnabled = message.bool ?? true // Use message.bool
						await this.updateGlobalState("diffEnabled", diffEnabled)
						await this.postStateToWebview()
						break
					// --- START INSERTED REMAINING HANDLERS ---
					case "selectImages": { // Was in handleWebviewAction
						const images = await selectImages()
						await this.postMessageToWebview({ type: "selectedImages", images }) // Ensure 'selectedImages' type exists in ExtensionMessage
						break;
					}
					case "exportCurrentTask": // Was in handleWebviewAction via exportTask
						const currentTaskId = this.getCurrentCline()?.taskId
						if (currentTaskId) {
							await this.exportTaskWithId(currentTaskId) // Uses delegation
						}
						break;
					case "showTaskWithId": // Already delegated
						await this.showTaskWithId(message.text!)
						break;
					case "deleteTaskWithId": // Already delegated
						await this.deleteTaskWithId(message.text!)
						break;
					case "deleteMultipleTasksWithIds": { // From original
						const ids = message.ids
						if (Array.isArray(ids)) {
							const batchSize = 20
							const results = []
							console.log(`Batch deletion started: ${ids.length} tasks total`)
							for (let i = 0; i < ids.length; i += batchSize) {
								const batch = ids.slice(i, i + batchSize)
								const batchPromises = batch.map(async (id) => {
									try {
										await this.deleteTaskWithId(id) // Uses delegation
										return { id, success: true }
									} catch (error) {
										console.log(`Failed to delete task ${id}: ${error instanceof Error ? error.message : String(error)}`)
										return { id, success: false }
									}
								})
								const batchResults = await Promise.all(batchPromises)
								results.push(...batchResults)
								await this.postStateToWebview() // Update UI after each batch
							}
							const successCount = results.filter((r) => r.success).length
							const failCount = results.length - successCount
							console.log(`Batch deletion completed: ${successCount}/${ids.length} tasks successful, ${failCount} tasks failed`)
						}
						break
					}
					case "exportTaskWithId": // Already delegated
						await this.exportTaskWithId(message.text!)
						break;
					case "resetState": // Already delegated via handleWebviewAction
						await this.resetState()
						break;
					case "openImage": // From original
						openImage(message.text!)
						break
					case "openFile": // From original (was in handleWebviewAction)
						openFile(message.text!, message.values as { create?: boolean; content?: string })
						break
					case "openMention": // From original
						openMention(message.text)
						break
					case "cancelTask": // Already delegated via handleWebviewAction
						await this.cancelTask()
						break
					case "allowedCommands": // From original
						await this.context.globalState.update("allowedCommands", message.commands)
						// Also update workspace settings
						await vscode.workspace
							.getConfiguration(configSection()) // Use configSection
							.update("allowedCommands", message.commands, vscode.ConfigurationTarget.Global)
						break
					case "openMcpSettings": { // From original (was in handleWebviewAction via openMcpSettingsFile)
						const mcpSettingsFilePath = await this.mcpManager.getMcpSettingsFilePath() // Use manager
						if (mcpSettingsFilePath) {
							openFile(mcpSettingsFilePath) // Use helper
						} else {
							vscode.window.showErrorMessage(t("common:mcp.no_settings_file")) // Added error message
						}
						break;
					}
					case "openCustomModesSettings": { // From original
						const customModesFilePath = await this.customModesManager.getCustomModesFilePath()
						if (customModesFilePath) {
							openFile(customModesFilePath)
						}
						break
					}
					case "deleteMcpServer": { // Already delegated
						if (!message.serverName) break;
						try {
							this.outputChannel.appendLine(`Attempting to delete MCP server: ${message.serverName}`)
							await this.mcpManager.deleteServer(message.serverName) // Use manager
							this.outputChannel.appendLine(`Successfully deleted MCP server: ${message.serverName}`)
							await this.postStateToWebview() // Added state update
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error)
							this.outputChannel.appendLine(`Failed to delete MCP server: ${errorMessage}`)
						}
						break;
					}
					case "restartMcpServer": { // Already delegated via restartMcpConnection
						try {
							await this.mcpManager.restartConnection(message.text!) // Use manager
							await this.postStateToWebview() // Added state update
						} catch (error) {
							this.outputChannel.appendLine(`Failed to retry connection for ${message.text}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
						}
						break;
					}
					case "toggleToolAlwaysAllow": { // Already delegated
						try {
							await this.mcpManager.toggleToolAlwaysAllow( // Use manager
								message.serverName!,
								message.toolName!,
								message.alwaysAllow!,
							)
							await this.postStateToWebview() // Added state update
						} catch (error) {
							this.outputChannel.appendLine(`Failed to toggle auto-approve for tool ${message.toolName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
						}
						break;
					}
					case "toggleMcpServer": { // Already delegated via toggleMcpServerDisabled
						try {
							await this.mcpManager.toggleServerDisabled(message.serverName!, message.disabled!) // Use manager
							await this.postStateToWebview() // Added state update
						} catch (error) {
							this.outputChannel.appendLine(`Failed to toggle MCP server ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
						}
						break;
					}
					case "mcpEnabled": // Already present
						const mcpEnabled = message.bool ?? true
						await this.updateGlobalState("mcpEnabled", mcpEnabled)
						await this.postStateToWebview()
						break
					case "enableMcpServerCreation": // Already present
						await this.updateGlobalState("enableMcpServerCreation", message.bool ?? true)
						await this.postStateToWebview()
						break
					case "updateMcpTimeout": // Already present
						if (message.serverName && typeof message.timeout === "number") {
							try {
								await this.mcpManager.updateServerTimeout(message.serverName, message.timeout) // Use manager
								await this.postStateToWebview() // Added state update
							} catch (error) {
								this.outputChannel.appendLine(`Failed to update timeout for ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
								vscode.window.showErrorMessage(t("common:errors.update_server_timeout"))
							}
						}
						break
					// Browser Connection
					case "testBrowserConnection": { // From original
						try {
							const browserSession = new BrowserSession(this.context)
							if (!message.text) { // Auto-discovery
								try {
									const discoveredHost = await discoverChromeInstances()
									if (discoveredHost) {
										const result = await browserSession.testConnection(discoveredHost)
										await this.postMessageToWebview({
											type: "browserConnectionResult", success: result.success,
											text: `Auto-discovered and tested connection to Chrome at ${discoveredHost}: ${result.message}`, values: { endpoint: result.endpoint },
										})
									} else {
										await this.postMessageToWebview({ type: "browserConnectionResult", success: false, text: "No Chrome instances found on the network. Make sure Chrome is running with remote debugging enabled (--remote-debugging-port=9222)." })
									}
								} catch (error) {
									await this.postMessageToWebview({ type: "browserConnectionResult", success: false, text: `Error during auto-discovery: ${error instanceof Error ? error.message : String(error)}` })
								}
							} else { // Test provided URL
								const result = await browserSession.testConnection(message.text)
								await this.postMessageToWebview({ type: "browserConnectionResult", success: result.success, text: result.message, values: { endpoint: result.endpoint } })
							}
						} catch (error) {
							await this.postMessageToWebview({ type: "browserConnectionResult", success: false, text: `Error testing connection: ${error instanceof Error ? error.message : String(error)}` })
						}
						break;
					}
					case "discoverBrowser": { // From original
						try {
							const discoveredHost = await discoverChromeInstances()
							if (discoveredHost) {
								const browserSession = new BrowserSession(this.context)
								const result = await browserSession.testConnection(discoveredHost)
								await this.postMessageToWebview({ type: "browserConnectionResult", success: true, text: `Successfully discovered and connected to Chrome at ${discoveredHost}`, values: { endpoint: result.endpoint } })
							} else {
								await this.postMessageToWebview({ type: "browserConnectionResult", success: false, text: "No Chrome instances found on the network. Make sure Chrome is running with remote debugging enabled (--remote-debugging-port=9222)." })
							}
						} catch (error) {
							await this.postMessageToWebview({ type: "browserConnectionResult", success: false, text: `Error discovering browser: ${error instanceof Error ? error.message : String(error)}` })
						}
						break;
					}
					// Prompts
					case "updateSupportPrompt": { // From original
						try {
							if (Object.keys(message?.values ?? {}).length === 0) break;
							const existingPrompts = (await this.getGlobalState("customSupportPrompts")) || {}
							const updatedPrompts = { ...existingPrompts, ...message.values }
							await this.updateGlobalState("customSupportPrompts", updatedPrompts)
							await this.postStateToWebview()
						} catch (error) {
							this.outputChannel.appendLine(`Error update support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
							vscode.window.showErrorMessage(t("common:errors.update_support_prompt"))
						}
						break;
					}
					case "resetSupportPrompt": { // From original
						try {
							if (!message?.text) break;
							const existingPrompts = ((await this.getGlobalState("customSupportPrompts")) || {}) as Record<string, any>
							const updatedPrompts = { ...existingPrompts };
							updatedPrompts[message.text] = undefined
							await this.updateGlobalState("customSupportPrompts", updatedPrompts)
							await this.postStateToWebview()
						} catch (error) {
							this.outputChannel.appendLine(`Error reset support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
							vscode.window.showErrorMessage(t("common:errors.reset_support_prompt"))
						}
						break;
					}
					case "updatePrompt": { // From original
						if (message.promptMode && message.customPrompt !== undefined) {
							const existingPrompts = (await this.getGlobalState("customModePrompts")) || {}
							const updatedPrompts = { ...existingPrompts, [message.promptMode]: message.customPrompt }
							await this.updateGlobalState("customModePrompts", updatedPrompts)
							// Get current state and explicitly include customModePrompts
							const currentState = await this.getStateToPostToWebview() // Use updated method
							if (currentState) { // Check if state is defined
								const stateWithPrompts = { ...currentState, customModePrompts: updatedPrompts }
								this.postMessageToWebview({ type: "state", state: stateWithPrompts }) // Post state with prompts
							}
						}
						break;
					}
					// Delete Message
					case "deleteMessage": { // From original
						const answer = await vscode.window.showInformationMessage(
							t("common:confirmation.delete_message"), { modal: true },
							t("common:confirmation.just_this_message"), t("common:confirmation.this_and_subsequent")
						)
						if ((answer === t("common:confirmation.just_this_message") || answer === t("common:confirmation.this_and_subsequent")) &&
							this.getCurrentCline() && typeof message.value === "number" && message.value) {
							const timeCutoff = message.value - 1000 // 1 second buffer
							const currentCline = this.getCurrentCline()!
							const messageIndex = currentCline.clineMessages.findIndex((msg) => msg.ts && msg.ts >= timeCutoff)
							const apiConversationHistoryIndex = currentCline.apiConversationHistory.findIndex((msg) => msg.ts && msg.ts >= timeCutoff)

							if (messageIndex !== -1) {
								const { historyItem } = await this.getTaskWithId(currentCline.taskId)
								if (answer === t("common:confirmation.just_this_message")) {
									const nextUserMessage = currentCline.clineMessages.slice(messageIndex + 1).find((msg) => msg.type === "say" && msg.say === "user_feedback")
									if (nextUserMessage) {
										const nextUserMessageIndex = currentCline.clineMessages.findIndex((msg) => msg === nextUserMessage)
										await currentCline.overwriteClineMessages([...currentCline.clineMessages.slice(0, messageIndex), ...currentCline.clineMessages.slice(nextUserMessageIndex)])
									} else {
										await currentCline.overwriteClineMessages(currentCline.clineMessages.slice(0, messageIndex))
									}
									if (apiConversationHistoryIndex !== -1) {
										if (nextUserMessage?.ts) {
											await currentCline.overwriteApiConversationHistory([...currentCline.apiConversationHistory.slice(0, apiConversationHistoryIndex), ...currentCline.apiConversationHistory.filter((msg) => msg.ts && msg.ts >= nextUserMessage.ts)])
										} else {
											await currentCline.overwriteApiConversationHistory(currentCline.apiConversationHistory.slice(0, apiConversationHistoryIndex))
										}
									}
								} else { // this_and_subsequent
									await currentCline.overwriteClineMessages(currentCline.clineMessages.slice(0, messageIndex))
									if (apiConversationHistoryIndex !== -1) {
										await currentCline.overwriteApiConversationHistory(currentCline.apiConversationHistory.slice(0, apiConversationHistoryIndex))
									}
								}
								await this.initClineWithHistoryItem(historyItem) // Reload task
							}
						}
						break;
					}
					// Experiments
					case "updateExperimental": { // From original
						if (!message.values) break;
						const updatedExperiments = { ...((await this.getGlobalState("experiments")) ?? {}), ...message.values } as Record<ExperimentId, boolean>
						await this.updateGlobalState("experiments", updatedExperiments)
						if (message.values[EXPERIMENT_IDS.DIFF_STRATEGY] !== undefined && this.getCurrentCline()) {
							await this.getCurrentCline()!.updateDiffStrategy(
								Experiments.isEnabled(updatedExperiments, EXPERIMENT_IDS.DIFF_STRATEGY),
								Experiments.isEnabled(updatedExperiments, EXPERIMENT_IDS.MULTI_SEARCH_AND_REPLACE),
							)
						}
						await this.postStateToWebview()
						break;
					}
					// Custom Modes
					case "updateCustomMode": { // From original
						if (message.modeConfig) {
							await this.customModesManager.updateCustomMode(message.modeConfig.slug, message.modeConfig)
							const customModes = await this.customModesManager.getCustomModes()
							await this.updateGlobalState("customModes", customModes)
							await this.updateGlobalState("mode", message.modeConfig.slug) // Optionally switch to the updated mode
							await this.postStateToWebview()
						}
						break;
					}
					case "deleteCustomMode": { // From original
						if (message.slug) {
							const answer = await vscode.window.showInformationMessage(t("common:confirmation.delete_custom_mode"), { modal: true }, t("common:answers.yes"))
							if (answer !== t("common:answers.yes")) break;
							await this.customModesManager.deleteCustomMode(message.slug)
							await this.updateGlobalState("mode", defaultModeSlug) // Switch back to default
							await this.postStateToWebview()
						}
						break;
					}
					// Human Relay
					case "humanRelayResponse": { // From original
						if (message.requestId && message.text) {
							vscode.commands.executeCommand("thea-code.handleHumanRelayResponse", { // Use branded command
								requestId: message.requestId, text: message.text, cancelled: false,
							})
						}
						break;
					}
					case "humanRelayCancel": { // From original
						if (message.requestId) {
							vscode.commands.executeCommand("thea-code.handleHumanRelayResponse", { // Use branded command
								requestId: message.requestId, cancelled: true,
							})
						}
						break;
					}
					// Telemetry
					case "telemetrySetting": { // From original
						const telemetrySetting = message.text as TelemetrySetting
						await this.updateGlobalState("telemetrySetting", telemetrySetting)
						telemetryService.updateTelemetryState(telemetrySetting === "enabled")
						await this.postStateToWebview()
						break;
					}
					// API Config Pinning / Enhancement
					case "toggleApiConfigPin": { // From original
						if (message.text) {
							const currentPinned = ((await this.getGlobalState("pinnedApiConfigs")) || {}) as Record<string, boolean>
							const updatedPinned: Record<string, boolean> = { ...currentPinned }
							if (currentPinned[message.text]) { delete updatedPinned[message.text] } else { updatedPinned[message.text] = true }
							await this.updateGlobalState("pinnedApiConfigs", updatedPinned)
							await this.postStateToWebview()
						}
						break;
					}
					case "enhancementApiConfigId": // Already present
						await this.updateGlobalState("enhancementApiConfigId", message.text)
						await this.postStateToWebview()
						break
					case "autoApprovalEnabled": // Already present
						await this.updateGlobalState("autoApprovalEnabled", message.bool ?? false)
						await this.postStateToWebview()
						break
					// Enhance Prompt
					case "enhancePrompt": { // From original
						if (message.text) {
							try {
								const { apiConfiguration, customSupportPrompts, listApiConfigMeta, enhancementApiConfigId } = await this.getState()
								let configToUse: ApiConfiguration = apiConfiguration
								if (enhancementApiConfigId) {
									const config = listApiConfigMeta?.find((c: ApiConfigMeta) => c.id === enhancementApiConfigId)
									if (config?.name) {
										const loadedConfig = await this.configManager.loadConfig(config.name)
										if (loadedConfig.apiProvider) { configToUse = loadedConfig }
									}
								}
								const enhancedPrompt = await singleCompletionHandler(configToUse, supportPrompt.create("ENHANCE", { userInput: message.text }, customSupportPrompts))
								await this.postMessageToWebview({ type: "enhancedPrompt", text: enhancedPrompt })
							} catch (error) {
								this.outputChannel.appendLine(`Error enhancing prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
								vscode.window.showErrorMessage(t("common:errors.enhance_prompt"))
								await this.postMessageToWebview({ type: "enhancedPrompt" }) // Send empty to clear loading state
							}
						}
						break;
					}
					// System Prompt Preview/Copy
					case "getSystemPrompt": { // From original
						try {
							const systemPrompt = await this.generateSystemPrompt(message) // Use helper
							await this.postMessageToWebview({ type: "systemPrompt", text: systemPrompt, mode: message.mode })
						} catch (error) {
							this.outputChannel.appendLine(`Error getting system prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
							vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
						}
						break;
					}
					case "copySystemPrompt": { // From original
						try {
							const systemPrompt = await this.generateSystemPrompt(message) // Use helper
							await vscode.env.clipboard.writeText(systemPrompt)
							await vscode.window.showInformationMessage(t("common:info.clipboard_copy"))
						} catch (error) {
							this.outputChannel.appendLine(`Error getting system prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
							vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
						}
						break;
					}
					// Search
					case "searchCommits": { // Was in handleWebviewAction
						const commitResults = await searchCommits(message.query || "", this.cwd) // Use message.query
						await this.postMessageToWebview({ type: "commitSearchResults", gitSearchResults: commitResults }) // Use correct property name
						break;
					}
					case "searchFiles": { // From original
						const workspacePath = getWorkspacePath()
						if (!workspacePath) {
							await this.postMessageToWebview({ type: "fileSearchResults", results: [], requestId: message.requestId, error: "No workspace path available" })
							break;
						}
						try {
							const results = await searchWorkspaceFiles(message.query || "", workspacePath, 20)
							await this.postMessageToWebview({ type: "fileSearchResults", results, requestId: message.requestId })
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error)
							await this.postMessageToWebview({ type: "fileSearchResults", results: [], error: errorMessage, requestId: message.requestId })
						}
						break;
					}
					// API Config Management (delegated, confirming parameters)
					case "saveApiConfiguration": // Already delegated
						await this.upsertApiConfiguration(message.text!, message.apiConfiguration!) // Use message.text
						break
					case "upsertApiConfiguration": // Already delegated
						await this.upsertApiConfiguration(message.text!, message.apiConfiguration!) // Use message.text
						break
					case "renameApiConfiguration": { // From original
						if (message.values && message.apiConfiguration) {
							try {
								const { oldName, newName } = message.values
								if (oldName === newName) break;
								const oldConfig = await this.configManager.loadConfig(oldName)
								const newConfig = { ...message.apiConfiguration, id: oldConfig.id } // Preserve ID
								await this.configManager.saveConfig(newName, newConfig)
								await this.configManager.deleteConfig(oldName)
								const listApiConfig = await this.configManager.listConfig()
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)
								await this.updateGlobalState("currentApiConfigName", newName)
								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(`Error rename api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
								vscode.window.showErrorMessage(t("common:errors.rename_api_config"))
							}
						}
						break;
					}
					case "loadApiConfiguration": { // Already delegated
						if (message.text) {
							try {
								const apiConfig = await this.configManager.loadConfig(message.text)
								const listApiConfig = await this.configManager.listConfig()
								await Promise.all([
									this.updateGlobalState("listApiConfigMeta", listApiConfig),
									this.updateGlobalState("currentApiConfigName", message.text),
									this.updateApiConfiguration(apiConfig), // Use delegation
								])
								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(`Error load api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
								vscode.window.showErrorMessage(t("common:errors.load_api_config"))
							}
						}
						break;
					}
					case "loadApiConfigurationById": { // From original
						if (message.text) { // ID is in message.text
							try {
								const { config: apiConfig, name } = await this.configManager.loadConfigById(message.text)
								const listApiConfig = await this.configManager.listConfig()
								await Promise.all([
									this.updateGlobalState("listApiConfigMeta", listApiConfig),
									this.updateGlobalState("currentApiConfigName", name),
									this.updateApiConfiguration(apiConfig), // Use delegation
								])
								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(`Error load api configuration by ID: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
								vscode.window.showErrorMessage(t("common:errors.load_api_config"))
							}
						}
						break;
					}
					case "deleteApiConfiguration": { // Already delegated
						if (message.text) {
							const answer = await vscode.window.showInformationMessage(t("common:confirmation.delete_config_profile"), { modal: true }, t("common:answers.yes"))
							if (answer !== t("common:answers.yes")) break;
							try {
								await this.configManager.deleteConfig(message.text)
								const listApiConfig = await this.configManager.listConfig()
								await this.updateGlobalState("listApiConfigMeta", listApiConfig)
								const currentApiConfigName = await this.getGlobalState("currentApiConfigName")
								if (message.text === currentApiConfigName && listApiConfig?.[0]?.name) {
									const apiConfig = await this.configManager.loadConfig(listApiConfig[0].name)
									await Promise.all([
										this.updateGlobalState("currentApiConfigName", listApiConfig[0].name),
										this.updateApiConfiguration(apiConfig), // Use delegation
									])
								}
								await this.postStateToWebview()
							} catch (error) {
								this.outputChannel.appendLine(`Error delete api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
								vscode.window.showErrorMessage(t("common:errors.delete_api_config"))
							}
						}
						break;
					}
					case "getListApiConfiguration": { // From original
						try {
							const listApiConfig = await this.configManager.listConfig()
							await this.updateGlobalState("listApiConfigMeta", listApiConfig)
							this.postMessageToWebview({ type: "listApiConfig", listApiConfig })
						} catch (error) {
							this.outputChannel.appendLine(`Error get list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
							vscode.window.showErrorMessage(t("common:errors.list_api_config"))
						}
						break;
					}
					case "toggleApiConfigPin": { // From original
						if (message.text) {
							const currentPinned = ((await this.getGlobalState("pinnedApiConfigs")) || {}) as Record<string, boolean>
							const updatedPinned: Record<string, boolean> = { ...currentPinned }
							if (currentPinned[message.text]) { delete updatedPinned[message.text] } else { updatedPinned[message.text] = true }
							await this.updateGlobalState("pinnedApiConfigs", updatedPinned)
							await this.postStateToWebview()
						}
						break;
					}
					// --- END INSERTED REMAINING HANDLERS ---
					case "enableCheckpoints":
						const enableCheckpoints = message.bool ?? true // Use message.bool
						await this.updateGlobalState("enableCheckpoints", enableCheckpoints)
						await this.postStateToWebview()
						break
					case "checkpointStorage":
						console.log(`[ClineProvider] checkpointStorage: ${message.text}`)
						const checkpointStorage = message.text ?? "task" // Use message.text
						await this.updateGlobalState("checkpointStorage", checkpointStorage)
						await this.postStateToWebview()
						break
					case "browserViewportSize":
						const browserViewportSize = message.text ?? "900x600" // Use message.text
						await this.updateGlobalState("browserViewportSize", browserViewportSize)
						await this.postStateToWebview()
						break
					case "screenshotQuality":
						await this.updateGlobalState("screenshotQuality", message.value ?? 75) // Use message.value
						await this.postStateToWebview()
						break
					case "remoteBrowserHost":
						await this.updateGlobalState("remoteBrowserHost", message.text) // Use message.text
						await this.postStateToWebview()
						break
					case "remoteBrowserEnabled":
						await this.updateGlobalState("remoteBrowserEnabled", message.bool ?? false) // Use message.bool
						if (!message.bool) {
							await this.updateGlobalState("remoteBrowserHost", undefined)
						}
						await this.postStateToWebview()
						break
					case "fuzzyMatchThreshold":
						await this.updateGlobalState("fuzzyMatchThreshold", message.value ?? 1.0) // Use message.value
						await this.postStateToWebview()
						break
					case "alwaysApproveResubmit":
						await this.updateGlobalState("alwaysApproveResubmit", message.bool ?? false) // Use message.bool
						await this.postStateToWebview()
						break
					case "requestDelaySeconds":
						await this.updateGlobalState("requestDelaySeconds", message.value ?? 5) // Use message.value
						await this.postStateToWebview()
						break
					case "rateLimitSeconds":
						await this.updateGlobalState("rateLimitSeconds", message.value ?? 0) // Use message.value
						await this.postStateToWebview()
						break
					case "writeDelayMs":
						await this.updateGlobalState("writeDelayMs", message.value ?? 1000) // Use message.value
						await this.postStateToWebview()
						break
					case "terminalOutputLineLimit":
						await this.updateGlobalState("terminalOutputLineLimit", message.value ?? 500) // Use message.value
						await this.postStateToWebview()
						break
					case "terminalShellIntegrationTimeout":
						const timeoutValue = message.value ?? 3000 // Use message.value, provide default
						await this.updateGlobalState("terminalShellIntegrationTimeout", timeoutValue)
						await this.postStateToWebview()
						Terminal.setShellIntegrationTimeout(timeoutValue) // Use the variable
						break
					case "maxOpenTabsContext":
						const tabCount = Math.min(Math.max(0, message.value ?? 20), 500) // Use message.value
						await this.updateGlobalState("maxOpenTabsContext", tabCount)
						await this.postStateToWebview()
						break
					case "maxWorkspaceFiles":
						const fileCount = Math.min(Math.max(0, message.value ?? 200), 500) // Use message.value
						await this.updateGlobalState("maxWorkspaceFiles", fileCount)
						await this.postStateToWebview()
						break
					case "browserToolEnabled":
						await this.updateGlobalState("browserToolEnabled", message.bool ?? true) // Use message.bool
						await this.postStateToWebview()
						break
					case "showRooIgnoredFiles": // Corrected placement
						await this.updateGlobalState("showRooIgnoredFiles", message.bool ?? true) // Use message.bool
						await this.postStateToWebview()
						break
					case "maxReadFileLine":
						await this.updateGlobalState("maxReadFileLine", message.value ?? 500) // Use message.value
	// Original lines: ~748-2086 (handleWebviewAction logic extracted from original setWebviewMessageListener)
						await this.postStateToWebview()
						break
					// --- END INSERTED SETTINGS/BASIC ACTIONS LOGIC ---
				}
			},
			undefined,
			this.disposables
		)
	}

	// Webview action handler
	private async handleWebviewAction(action: string, data: any) {
		const cline = this.getCurrentCline()

		switch (action) {
			case "copyText":
				await vscode.env.clipboard.writeText(data.text)
	// Extracted from original setWebviewMessageListener logic: ~748-2086
				// No need to notify user, VS Code does this automatically
				break

			case "cancelRequest":
				if (cline) {
					await cline.abortTask()
				}
				break

			case "cancelTask":
				await this.cancelTask()
				break

			case "updateCustomInstructions":
				await this.updateCustomInstructions(data.instructions)
				break



			case "openFile":
				if (data?.filepath) {
					const filepath = data.filepath
					if (filepath.toLowerCase().endsWith(".png") ||
						filepath.toLowerCase().endsWith(".jpg") ||
						filepath.toLowerCase().endsWith(".jpeg") ||
						filepath.toLowerCase().endsWith(".gif")) {
						await openImage(filepath)
					} else {
						await openFile(filepath)
					}
				}
				break

			case "selectImages":
				const imagePaths = await selectImages()
				if (imagePaths && imagePaths.length > 0) {
					this.postMessageToWebview({ type: "images", images: imagePaths })
				}
				break

			case "chatButtonClicked":
				// No active cline, initialize a new one
				if (!cline) {
					await this.initClineWithTask()
				}
				break

			case "plusButtonClicked":
				// Start new task
				await this.removeClineFromStack()
				await this.initClineWithTask()
				break

			case "changeMode":
				await this.handleModeSwitch(data.mode)
				break

			case "changeLanguage":
				await changeLanguage(data.language)
				await this.updateGlobalState("language", data.language)
				await this.postStateToWebview()
				break

			case "setSoundEnabled":
				await setSoundEnabled(data.enabled)
				await this.updateGlobalState("soundEnabled", data.enabled)
				break

			case "setSoundVolume":
				await setSoundVolume(data.volume)
				await this.updateGlobalState("soundVolume", data.volume)
				break

			case "setTtsEnabled":
				await setTtsEnabled(data.enabled)
				await this.updateGlobalState("ttsEnabled", data.enabled)
				break

			case "setTtsSpeed":
				await setTtsSpeed(data.speed)
				await this.updateGlobalState("ttsSpeed", data.speed)
				break

			case "stopTts":
				await stopTts()
				break

			case "resetState":
				await this.resetState()
				break

			case "openRouter":
				// Open OpenRouter in browser
				const openRouterUrl = "https://openrouter.ai/auth?callback_url=vscode://sydneyrenee.thea-code/auth/openrouter"
				vscode.env.openExternal(vscode.Uri.parse(openRouterUrl))
				break

			case "glama":
				// Open Glama in browser
				const glamaUrl = "https://glama.ai/oauth/vscode?callback_url=vscode://sydneyrenee.thea-code/auth/glama"
				vscode.env.openExternal(vscode.Uri.parse(glamaUrl))
				break

			case "updateApiConfiguration":
				await this.updateApiConfiguration(data.apiConfiguration)
				await this.postStateToWebview()
				break

			case "updateApiConfigurationValue":
				const { apiConfiguration } = await this.getState()
				await this.updateApiConfiguration({
					...apiConfiguration,
					...data.apiConfiguration
				})
				await this.postStateToWebview()
				break

			case "saveApiConfiguration":
				await this.upsertApiConfiguration(data.name, data.apiConfiguration)
				break

			case "showTask":
				if (data?.taskId) {
					await this.showTaskWithId(data.taskId)
				}
				break

			case "exportTask":
				if (data?.taskId) {
					await this.exportTaskWithId(data.taskId)
				}
				break

			case "deleteTask":
				if (data?.taskId) {
					await this.deleteTaskWithId(data.taskId)
				}
				break

			case "showAnnouncement":
				await this.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
				break

			case "toggleCheckpointsEnabled":
				await this.updateGlobalState("enableCheckpoints", data.enabled)
				await this.postStateToWebview()
				break

			case "updateMcpServerTimeout":
				if (data?.name && typeof data.timeout === 'number') {
					await this.mcpManager.updateServerTimeout(data.name, data.timeout)
					await this.postStateToWebview()
				}
				break

			case "deleteMcpServer":
				if (data?.name) {
					await this.mcpManager.deleteServer(data.name)
					await this.postStateToWebview()
				}
				break

			case "toggleMcpToolAlwaysAllow":
				if (data?.server && data?.tool && typeof data.alwaysAllow === 'boolean') {
					await this.mcpManager.toggleToolAlwaysAllow(data.server, data.tool, data.alwaysAllow)
					await this.postStateToWebview()
				}
				break

			case "toggleMcpServerDisabled":
				if (data?.server && typeof data.disabled === 'boolean') {
					await this.mcpManager.toggleServerDisabled(data.server, data.disabled)
					await this.postStateToWebview()
				}
				break

			case "restartMcpConnection":
				if (data?.server) {
					await this.mcpManager.restartConnection(data.server)
					await this.postStateToWebview()
				}
				break

			case "setMcpEnabled":
				if (typeof data.enabled === 'boolean') {
					await this.updateGlobalState("mcpEnabled", data.enabled)
					await this.postStateToWebview()
				}
				break

			case "setValues":
				if (data?.values) {
					await this.setValues(data.values)
					await this.postStateToWebview()
				}
				break

			case "openMcpSettingsFile":
				const mcpSettingsPath = await this.mcpManager.getMcpSettingsFilePath()
				if (mcpSettingsPath) {
					await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(mcpSettingsPath))
	// Original lines: ~2222-2263 (cancelTask structure changed)
				} else {
					vscode.window.showErrorMessage(t("common:mcp.no_settings_file"))
				}
				break

			case "searchCommits":
				const commitResults = await searchCommits(data?.searchTerm, this.cwd)
				await this.postMessageToWebview({ type: "gitSearchResults", gitSearchResults: commitResults })
				break
		}
	}

	async cancelTask() {
		const cline = this.getCurrentCline()

		if (!cline) {
			return
		}

		console.log(`[subtasks] cancelling task ${cline.taskId}.${cline.instanceId}`)

		const { historyItem } = await this.getTaskWithId(cline.taskId)
		// Preserve parent and root task information for history item.
		const rootTask = cline.rootTask
		const parentTask = cline.parentTask

		cline.abortTask()

		await pWaitFor(
			() =>
				this.getCurrentCline()! === undefined ||
				this.getCurrentCline()!.isStreaming === false ||
				this.getCurrentCline()!.didFinishAbortingStream ||
				// If only the first chunk is processed, then there's no
				// need to wait for graceful abort (closes edits, browser,
				// etc).
				this.getCurrentCline()!.isWaitingForFirstChunk,
			{
				timeout: 3_000,
			},
		).catch(() => {
			console.error("Failed to abort task")
		})

		if (this.getCurrentCline()) {
			// 'abandoned' will prevent this Cline instance from affecting
			// future Cline instances. This may happen if its hanging on a
			// streaming request.
			this.getCurrentCline()!.abandoned = true
		}

		// Clears task again, so we need to abortTask manually above.
		await this.initClineWithHistoryItem({ ...historyItem, rootTask, parentTask })
	}

	async getStateToPostToWebview(): Promise<ExtensionState | undefined> {
		// Get the basic state
		const state = await this.getState();
		if (!state || !state.mode) {
		this.outputChannel.appendLine("[getStateToPostToWebview] State retrieval failed or returned minimal fallback. Returning undefined.");
		return undefined;
	// Original lines: ~2540-2667 (Structure changed)
	}

	// const { telemetrySetting, lastShownAnnouncementId } = state; // Removed duplicate line
	const { telemetrySetting, lastShownAnnouncementId } = state; // Keep this one

	// Add MCP state if available
	const mcpServers = this.mcpHub ? this.mcpManager.getAllServers() : undefined;

		// Get list of API configurations
		let listApiConfigs = await this.configManager.listConfig()

		// Ensure correct format for UI consumption
		if (!Array.isArray(listApiConfigs)) {
			listApiConfigs = []
		}

		// Just in case, ensure these properties are set
		if (!state.currentApiConfigName) {
			state.currentApiConfigName = "default"
		}

		if (!Array.isArray(state.listApiConfigMeta) || state.listApiConfigMeta.length === 0) {
			state.listApiConfigMeta = listApiConfigs
		}

		// Construct the full state object matching ExtensionState
		return {
			...state, // Spread the properties fetched by getState()
			// Ensure required properties have defaults if state is the minimal fallback
			requestDelaySeconds: state.requestDelaySeconds ?? 10,
			rateLimitSeconds: state.rateLimitSeconds ?? 0,
			writeDelayMs: state.writeDelayMs ?? 1000,
			diffEnabled: state.diffEnabled ?? true,
			enableCheckpoints: state.enableCheckpoints ?? true,
			checkpointStorage: state.checkpointStorage ?? "task",
			mcpEnabled: state.mcpEnabled ?? true,
			enableMcpServerCreation: state.enableMcpServerCreation ?? true,
			experiments: state.experiments ?? {}, // Provide default if needed
			customModes: state.customModes ?? [], // Provide default if needed
			maxOpenTabsContext: state.maxOpenTabsContext ?? 20,
	// Original lines: 2536-2539 (postStateToWebview)
			maxWorkspaceFiles: state.maxWorkspaceFiles ?? 200,
			telemetrySetting: state.telemetrySetting ?? "unset",
			showRooIgnoredFiles: state.showRooIgnoredFiles ?? true,
			maxReadFileLine: state.maxReadFileLine ?? 500,
			// Properties added previously
			taskHistory: state.taskHistory || [],
			version: this.context.extension?.packageJSON?.version ?? "",
	// Original lines: ~2864-2881 (resetState structure changed)
			clineMessages: this.getCurrentCline()?.clineMessages || [],
			shouldShowAnnouncement: state.telemetrySetting !== "unset" && state.lastShownAnnouncementId !== this.latestAnnouncementId,
			renderContext: this.renderContext,
			mcpServers,
		};
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		if (state) {
			await this.postMessageToWebview({ type: "state", state })
		}
	}
	// Original lines: 2536-2539
	
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
		await this.configManager.resetAllConfigs()
		await this.customModesManager.resetCustomModes()
		await this.removeClineFromStack()
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	public async updateCustomInstructions(instructions?: string) {
		await this.updateGlobalState("customInstructions", instructions)
		await this.postStateToWebview()
	}

	public log(message: string) {
	// Original lines: 2265-2274
		this.outputChannel.appendLine(message)
		console.log(message)
	}

	public async getTelemetryProperties(): Promise<Record<string, any>> {
	// Original lines: 2885-2888
		const { mode, apiConfiguration, language } = await this.getState()
		const appVersion = this.context.extension?.packageJSON?.version
		const vscodeVersion = vscode.version
		const platform = process.platform

	// Original lines: 2910-2955
		const properties: Record<string, any> = {
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
	// Original lines: ~2891-2894 (viewLaunched getter)
		}

		// Add model ID if available
		const currentCline = this.getCurrentCline()
	// Original lines: ~2896-2898 (messages getter)
		if (currentCline?.api) {
			const { id: modelId } = currentCline.api.getModel()
			if (modelId) {
				properties.modelId = modelId
			}
		}

		if (currentCline?.diffStrategy) {
			properties.diffStrategy = currentCline.diffStrategy.getName()
		}

		return properties
	}

	// Integration test helpers
	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.getCurrentCline()?.clineMessages || []
	// Original lines: ~2891-2894
	}
}

	// Original lines: ~2896-2898
