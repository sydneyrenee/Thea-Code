import {
	ModelInfo,
	GlobalSettings,
	ApiConfigMeta,
	ProviderSettings as ApiConfiguration,
	HistoryItem,
	ModeConfig,
	CheckpointStorage,
	TelemetrySetting,
	ExperimentId,
	TheaAsk, // Renamed
	TheaSay, // Renamed
	ToolProgressStatus,
	TheaMessage, // Renamed
} from "../schemas"
import { McpServer } from "./mcp"
import { GitCommit } from "../utils/git"
import { Mode } from "./modes"

export type { ApiConfigMeta, ToolProgressStatus }

export interface LanguageModelChatSelector {
	vendor?: string
	family?: string
	version?: string
	id?: string
}

// Represents JSON data that is sent from extension to webview, called
// ExtensionMessage and has 'type' enum which can be 'plusButtonClicked' or
// 'settingsButtonClicked' or 'hello'. Webview will hold state.
export interface ExtensionMessage {
	type:
		| "action"
		| "state"
		| "selectedImages"
		| "ollamaModels"
		| "lmStudioModels"
		| "theme"
		| "workspaceUpdated"
		| "invoke"
		| "partialMessage"
		| "openRouterModels"
		| "glamaModels"
		| "unboundModels"
		| "requestyModels"
		| "openAiModels"
		| "mcpServers"
		| "enhancedPrompt"
		| "commitSearchResults"
		| "listApiConfig"
		| "vsCodeLmModels"
		| "vsCodeLmApiAvailable"
		| "requestVsCodeLmModels"
		| "updatePrompt"
		| "systemPrompt"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "currentCheckpointUpdated"
		| "browserToolEnabled"
		| "browserConnectionResult"
		| "remoteBrowserEnabled"
		| "ttsStart"
		| "ttsStop"
		| "maxReadFileLine"
		| "fileSearchResults"
		| "toggleApiConfigPin"
	text?: string
	action?:
		| "chatButtonClicked"
		| "mcpButtonClicked"
		| "settingsButtonClicked"
		| "historyButtonClicked"
		| "promptsButtonClicked"
		| "didBecomeVisible"
	invoke?: "newChat" | "sendMessage" | "primaryButtonClick" | "secondaryButtonClick" | "setChatBoxMessage"
	state?: ExtensionState
	images?: string[]
	ollamaModels?: string[]
	lmStudioModels?: string[]
	vsCodeLmModels?: { vendor?: string; family?: string; version?: string; id?: string }[]
	filePaths?: string[]
	openedTabs?: Array<{
		label: string
		isActive: boolean
		path?: string
	}>
	partialMessage?: TheaMessage // Renamed type
	openRouterModels?: Record<string, ModelInfo>
	glamaModels?: Record<string, ModelInfo>
	unboundModels?: Record<string, ModelInfo>
	requestyModels?: Record<string, ModelInfo>
	openAiModels?: string[]
	mcpServers?: McpServer[]
	commits?: GitCommit[]
	listApiConfig?: ApiConfigMeta[]
	mode?: Mode
	customMode?: ModeConfig
	slug?: string
	success?: boolean
	values?: Record<string, unknown>
	requestId?: string
	promptText?: string
	results?: Array<{
		path: string
		type: "file" | "folder"
		label?: string
	}>
	error?: string
}

export type ExtensionState = Pick<
	GlobalSettings,
	| "currentApiConfigName"
	| "listApiConfigMeta"
	| "pinnedApiConfigs"
	// | "lastShownAnnouncementId"
	| "customInstructions"
	// | "taskHistory" // Optional in GlobalSettings, required here.
	| "autoApprovalEnabled"
	| "alwaysAllowReadOnly"
	| "alwaysAllowReadOnlyOutsideWorkspace"
	| "alwaysAllowWrite"
	| "alwaysAllowWriteOutsideWorkspace"
	// | "writeDelayMs" // Optional in GlobalSettings, required here.
	| "alwaysAllowBrowser"
	| "alwaysApproveResubmit"
	// | "requestDelaySeconds" // Optional in GlobalSettings, required here.
	| "alwaysAllowMcp"
	| "alwaysAllowModeSwitch"
	| "alwaysAllowSubtasks"
	| "alwaysAllowExecute"
	| "allowedCommands"
	| "browserToolEnabled"
	| "browserViewportSize"
	| "screenshotQuality"
	| "remoteBrowserEnabled"
	| "remoteBrowserHost"
	// | "enableCheckpoints" // Optional in GlobalSettings, required here.
	// | "checkpointStorage" // Optional in GlobalSettings, required here.
	| "ttsEnabled"
	| "ttsSpeed"
	| "soundEnabled"
	| "soundVolume"
	// | "maxOpenTabsContext" // Optional in GlobalSettings, required here.
	// | "maxWorkspaceFiles" // Optional in GlobalSettings, required here.
	// | "showTheaIgnoredFiles" // Optional in GlobalSettings, required here.
	// | "maxReadFileLine" // Optional in GlobalSettings, required here.
	| "terminalOutputLineLimit"
	| "terminalShellIntegrationTimeout"
	// | "rateLimitSeconds" // Optional in GlobalSettings, required here.
	| "diffEnabled"
	| "fuzzyMatchThreshold"
	// | "experiments" // Optional in GlobalSettings, required here.
	| "language"
	// | "telemetrySetting" // Optional in GlobalSettings, required here.
	// | "mcpEnabled" // Optional in GlobalSettings, required here.
	// | "enableMcpServerCreation" // Optional in GlobalSettings, required here.
	// | "mode" // Optional in GlobalSettings, required here.
	| "modeApiConfigs"
	// | "customModes" // Optional in GlobalSettings, required here.
	| "customModePrompts"
	| "customSupportPrompts"
	| "enhancementApiConfigId"
> & {
	version: string
	osInfo: string
	clineMessages: TheaMessage[] // Renamed type
	currentTaskItem?: HistoryItem
	apiConfiguration?: ApiConfiguration
	uriScheme?: string
	shouldShowAnnouncement: boolean

	taskHistory: HistoryItem[]

	writeDelayMs: number
	requestDelaySeconds: number

	enableCheckpoints: boolean
	checkpointStorage: CheckpointStorage
	maxOpenTabsContext: number // Maximum number of VSCode open tabs to include in context (0-500)
	maxWorkspaceFiles: number // Maximum number of files to include in current working directory details (0-500)
	showTheaIgnoredFiles: boolean // Whether to show ignored files in listings
	maxReadFileLine: number // Maximum number of lines to read from a file before truncating

	rateLimitSeconds: number // Minimum time between successive requests (0 = disabled).
	experiments: Record<ExperimentId, boolean> // Map of experiment IDs to their enabled state

	mcpEnabled: boolean
	enableMcpServerCreation: boolean

	mode: Mode
	customModes: ModeConfig[]
	toolRequirements?: Record<string, boolean> // Map of tool names to their requirements (e.g. {"apply_diff": true} if diffEnabled)

	cwd?: string // Current working directory
	telemetrySetting: TelemetrySetting
	telemetryKey?: string
	machineId?: string

	renderContext: "sidebar" | "editor"
	settingsImportedAt?: number
}

export type { TheaMessage, TheaAsk, TheaSay } // Renamed exports

export interface TheaSayTool {
	// Renamed interface
	tool:
		| "editedExistingFile"
		| "appliedDiff"
		| "newFileCreated"
		| "readFile"
		| "fetchInstructions"
		| "listFilesTopLevel"
		| "listFilesRecursive"
		| "listCodeDefinitionNames"
		| "searchFiles"
		| "switchMode"
		| "newTask"
		| "finishTask"
	path?: string
	diff?: string
	content?: string
	regex?: string
	filePattern?: string
	mode?: string
	reason?: string
	isOutsideWorkspace?: boolean
}

// Must keep in sync with system prompt.
export const browserActions = ["launch", "click", "hover", "type", "scroll_down", "scroll_up", "close"] as const

export type BrowserAction = (typeof browserActions)[number]

export interface TheaSayBrowserAction {
	// Renamed interface
	action: BrowserAction
	coordinate?: string
	text?: string
}

export type BrowserActionResult = {
	screenshot?: string
	logs?: string
	currentUrl?: string
	currentMousePosition?: string
}

export interface TheaAskUseMcpServer {
	// Renamed interface
	serverName: string
	type: "use_mcp_tool" | "access_mcp_resource"
	toolName?: string
	arguments?: string
	uri?: string
}

export interface TheaApiReqInfo {
	// Renamed interface
	request?: string
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
	cancelReason?: TheaApiReqCancelReason // Renamed type
	streamingFailedMessage?: string
}

export type TheaApiReqCancelReason = "streaming_failed" | "user_cancelled" // Renamed type
