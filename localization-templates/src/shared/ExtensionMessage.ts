import { ApiConfiguration, ApiProvider, ModelInfo } from "./api"
import { HistoryItem } from "./HistoryItem"
import { McpServer } from "./mcp"
import { GitCommit } from "../utils/git"
import { Mode, CustomModePrompts, ModeConfig } from "./modes"
import { CustomSupportPrompts } from "./support-prompt"
import { ExperimentId } from "./experiments"
import { CheckpointStorage } from "./checkpoints"
import { TelemetrySetting } from "./TelemetrySetting"
import type { ClineMessage, ClineAsk, ClineSay } from "../exports/roo-code"

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
		| "ask" // Added from ClineMessage
		| "state"
		| "selectedImages"
		| "ollamaModels"
		| "code" // Added missing type
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
		| "gitSearchResults" // Added missing type
		| "enhancedPrompt"
		| "commitSearchResults"
		| "images" // Added missing type
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
		| "showHumanRelayDialog"
		| "say" // Added from ClineMessage
		| "humanRelayResponse"
		| "humanRelayCancel"
		| "browserToolEnabled"
		| "browserConnectionResult"
		| "remoteBrowserEnabled"
		| "taskStarted" // Added missing type
		| "ttsStart"
		| "terminal" // Added missing type
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
	code?: string // Added for 'code' and 'terminal' types
	language?: string; // Added for 'code' type
	partialMessage?: ClineMessage
	openRouterModels?: Record<string, ModelInfo>
	glamaModels?: Record<string, ModelInfo>
	unboundModels?: Record<string, ModelInfo>
	task?: string; // Added for 'taskStarted' type
	taskId?: string // Added for 'taskStarted' type
	requestyModels?: Record<string, ModelInfo>
	openAiModels?: string[]
	mcpServers?: McpServer[]
	commits?: GitCommit[]
	listApiConfig?: ApiConfigMeta[]
	mode?: Mode
	customMode?: ModeConfig
	slug?: string
	success?: boolean
	values?: Record<string, any>
	gitSearchResults?: GitCommit[] // Added for 'gitSearchResults' type, renaming 'results'
	requestId?: string
	promptText?: string
	results?: Array<{
		path: string
		type: "file" | "folder"
		label?: string
	}>
	error?: string
}

export interface ApiConfigMeta {
	id: string
	name: string
	apiProvider?: ApiProvider
}

export interface ExtensionState {
	version: string
	clineMessages: ClineMessage[]
	taskHistory: HistoryItem[]
	shouldShowAnnouncement: boolean
	apiConfiguration?: ApiConfiguration
	currentApiConfigName?: string
	listApiConfigMeta?: ApiConfigMeta[]
	customInstructions?: string
	customModePrompts?: CustomModePrompts
	customSupportPrompts?: CustomSupportPrompts
	alwaysAllowReadOnly?: boolean
	alwaysAllowReadOnlyOutsideWorkspace?: boolean
	alwaysAllowWrite?: boolean
	alwaysAllowWriteOutsideWorkspace?: boolean
	alwaysAllowExecute?: boolean
	alwaysAllowBrowser?: boolean
	alwaysAllowMcp?: boolean
	alwaysApproveResubmit?: boolean
	alwaysAllowModeSwitch?: boolean
	alwaysAllowSubtasks?: boolean
	browserToolEnabled?: boolean
	requestDelaySeconds: number
	rateLimitSeconds: number // Minimum time between successive requests (0 = disabled)
	uriScheme?: string
	currentTaskItem?: HistoryItem
	allowedCommands?: string[]
	soundEnabled?: boolean
	ttsEnabled?: boolean
	ttsSpeed?: number
	soundVolume?: number
	diffEnabled?: boolean
	enableCheckpoints: boolean
	checkpointStorage: CheckpointStorage
	browserViewportSize?: string
	mcpServers?: McpServer[]; // Added missing property
	screenshotQuality?: number
	remoteBrowserHost?: string
	remoteBrowserEnabled?: boolean
	fuzzyMatchThreshold?: number
	language?: string
	writeDelayMs: number
	terminalOutputLineLimit?: number
	terminalShellIntegrationTimeout?: number
	mcpEnabled: boolean
	enableMcpServerCreation: boolean
	mode: Mode
	modeApiConfigs?: Record<Mode, string>
	enhancementApiConfigId?: string
	experiments: Record<ExperimentId, boolean> // Map of experiment IDs to their enabled state
	autoApprovalEnabled?: boolean
	customModes: ModeConfig[]
	toolRequirements?: Record<string, boolean> // Map of tool names to their requirements (e.g. {"apply_diff": true} if diffEnabled)
	maxOpenTabsContext: number // Maximum number of VSCode open tabs to include in context (0-500)
	maxWorkspaceFiles: number // Maximum number of files to include in current working directory details (0-500)
	cwd?: string // Current working directory
	telemetrySetting: TelemetrySetting
	telemetryKey?: string
	machineId?: string
	showTheaCodeIgnoredFiles: boolean // Renamed - Whether to show .thea_ignore'd files in listings
	renderContext: "sidebar" | "editor"
	pinnedApiConfigs?: Record<string, boolean> // Map of API config names to pinned state
	maxReadFileLine: number // Maximum number of lines to read from a file before truncating
}

export type { ClineMessage, ClineAsk, ClineSay }

export interface ClineSayTool {
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
export const browserActions = ["launch", "click", "type", "scroll_down", "scroll_up", "close"] as const

export type BrowserAction = (typeof browserActions)[number]

export interface ClineSayBrowserAction {
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

export interface ClineAskUseMcpServer {
	serverName: string
	type: "use_mcp_tool" | "access_mcp_resource"
	toolName?: string
	arguments?: string
	uri?: string
}

export interface ClineApiReqInfo {
	request?: string
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
	cancelReason?: ClineApiReqCancelReason
	streamingFailedMessage?: string
}

export type ClineApiReqCancelReason = "streaming_failed" | "user_cancelled"

export type ToolProgressStatus = {
	icon?: string
	text?: string
}
