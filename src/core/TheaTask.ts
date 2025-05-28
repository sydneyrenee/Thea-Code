import fs from "fs/promises"
import * as path from "path"
import os from "os"
import crypto from "crypto"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import cloneDeep from "clone-deep"
import delay from "delay"
import pWaitFor from "p-wait-for"
import { serializeError } from "serialize-error"
import * as vscode from "vscode"

import { TokenUsage } from "../schemas"
import { ApiHandler, buildApiHandler } from "../api"
import { ApiStream } from "../api/transform/stream"
import { DiffViewProvider } from "../integrations/editor/DiffViewProvider"
import { findToolName, formatContentBlockToMarkdown } from "../integrations/misc/export-markdown"
import { fetchInstructionsTool } from "./tools/fetchInstructionsTool"
import { listFilesTool } from "./tools/listFilesTool"
import { readFileTool } from "./tools/readFileTool"
import { ExitCodeDetails } from "../integrations/terminal/TerminalProcess"
import { Terminal } from "../integrations/terminal/Terminal"
import { TerminalRegistry } from "../integrations/terminal/TerminalRegistry"
import { UrlContentFetcher } from "../services/browser/UrlContentFetcher"
import { listFiles } from "../services/glob/list-files"
import { CheckpointStorage } from "../shared/checkpoints" // Will be moved to TaskCheckpointManager
import { ApiConfiguration, NeutralMessage } from "../shared/api"
import { findLastIndex } from "../shared/array"
import { combineApiRequests } from "../shared/combineApiRequests"
import { combineCommandSequences } from "../shared/combineCommandSequences"
import {
	TheaApiReqCancelReason, // Renamed
	TheaApiReqInfo, // Renamed
	TheaAsk, // Renamed
	TheaMessage, // Renamed
	ToolProgressStatus,
} from "../shared/ExtensionMessage"
import { getApiMetrics } from "../shared/getApiMetrics"
import { HistoryItem } from "../shared/HistoryItem"
import { defaultModeSlug, getModeBySlug, getFullModeDetails } from "../shared/modes"
import { EXPERIMENT_IDS, experiments as Experiments, ExperimentId } from "../shared/experiments"
import { calculateApiCostAnthropic } from "../utils/cost"
import { arePathsEqual } from "../utils/path"
import { parseMentions } from "./mentions"
import { TheaIgnoreController } from "./ignore/TheaIgnoreController"
import { AssistantMessageContent, parseAssistantMessage, ToolParamName, ToolUseName } from "./assistant-message"
import { formatResponse } from "./prompts/responses"
import { SYSTEM_PROMPT } from "./prompts/system"
import { truncateConversationIfNeeded } from "./sliding-window"
import { TheaProvider, TheaProviderEvents } from "./webview/TheaProvider" // Import TheaProviderEvents
import { BrowserSession } from "../services/browser/BrowserSession"
import { formatLanguage } from "../shared/language"
import { McpHub } from "../services/mcp/management/McpHub"
import { DiffStrategy, getDiffStrategy } from "./diff/DiffStrategy"
import { telemetryService } from "../services/telemetry/TelemetryService"
import { validateToolUse, isToolAllowedForMode, ToolName } from "./mode-validator"
import { getWorkspacePath } from "../utils/path"
import { writeToFileTool } from "./tools/writeToFileTool"
import { applyDiffTool } from "./tools/applyDiffTool"
import { insertContentTool } from "./tools/insertContentTool"
import { searchAndReplaceTool } from "./tools/searchAndReplaceTool"
import { listCodeDefinitionNamesTool } from "./tools/listCodeDefinitionNamesTool"
import { searchFilesTool } from "./tools/searchFilesTool"
import { browserActionTool } from "./tools/browserActionTool"
import { executeCommandTool } from "./tools/executeCommandTool"
import { useMcpToolTool } from "./tools/useMcpToolTool"
import { accessMcpResourceTool } from "./tools/accessMcpResourceTool"
import { askFollowupQuestionTool } from "./tools/askFollowupQuestionTool"
import { switchModeTool } from "./tools/switchModeTool"
import { attemptCompletionTool } from "./tools/attemptCompletionTool"
import { newTaskTool } from "./tools/newTaskTool"
import { TaskCheckpointManager } from "./TaskCheckpointManager" // Import the new manager
import { TaskStateManager } from "./TaskStateManager" // Import the new state manager
import { TaskWebviewCommunicator } from "./TaskWebviewCommunicator" // Import the new communicator

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
type UserContent = Array<Anthropic.Messages.ContentBlockParam>

export type TheaTaskEvents = {
	message: [{ action: "created" | "updated"; message: TheaMessage }] // Renamed type
	taskStarted: []
	taskPaused: []
	taskUnpaused: []
	taskAskResponded: []
	taskAborted: []
	taskSpawned: [taskId: string]
	taskCompleted: [taskId: string, usage: TokenUsage]
	taskTokenUsageUpdated: [taskId: string, usage: TokenUsage]
}

export type TheaTaskOptions = {
	// Renamed type
	provider: TheaProvider // Renamed type
	apiConfiguration: ApiConfiguration
	customInstructions?: string
	enableDiff?: boolean
	enableCheckpoints?: boolean
	checkpointStorage?: CheckpointStorage
	fuzzyMatchThreshold?: number
	task?: string
	images?: string[]
	historyItem?: HistoryItem
	experiments?: Record<string, boolean>
	startTask?: boolean
	rootTask?: TheaTask
	parentTask?: TheaTask
	taskNumber?: number
	onCreated?: (task: TheaTask) => void
}

export class TheaTask extends EventEmitter<TheaProviderEvents> {
	readonly taskId: string
	readonly instanceId: string

	readonly rootTask: TheaTask | undefined = undefined
	readonly parentTask: TheaTask | undefined = undefined
	readonly taskNumber: number
	isPaused: boolean = false
	pausedModeSlug: string = defaultModeSlug
	private pauseInterval: ReturnType<typeof setTimeout> | undefined

	readonly apiConfiguration: ApiConfiguration
	api: ApiHandler
	private urlContentFetcher: UrlContentFetcher
	browserSession: BrowserSession
	didEditFile: boolean = false
	customInstructions?: string
	diffStrategy?: DiffStrategy
	diffEnabled: boolean = false
	fuzzyMatchThreshold: number = 1.0

	theaIgnoreController?: TheaIgnoreController

	// Not private since it needs to be accessible by tools
	consecutiveMistakeCount: number = 0
	consecutiveMistakeCountForApplyDiff: Map<string, number> = new Map()
	// Not private since it needs to be accessible by tools
	providerRef: WeakRef<TheaProvider> // Renamed type
	private abort: boolean = false
	didFinishAbortingStream = false
	abandoned = false
	diffViewProvider: DiffViewProvider
	private lastApiRequestTime?: number
	isInitialized = false

	// Checkpoint manager instance
	public webviewCommunicator: TaskWebviewCommunicator // Added communicator instance
	public taskStateManager: TaskStateManager // Added state manager instance
	private checkpointManager?: TaskCheckpointManager

	// streaming
	isWaitingForFirstChunk = false
	isStreaming = false
	private currentStreamingContentIndex = 0
	private assistantMessageContent: AssistantMessageContent[] = []
	private presentAssistantMessageLocked = false
	private presentAssistantMessageHasPendingUpdates = false
	userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
	private userMessageContentReady = false
	didRejectTool = false
	private didAlreadyUseTool = false
	private didCompleteReadingStream = false

	constructor({
		provider,
		apiConfiguration,
		customInstructions,
		enableDiff,
		enableCheckpoints = true,
		checkpointStorage = "task",
		fuzzyMatchThreshold,
		task,
		images,
		historyItem,
		experiments,
		startTask = true,
		rootTask,
		parentTask,
		taskNumber,
		onCreated,
	}: TheaTaskOptions) {
		// Renamed type
		super()

		if (startTask && !task && !images && !historyItem) {
			throw new Error("Either historyItem or task/images must be provided")
		}

		this.theaIgnoreController = new TheaIgnoreController(this.cwd)
		this.theaIgnoreController.initialize().catch((error) => {
			console.error("Failed to initialize TheaIgnoreController:", error)
		})

		this.taskId = historyItem ? historyItem.id : crypto.randomUUID()
		this.instanceId = crypto.randomUUID().slice(0, 8)
		this.taskNumber = -1
		this.apiConfiguration = apiConfiguration
		this.api = buildApiHandler(apiConfiguration)
		this.urlContentFetcher = new UrlContentFetcher(provider.context)
		this.browserSession = new BrowserSession(provider.context)
		this.customInstructions = customInstructions
		this.diffEnabled = enableDiff ?? false
		this.fuzzyMatchThreshold = fuzzyMatchThreshold ?? 1.0
		this.providerRef = new WeakRef(provider)
		// Initialize State Manager FIRST
		this.taskStateManager = new TaskStateManager({
			taskId: this.taskId,
			providerRef: this.providerRef, // Fixed type
			taskNumber: this.taskNumber,
			// Callbacks to update TheaTask's view or trigger side effects
			onMessagesUpdate: () => {
				// If TheaTask needs its own copy, update it here.
				// Otherwise, just trigger webview update if needed.
				void this.providerRef.deref()?.postStateToWebview()
			},
			onHistoryUpdate: () => {
				// If TheaTask needs its own copy, update it here.
			},
			onTokenUsageUpdate: (usage) => {
				this.emit("taskTokenUsageUpdated", this.taskId, usage)
			},
		})
		this.diffViewProvider = new DiffViewProvider(this.cwd)
		// Initialize Webview Communicator SECOND
		this.webviewCommunicator = new TaskWebviewCommunicator({
			providerRef: this.providerRef, // Fixed type
			getMessages: () => this.taskStateManager.theaTaskMessages, // Use state manager // Renamed type
			addMessage: (message: TheaMessage) => this.addMessageToStateAndEmit(message), // Wrapper // Renamed type
			updateMessageUi: (message: TheaMessage) => this.updateUiMessage(message), // Wrapper // Renamed type
			saveMessages: () => this.taskStateManager.saveClineMessages(), // Use state manager
			isTaskAborted: () => this.abort,
			taskId: this.taskId,
			instanceId: this.instanceId,
			onAskResponded: () => this.emit("taskAskResponded", this.taskId), // Add taskId
		})

		// Initialize Checkpoint Manager
		if (enableCheckpoints) {
			this.checkpointManager = new TaskCheckpointManager({
				taskId: this.taskId,
 			providerRef: this.providerRef, // Fixed type
				checkpointStorage: checkpointStorage,
				getMessages: () => this.taskStateManager.theaTaskMessages, // Pass getter for messages
				saveMessages: () => this.taskStateManager.saveClineMessages(), // Use state manager method // Renamed type
			})
		}

		this.rootTask = rootTask
		this.parentTask = parentTask
		this.taskNumber = taskNumber ?? -1

		if (historyItem) {
			telemetryService.captureTaskRestarted(this.taskId)
		} else {
			telemetryService.captureTaskCreated(this.taskId)
		}

		// Initialize diffStrategy based on current state.
		void this.updateDiffStrategy(experiments ?? {})

		onCreated?.(this)

		if (startTask) {
			if (task || images) {
				void this.startTask(task, images)
			} else if (historyItem) {
				void this.resumeTaskFromHistory()
			} else {
				throw new Error("Either historyItem or task/images must be provided")
			}
		}
	}
	// --- Communication Helpers (Internal Wrappers for Communicator) ---

	private async addMessageToStateAndEmit(message: TheaMessage) {
		// Renamed type
		// This method now acts as a bridge to the state manager and event emitter
		await this.taskStateManager.addToClineMessages(message)
		this.emit("message", { taskId: this.taskId, action: "created", message }) // Add taskId
	}

	private async updateUiMessage(partialMessage: TheaMessage) {
		// Renamed type
		// This method now acts as a bridge to the provider and event emitter
		await this.providerRef.deref()?.postMessageToWebview({ type: "partialMessage", partialMessage })
		this.emit("message", { taskId: this.taskId, action: "updated", message: partialMessage }) // Add taskId
		// Note: Saving is handled when the partial message becomes complete via the communicator
	}

	static create(options: TheaTaskOptions): [TheaTask, Promise<void>] {
		// Renamed type
		const instance = new TheaTask({ ...options, startTask: false }) // Renamed TheaTask
		const { images, task, historyItem } = options
		let promise

		if (images || task) {
			promise = instance.startTask(task, images)
		} else if (historyItem) {
			promise = instance.resumeTaskFromHistory()
		} else {
			throw new Error("Either historyItem or task/images must be provided")
		}

		return [instance, promise]
	}

	get cwd() {
		return getWorkspacePath(path.join(os.homedir(), "Desktop"))
	}

	// Add method to update diffStrategy.
	updateDiffStrategy(experiments: Partial<Record<ExperimentId, boolean>>) {
		this.diffStrategy = getDiffStrategy({
			model: this.api.getModel().id,
			experiments,

			fuzzyMatchThreshold: this.fuzzyMatchThreshold,
		})
	}

	async sayAndCreateMissingParamError(toolName: ToolUseName, paramName: string, relPath?: string) {
		await this.webviewCommunicator.say(
			"error",
			`Thea tried to use ${toolName}${
				relPath ? ` for '${relPath.toPosix()}'` : ""
			} without value for required parameter '${paramName}'. Retrying...`,
		)
		return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
	}

	// Task lifecycle

	private async startTask(task?: string, images?: string[]): Promise<void> {
		// conversationHistory (for API) and clineMessages (for webview) need to be in sync
		// if the extension process were killed, then on restart the clineMessages might not be empty, so we need to set it to [] when we create a new TheaTask client (otherwise webview would show stale messages from previous session)
		this.taskStateManager.theaTaskMessages = []
		this.taskStateManager.apiConversationHistory = []
		await this.providerRef.deref()?.postStateToWebview()

		await this.webviewCommunicator.say("text", task, images)
		this.isInitialized = true

		let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)

		console.log(`[subtasks] task ${this.taskId}.${this.instanceId} starting`)

		await this.initiateTaskLoop([
			{
				type: "text",
				text: `<task>\n${task}\n</task>`,
			},
			...imageBlocks,
		])
	}

	async resumePausedTask(lastMessage?: string) {
		// release this TheaTask instance from paused state
		this.isPaused = false
		this.emit("taskUnpaused", this.taskId) // Add taskId

		// fake an answer from the subtask that it has completed running and this is the result of what it has done
		// add the message to the chat history and to the webview ui
		try {
			await this.webviewCommunicator.say("text", `${lastMessage ?? "Please continue to the next task."}`)

			await this.taskStateManager.addToApiConversationHistory({
				role: "user",
				content: [
					{
						type: "text",
						text: `[new_task completed] Result: ${lastMessage ?? "Please continue to the next task."}`,
					},
				],
			})
		} catch (error) {
			void this.providerRef
				.deref()
				?.log(`Error failed to add reply from subtast into conversation of parent task, error: ${error}`)
			throw error
		}
	}

	private async resumeTaskFromHistory() {
		// Loading now happens in TaskStateManager constructor or load methods
		// const modifiedClineMessages = await this.taskStateManager.loadClineMessages(); // Example if needed, but likely redundant
		const modifiedClineMessages = [...this.taskStateManager.theaTaskMessages] // Work with current state

		// Remove any resume messages that may have been added before
		const lastRelevantMessageIndex = findLastIndex(
			modifiedClineMessages,
			(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
		)
		if (lastRelevantMessageIndex !== -1) {
			modifiedClineMessages.splice(lastRelevantMessageIndex + 1)
		}

		// since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
		const lastApiReqStartedIndex = findLastIndex(
			modifiedClineMessages,
			(m) => m.type === "say" && m.say === "api_req_started",
		)
		if (lastApiReqStartedIndex !== -1) {
			const lastApiReqStarted = modifiedClineMessages[lastApiReqStartedIndex]
			const { cost, cancelReason } = JSON.parse(lastApiReqStarted.text || "{}") as TheaApiReqInfo // Renamed type
			if (cost === undefined && cancelReason === undefined) {
				modifiedClineMessages.splice(lastApiReqStartedIndex, 1)
			}
		}

		await this.taskStateManager.overwriteClineMessages(modifiedClineMessages) // Use state manager method
		await this.taskStateManager.loadClineMessages() // Use manager method to load

		// Now present the cline messages to the user and ask if they want to
		// resume (NOTE: we ran into a bug before where the
		// apiConversationHistory wouldn't be initialized when opening a old
		// task, and it was because we were waiting for resume).
		// This is important in case the user deletes messages without resuming
		// the task first.
		await this.taskStateManager.loadApiConversationHistory() // Use manager method to load

		const lastClineMessage = this.taskStateManager.theaTaskMessages
			.slice()
			.reverse()
			.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task")) // could be multiple resume tasks

		let askType: TheaAsk // Renamed type
		if (lastClineMessage?.ask === "completion_result") {
			askType = "resume_completed_task"
		} else {
			askType = "resume_task"
		}

		this.isInitialized = true

		const { response, text, images } = await this.webviewCommunicator.ask(askType) // calls poststatetowebview
		let responseText: string | undefined
		let responseImages: string[] | undefined
		if (response === "messageResponse") {
			await this.webviewCommunicator.say("user_feedback", text, images)
			responseText = text
			responseImages = images
		}

		// Make sure that the api conversation history can be resumed by the API,
		// even if it goes out of sync with cline messages.
		let existingApiConversationHistory: Anthropic.Messages.MessageParam[] = [
			...this.taskStateManager.apiConversationHistory,
		] // Initialize from state manager
		// v2.0 xml tags refactor caveat: replace tool use blocks with text blocks as API disallows tool use without schema
		// Force re-parse
		const conversationWithoutToolBlocks = existingApiConversationHistory.map((message) => {
			if (Array.isArray(message.content)) {
				const newContent = message.content.map((block) => {
					if (block.type === "tool_use") {
						// it's important we convert to the new tool schema format so the model doesn't get confused about how to invoke tools
						const inputAsXml = Object.entries(block.input as Record<string, string>)
							.map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
							.join("\n")
						return {
							type: "text",
							text: `<${block.name}>\n${inputAsXml}\n</${block.name}>`,
						} as Anthropic.Messages.TextBlockParam
					} else if (block.type === "tool_result") {
						// Convert block.content to text block array, removing images
						const contentAsTextBlocks = Array.isArray(block.content)
							? block.content.filter((item) => item.type === "text")
							: [{ type: "text", text: block.content }]
						const textContent = contentAsTextBlocks.map((item) => item.text).join("\n\n")
						const toolName = findToolName(block.tool_use_id, existingApiConversationHistory)
						return {
							type: "text",
							text: `[${toolName} Result]\n\n${textContent}`,
						} as Anthropic.Messages.TextBlockParam
					}
					return block
				})
				return { ...message, content: newContent }
			}
			return message
		})
		existingApiConversationHistory = conversationWithoutToolBlocks

		// FIXME: remove tool use blocks altogether

		// if the last message is an assistant message, we need to check if there's tool use since every tool use has to have a tool response
		// if there's no tool use and only a text block, then we can just add a user message
		// (note this isn't relevant anymore since we use custom tool prompts instead of tool use blocks, but this is here for legacy purposes in case users resume old tasks)

		// if the last message is a user message, we can need to get the assistant message before it to see if it made tool calls, and if so, fill in the remaining tool responses with 'interrupted'

		let modifiedOldUserContent: UserContent // either the last message if its user message, or the user message before the last (assistant) message
		let modifiedApiConversationHistory: Anthropic.Messages.MessageParam[] // need to remove the last user message to replace with new modified user message
		if (existingApiConversationHistory.length > 0) {
			const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]

			if (lastMessage.role === "assistant") {
				const content = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				const hasToolUse = content.some((block) => block.type === "tool_use")

				if (hasToolUse) {
					const toolUseBlocks = content.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]
					const toolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
						type: "tool_result",
						tool_use_id: block.id,
						content: "Task was interrupted before this tool call could be completed.",
					}))
					modifiedApiConversationHistory = [...existingApiConversationHistory] // no changes
					modifiedOldUserContent = [...toolResponses]
				} else {
					modifiedApiConversationHistory = [...existingApiConversationHistory]
					modifiedOldUserContent = []
				}
			} else if (lastMessage.role === "user") {
				const previousAssistantMessage: Anthropic.Messages.MessageParam | undefined =
					existingApiConversationHistory[existingApiConversationHistory.length - 2]

				const existingUserContent: UserContent = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				if (previousAssistantMessage && previousAssistantMessage.role === "assistant") {
					const assistantContent = Array.isArray(previousAssistantMessage.content)
						? previousAssistantMessage.content
						: [{ type: "text", text: previousAssistantMessage.content }]

					const toolUseBlocks = assistantContent.filter(
						(block) => block.type === "tool_use",
					) as Anthropic.Messages.ToolUseBlock[]

					if (toolUseBlocks.length > 0) {
						const existingToolResults = existingUserContent.filter(
							(block) => block.type === "tool_result",
						)

						const missingToolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks
							.filter(
								(toolUse) => !existingToolResults.some((result) => result.tool_use_id === toolUse.id),
							)
							.map((toolUse) => ({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: "Task was interrupted before this tool call could be completed.",
							}))

						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1) // removes the last user message
						modifiedOldUserContent = [...existingUserContent, ...missingToolResponses]
					} else {
						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
						modifiedOldUserContent = [...existingUserContent]
					}
				} else {
					modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
					modifiedOldUserContent = [...existingUserContent]
				}
			} else {
				throw new Error("Unexpected: Last message is not a user or assistant message")
			}
		} else {
			throw new Error("Unexpected: No existing API conversation history")
		}

		let newUserContent: UserContent = [...modifiedOldUserContent]

		const agoText = ((): string => {
			const timestamp = lastClineMessage?.ts ?? Date.now()
			const now = Date.now()
			const diff = now - timestamp
			const minutes = Math.floor(diff / 60000)
			const hours = Math.floor(minutes / 60)
			const days = Math.floor(hours / 24)

			if (days > 0) {
				return `${days} day${days > 1 ? "s" : ""} ago`
			}
			if (hours > 0) {
				return `${hours} hour${hours > 1 ? "s" : ""} ago`
			}
			if (minutes > 0) {
				return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
			}
			return "just now"
		})()

		const wasRecent = lastClineMessage?.ts && Date.now() - lastClineMessage.ts < 30_000

		newUserContent.push({
			type: "text",
			text:
				`[TASK RESUMPTION] This task was interrupted ${agoText}. It may or may not be complete, so please reassess the task context. Be aware that the project state may have changed since then. The current working directory is now '${this.cwd.toPosix()}'. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed.${
					wasRecent
						? "\n\nIMPORTANT: If the last tool use was a write_to_file that was interrupted, the file was reverted back to its original state before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents."
						: ""
				}` +
				(responseText
					? `\n\nNew instructions for task continuation:\n<user_message>\n${responseText}\n</user_message>`
					: ""),
		})

		if (responseImages && responseImages.length > 0) {
			newUserContent.push(...formatResponse.imageBlocks(responseImages))
		}

		await this.taskStateManager.overwriteApiConversationHistory(modifiedApiConversationHistory) // Use state manager method

		console.log(`[subtasks] task ${this.taskId}.${this.instanceId} resuming from history item`)

		await this.initiateTaskLoop(newUserContent)
	}

	private async initiateTaskLoop(userContent: UserContent): Promise<void> {
		// Kicks off the checkpoints initialization process in the background.
		this.checkpointManager?.initialize() // Use checkpoint manager

		let nextUserContent = userContent
		let includeFileDetails = true

		this.emit("taskStarted", this.taskId) // Add taskId

		while (!this.abort) {
			const didEndLoop = await this.recursivelyMakeTheaRequests(nextUserContent, includeFileDetails) // Renamed recursivelyMakeClineRequests
			includeFileDetails = false // we only need file details the first time

			// The way this agentic loop works is that thea will be given a
			// task that he then calls tools to complete. Unless there's an
			// attempt_completion call, we keep responding back to him with his
			// tool's responses until he either attempt_completion or does not
			// use anymore tools. If he does not use anymore tools, we ask him
			// to consider if he's completed the task and then call
			// attempt_completion, otherwise proceed with completing the task.
			// There is a MAX_REQUESTS_PER_TASK limit to prevent infinite
			// requests, but Thea is prompted to finish the task as efficiently
			// as he can.

			if (didEndLoop) {
				// For now a task never 'completes'. This will only happen if
				// the user hits max requests and denies resetting the count.
				break
			} else {
				nextUserContent = [{ type: "text", text: formatResponse.noToolsUsed() }]
				this.consecutiveMistakeCount++
			}
		}
	}

	async abortTask(isAbandoned = false) {
		// if (this.abort) {
		// 	console.log(`[subtasks] already aborted task ${this.taskId}.${this.instanceId}`)
		// 	return
		// }

		console.log(`[subtasks] aborting task ${this.taskId}.${this.instanceId}`)

		// Will stop any autonomously running promises.
		if (isAbandoned) {
			this.abandoned = true
		}

		this.abort = true
		this.emit("taskAborted", this.taskId) // Add taskId

		// Stop waiting for child task completion.
		if (this.pauseInterval) {
			clearInterval(this.pauseInterval)
			this.pauseInterval = undefined
		}

		// Release any terminals associated with this task.
		TerminalRegistry.releaseTerminalsForTask(this.taskId)

		await this.urlContentFetcher.closeBrowser()
		await this.browserSession.closeBrowser()
		this.theaIgnoreController?.dispose()
		this.checkpointManager?.dispose() // Dispose checkpoint manager

		// If we're not streaming then `abortStream` (which reverts the diff
		// view changes) won't be called, so we need to revert the changes here.
		if (this.isStreaming && this.diffViewProvider.isEditing) {
			await this.diffViewProvider.revertChanges()
		}
	}

	// Tools

	async executeCommandTool(command: string, customCwd?: string): Promise<[boolean, ToolResponse]> {
		let workingDir: string
		if (!customCwd) {
			workingDir = this.cwd
		} else if (path.isAbsolute(customCwd)) {
			workingDir = customCwd
		} else {
			workingDir = path.resolve(this.cwd, customCwd)
		}

		// Check if directory exists
		try {
			await fs.access(workingDir)
		} catch {
			return [false, `Working directory '${workingDir}' does not exist.`]
		}

                const terminalInfo = TerminalRegistry.getOrCreateTerminal(workingDir, !!customCwd, this.taskId)

		// Update the working directory in case the terminal we asked for has
		// a different working directory so that the model will know where the
		// command actually executed:
		workingDir = terminalInfo.getCurrentWorkingDirectory()

		const workingDirInfo = workingDir ? ` from '${workingDir.toPosix()}'` : ""
		terminalInfo.terminal.show() // weird visual bug when creating new terminals (even manually) where there's an empty space at the top.
		const process = terminalInfo.runCommand(command)

		let userFeedback: { text?: string; images?: string[] } | undefined
		let didContinue = false
		const sendCommandOutput = async (line: string): Promise<void> => {
			try {
				const { response, text, images } = await this.webviewCommunicator.ask("command_output", line)
				if (response === "yesButtonClicked") {
					// proceed while running
				} else {
					userFeedback = { text, images }
				}
				didContinue = true
				process.continue() // continue past the await
			} catch {
				// This can only happen if this ask promise was ignored, so ignore this error
			}
		}

		const { terminalOutputLineLimit = 500 } =
			(await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter

		void process.on("line", (line) => {
			if (!didContinue) {
				void sendCommandOutput(Terminal.compressTerminalOutput(line, terminalOutputLineLimit))
			} else {
				void this.webviewCommunicator.say(
					"command_output",
					Terminal.compressTerminalOutput(line, terminalOutputLineLimit),
				)
			}
		})

		let completed = false
		let result: string = ""
		let exitDetails: ExitCodeDetails | undefined
		void process.once("completed", (output?: string) => {
			// Use provided output if available, otherwise keep existing result.
			result = output ?? ""
			completed = true
		})

		void process.once("shell_execution_complete", (details: ExitCodeDetails) => {
			exitDetails = details
		})

		void process.once("no_shell_integration", (message: string) => {
			void this.webviewCommunicator.say("shell_integration_warning", message)
		})

		await process

		// Wait for a short delay to ensure all messages are sent to the webview
		// This delay allows time for non-awaited promises to be created and
		// for their associated messages to be sent to the webview, maintaining
		// the correct order of messages (although the webview is smart about
		// grouping command_output messages despite any gaps anyways)
		await delay(50)

		result = Terminal.compressTerminalOutput(result, terminalOutputLineLimit)

		if (userFeedback) {
			await this.webviewCommunicator.say("user_feedback", userFeedback.text, userFeedback.images)
			return [
				true,
				formatResponse.toolResult(
					`Command is still running in terminal ${terminalInfo.id}${workingDirInfo}.${
						result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
					}\n\nThe user provided the following feedback:\n<feedback>\n${userFeedback.text}\n</feedback>`,
					userFeedback.images,
				),
			]
		} else if (completed) {
			let exitStatus: string = ""
			if (exitDetails !== undefined) {
				if (exitDetails.signal) {
					exitStatus = `Process terminated by signal ${exitDetails.signal} (${exitDetails.signalName})`
					if (exitDetails.coreDumpPossible) {
						exitStatus += " - core dump possible"
					}
				} else if (exitDetails.exitCode === undefined) {
					result += "<VSCE exit code is undefined: terminal output and command execution status is unknown.>"
					exitStatus = `Exit code: <undefined, notify user>`
				} else {
					if (exitDetails.exitCode !== 0) {
						exitStatus += "Command execution was not successful, inspect the cause and adjust as needed.\n"
					}
					exitStatus += `Exit code: ${exitDetails.exitCode}`
				}
			} else {
				result += "<VSCE exitDetails == undefined: terminal output and command execution status is unknown.>"
				exitStatus = `Exit code: <undefined, notify user>`
			}

			let workingDirInfo: string = workingDir ? ` within working directory '${workingDir.toPosix()}'` : ""
			const newWorkingDir = terminalInfo.getCurrentWorkingDirectory()

			if (newWorkingDir !== workingDir) {
				workingDirInfo += `; command changed working directory for this terminal to '${newWorkingDir.toPosix()} so be aware that future commands will be executed from this directory`
			}

			const outputInfo = `\nOutput:\n${result}`
			return [
				false,
				`Command executed in terminal ${terminalInfo.id}${workingDirInfo}. ${exitStatus}${outputInfo}`,
			]
		} else {
			return [
				false,
				`Command is still running in terminal ${terminalInfo.id}${workingDirInfo}.${
					result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
				}\n\nYou will be updated on the terminal status and new output in the future.`,
			]
		}
	}

	async *attemptApiRequest(previousApiReqIndex: number, retryAttempt: number = 0): ApiStream {
		let mcpHub: McpHub | undefined

		const { mcpEnabled, alwaysApproveResubmit, requestDelaySeconds, rateLimitSeconds } =
			(await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter

		let rateLimitDelay = 0

		// Only apply rate limiting if this isn't the first request
		if (this.lastApiRequestTime) {
			const now = Date.now()
			const timeSinceLastRequest = now - this.lastApiRequestTime
			const rateLimit = rateLimitSeconds || 0
			rateLimitDelay = Math.ceil(Math.max(0, rateLimit * 1000 - timeSinceLastRequest) / 1000)
		}

		// Only show rate limiting message if we're not retrying. If retrying, we'll include the delay there.
		if (rateLimitDelay > 0 && retryAttempt === 0) {
			// Show countdown timer
			for (let i = rateLimitDelay; i > 0; i--) {
				const delayMessage = `Rate limiting for ${i} seconds...`
				await this.webviewCommunicator.say("api_req_retry_delayed", delayMessage, undefined, true)
				await delay(1000)
			}
		}

		// Update last request time before making the request
		this.lastApiRequestTime = Date.now()

		if (mcpEnabled ?? true) {
			mcpHub = this.providerRef.deref()?.theaMcpManagerInstance.getMcpHub() // Renamed getter
			if (!mcpHub) {
				throw new Error("MCP hub not available")
			}
			// Wait for MCP servers to be connected before generating system prompt
			await pWaitFor(() => mcpHub!.isConnecting !== true, { timeout: 10_000 }).catch(() => {
				console.error("MCP servers failed to connect in time")
			})
		}

		const theaIgnoreInstructions = this.theaIgnoreController?.getInstructions()

		const {
			browserViewportSize,
			mode,
			customModePrompts,
			experiments,
			enableMcpServerCreation,
			browserToolEnabled,
			language,
		} = (await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter
		const { customModes } = (await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter
		const systemPrompt = await (async () => {
			const provider = this.providerRef.deref()
			if (!provider) {
				throw new Error("Provider not available")
			}
			return SYSTEM_PROMPT(
				provider.context,
				this.cwd,
				(this.api.getModel().info.supportsComputerUse ?? false) && (browserToolEnabled ?? true),
				mcpHub,
				this.diffStrategy,
				browserViewportSize,
				mode,
				customModePrompts,
				customModes,
				this.customInstructions,
				this.diffEnabled,
				experiments,
				enableMcpServerCreation,
				language,
				theaIgnoreInstructions,
			)
		})()

		// If the previous API request's total token usage is close to the context window, truncate the conversation history to free up space for the new request
		if (previousApiReqIndex >= 0) {
			const previousRequest = this.taskStateManager.theaTaskMessages[previousApiReqIndex]?.text
			if (!previousRequest) return

			const {
				tokensIn = 0,
				tokensOut = 0,
				cacheWrites = 0,
				cacheReads = 0,
			} = JSON.parse(previousRequest) as TheaApiReqInfo // Renamed type

			const totalTokens = tokensIn + tokensOut + cacheWrites + cacheReads

			// Default max tokens value for thinking models when no specific value is set
			const DEFAULT_THINKING_MODEL_MAX_TOKENS = 16_384

			const modelInfo = this.api.getModel().info
			const maxTokens = modelInfo.thinking
				? this.apiConfiguration.modelMaxTokens || DEFAULT_THINKING_MODEL_MAX_TOKENS
				: modelInfo.maxTokens
			const contextWindow = modelInfo.contextWindow
			const trimmedMessages = await truncateConversationIfNeeded({
				messages: this.taskStateManager.apiConversationHistory,
				totalTokens,
				maxTokens,
				contextWindow,
				apiHandler: this.api,
			})

			if (trimmedMessages !== this.taskStateManager.apiConversationHistory) {
				await this.taskStateManager.overwriteApiConversationHistory(trimmedMessages)
			}
		}

		// Clean conversation history by:
		// 1. Converting to Anthropic.MessageParam by spreading only the API-required properties
		// 2. Converting image blocks to text descriptions if model doesn't support images
		const cleanConversationHistory = this.taskStateManager.apiConversationHistory.map(({ role, content }) => {
			// Handle array content (could contain image blocks)
			if (Array.isArray(content)) {
				if (!this.api.getModel().info.supportsImages) {
					// Convert image blocks to text descriptions
					content = content.map((block) => {
						if (block.type === "image") {
							// Convert image blocks to text descriptions
							// Note: We can't access the actual image content/url due to API limitations,
							// but we can indicate that an image was present in the conversation
							return {
								type: "text",
								text: "[Referenced image in conversation]",
							}
						}
						return block
					})
				}
			}
			return { role, content }
		})

		const stream = this.api.createMessage(systemPrompt, cleanConversationHistory)
		const iterator = stream[Symbol.asyncIterator]()

		try {
			// Awaiting first chunk to see if it will throw an error.
			this.isWaitingForFirstChunk = true
			const firstChunk = await iterator.next()
			yield firstChunk.value
			this.isWaitingForFirstChunk = false
		} catch (error) {
			// note that this api_req_failed ask is unique in that we only present this option if the api hasn't streamed any content yet (ie it fails on the first chunk due), as it would allow them to hit a retry button. However if the api failed mid-stream, it could be in any arbitrary state where some tools may have executed, so that error is handled differently and requires cancelling the task entirely.
			if (alwaysApproveResubmit) {
				let errorMsg: string

				const typedError = error as { 
					error?: { metadata?: { raw?: unknown } },
					message?: string,
					status?: number,
					errorDetails?: Array<{ "@type"?: string, retryDelay?: string }>
				}

				if (typedError.error?.metadata?.raw) {
					errorMsg = JSON.stringify(typedError.error.metadata.raw, null, 2)
				} else if (typedError.message) {
					errorMsg = typedError.message
				} else {
					errorMsg = "Unknown error"
				}

				const baseDelay = requestDelaySeconds || 5
				let exponentialDelay = Math.ceil(baseDelay * Math.pow(2, retryAttempt))

				// If the error is a 429, and the error details contain a retry delay, use that delay instead of exponential backoff
				if (typedError.status === 429) {
					const geminiRetryDetails = typedError.errorDetails?.find(
						detail => detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
					)
					if (geminiRetryDetails) {
						const match = geminiRetryDetails.retryDelay?.match(/^(\d+)s$/)
						if (match && match[1]) {
							exponentialDelay = Number(match[1]) + 1
						}
					}
				}

				// Wait for the greater of the exponential delay or the rate limit delay
				const finalDelay = Math.max(exponentialDelay, rateLimitDelay)

				// Show countdown timer with exponential backoff
				for (let i = finalDelay; i > 0; i--) {
					await this.webviewCommunicator.say(
						"api_req_retry_delayed",
						`${errorMsg}\n\nRetry attempt ${retryAttempt + 1}\nRetrying in ${i} seconds...`,
						undefined,
						true,
					)
					await delay(1000)
				}

				await this.webviewCommunicator.say(
					"api_req_retry_delayed",
					`${errorMsg}\n\nRetry attempt ${retryAttempt + 1}\nRetrying now...`,
					undefined,
					false,
				)

				// delegate generator output from the recursive call with incremented retry count
				yield* this.attemptApiRequest(previousApiReqIndex, retryAttempt + 1)
				return
			} else {
				const typedError = error as { message?: string }
				const { response } = await this.webviewCommunicator.ask(
					"api_req_failed",
					typedError.message ?? JSON.stringify(serializeError(error), null, 2),
				)
				if (response !== "yesButtonClicked") {
					// this will never happen since if noButtonClicked, we will clear current task, aborting this instance
					throw new Error("API request failed")
				}
				await this.webviewCommunicator.say("api_req_retried")
				// delegate generator output from the recursive call
				yield* this.attemptApiRequest(previousApiReqIndex)
				return
			}
		}

		// no error, so we can continue to yield all remaining chunks
		// (needs to be placed outside of try/catch since it we want caller to handle errors not with api_req_failed as that is reserved for first chunk failures only)
		// this delegates to another generator or iterable object. In this case, it's saying "yield all remaining values from this iterator". This effectively passes along all subsequent chunks from the original stream.
		yield* iterator
	}

	async presentAssistantMessage() {
		if (this.abort) {
			throw new Error(`[TheaTask#presentAssistantMessage] task ${this.taskId}.${this.instanceId} aborted`)
		}

		if (this.presentAssistantMessageLocked) {
			this.presentAssistantMessageHasPendingUpdates = true
			return
		}
		this.presentAssistantMessageLocked = true
		this.presentAssistantMessageHasPendingUpdates = false

		if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
			// this may happen if the last content block was completed before streaming could finish. if streaming is finished, and we're out of bounds then this means we already presented/executed the last content block and are ready to continue to next request
			if (this.didCompleteReadingStream) {
				this.userMessageContentReady = true
			}
			// console.log("no more content blocks to stream! this shouldn't happen?")
			this.presentAssistantMessageLocked = false
			return
			//throw new Error("No more content blocks to stream! This shouldn't happen...") // remove and just return after testing
		}

		const block = cloneDeep(this.assistantMessageContent[this.currentStreamingContentIndex]) // need to create copy bc while stream is updating the array, it could be updating the reference block properties too

		let isCheckpointPossible = false

		switch (block.type) {
			case "text": {
				if (this.didRejectTool || this.didAlreadyUseTool) {
					break
				}
				let content = block.content
				if (content) {
					// (have to do this for partial and complete since sending content in thinking tags to markdown renderer will automatically be removed)
					// Remove end substrings of <thinking or </thinking (below xml parsing is only for opening tags)
					// (this is done with the xml parsing below now, but keeping here for reference)
					// content = content.replace(/<\/?t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?$/, "")
					// Remove all instances of <thinking> (with optional line break after) and </thinking> (with optional line break before)
					// - Needs to be separate since we dont want to remove the line break before the first tag
					// - Needs to happen before the xml parsing below
					content = content.replace(/<thinking>\s?/g, "")
					content = content.replace(/\s?<\/thinking>/g, "")

					// Remove partial XML tag at the very end of the content (for tool use and thinking tags)
					// (prevents scrollview from jumping when tags are automatically removed)
					const lastOpenBracketIndex = content.lastIndexOf("<")
					if (lastOpenBracketIndex !== -1) {
						const possibleTag = content.slice(lastOpenBracketIndex)
						// Check if there's a '>' after the last '<' (i.e., if the tag is complete) (complete thinking and tool tags will have been removed by now)
						const hasCloseBracket = possibleTag.includes(">")
						if (!hasCloseBracket) {
							// Extract the potential tag name
							let tagContent: string
							if (possibleTag.startsWith("</")) {
								tagContent = possibleTag.slice(2).trim()
							} else {
								tagContent = possibleTag.slice(1).trim()
							}
							// Check if tagContent is likely an incomplete tag name (letters and underscores only)
							const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
							// Preemptively remove < or </ to keep from these artifacts showing up in chat (also handles closing thinking tags)
							const isOpeningOrClosing = possibleTag === "<" || possibleTag === "</"
							// If the tag is incomplete and at the end, remove it from the content
							if (isOpeningOrClosing || isLikelyTagName) {
								content = content.slice(0, lastOpenBracketIndex).trim()
							}
						}
					}
				}
				await this.webviewCommunicator.say("text", content, undefined, block.partial)
				break
			}
			case "tool_use":
				const toolDescription = (): string => {
					switch (block.name) {
						case "execute_command":
							return `[${block.name} for '${block.params.command}']`
						case "read_file":
							return `[${block.name} for '${block.params.path}']`
						case "fetch_instructions":
							return `[${block.name} for '${block.params.task}']`
						case "write_to_file":
							return `[${block.name} for '${block.params.path}']`
						case "apply_diff":
							return `[${block.name} for '${block.params.path}']`
						case "search_files":
							return `[${block.name} for '${block.params.regex}'${
								block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""
							}]`
						case "insert_content":
							return `[${block.name} for '${block.params.path}']`
						case "search_and_replace":
							return `[${block.name} for '${block.params.path}']`
						case "list_files":
							return `[${block.name} for '${block.params.path}']`
						case "list_code_definition_names":
							return `[${block.name} for '${block.params.path}']`
						case "browser_action":
							return `[${block.name} for '${block.params.action}']`
						case "use_mcp_tool":
							return `[${block.name} for '${block.params.server_name}']`
						case "access_mcp_resource":
							return `[${block.name} for '${block.params.server_name}']`
						case "ask_followup_question":
							return `[${block.name} for '${block.params.question}']`
						case "attempt_completion":
							return `[${block.name}]`
						case "switch_mode":
							return `[${block.name} to '${block.params.mode_slug}'${block.params.reason ? ` because: ${block.params.reason}` : ""}]`
						case "new_task": {
							const mode = block.params.mode ?? defaultModeSlug
							const message = block.params.message ?? "(no message)"
							const modeName = getModeBySlug(mode, customModes)?.name ?? mode
							return `[${block.name} in ${modeName} mode: '${message}']`
						}
					}
				}

				if (this.didRejectTool) {
					// ignore any tool content after user has rejected tool once
					if (!block.partial) {
						this.userMessageContent.push({
							type: "text",
							text: `Skipping tool ${toolDescription()} due to user rejecting a previous tool.`,
						})
					} else {
						// partial tool after user rejected a previous tool
						this.userMessageContent.push({
							type: "text",
							text: `Tool ${toolDescription()} was interrupted and not executed due to user rejecting a previous tool.`,
						})
					}
					break
				}

				if (this.didAlreadyUseTool) {
					// ignore any content after a tool has already been used
					this.userMessageContent.push({
						type: "text",
						text: `Tool [${block.name}] was not executed because a tool has already been used in this message. Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,
					})
					break
				}

				const pushToolResult = (content: ToolResponse) => {
					this.userMessageContent.push({
						type: "text",
						text: `${toolDescription()} Result:`,
					})
					if (typeof content === "string") {
						this.userMessageContent.push({
							type: "text",
							text: content || "(tool did not return anything)",
						})
					} else {
						this.userMessageContent.push(...content)
					}
					// once a tool result has been collected, ignore all other tool uses since we should only ever present one tool result per message
					this.didAlreadyUseTool = true

					// Flag a checkpoint as possible since we've used a tool
					// which may have changed the file system.
					isCheckpointPossible = true
				}

				const askApproval = async (
					type: TheaAsk, // Renamed type
					partialMessage?: string,
					progressStatus?: ToolProgressStatus,
				) => {
					const { response, text, images } = await this.webviewCommunicator.ask(
						type,
						partialMessage,
						false,
						progressStatus,
					)
					if (response !== "yesButtonClicked") {
						// Handle both messageResponse and noButtonClicked with text
						if (text) {
							await this.webviewCommunicator.say("user_feedback", text, images)
							pushToolResult(
								formatResponse.toolResult(formatResponse.toolDeniedWithFeedback(text), images),
							)
						} else {
							pushToolResult(formatResponse.toolDenied())
						}
						this.didRejectTool = true
						return false
					}
					// Handle yesButtonClicked with text
					if (text) {
						await this.webviewCommunicator.say("user_feedback", text, images)
						pushToolResult(formatResponse.toolResult(formatResponse.toolApprovedWithFeedback(text), images))
					}
					return true
				}

				const askFinishSubTaskApproval = async () => {
					// ask the user to approve this task has completed, and he has reviewd it, and we can declare task is finished
					// and return control to the parent task to continue running the rest of the sub-tasks
					const toolMessage = JSON.stringify({
						tool: "finishTask",
						content:
							"Subtask completed! You can review the results and suggest any corrections or next steps. If everything looks good, confirm to return the result to the parent task.",
					})

					return await askApproval("tool", toolMessage)
				}

				const handleError = async (action: string, error: Error) => {
					const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
					await this.webviewCommunicator.say(
						"error",
						`Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
					)
					// this.toolResults.push({
					// 	type: "tool_result",
					// 	tool_use_id: toolUseId,
					// 	content: await this.formatToolError(errorString),
					// })
					pushToolResult(formatResponse.toolError(errorString))
				}

				// If block is partial, remove partial closing tag so its not presented to user
				const removeClosingTag = (tag: ToolParamName, text?: string): string => {
					if (!block.partial) {
						return text || ""
					}
					if (!text) {
						return ""
					}
					// This regex dynamically constructs a pattern to match the closing tag:
					// - Optionally matches whitespace before the tag
					// - Matches '<' or '</' optionally followed by any subset of characters from the tag name
					const tagRegex = new RegExp(
						`\\s?<\/?${tag
							.split("")
							.map((char) => `(?:${char})?`)
							.join("")}$`,
						"g",
					)
					return text.replace(tagRegex, "")
				}

				if (block.name !== "browser_action") {
					await this.browserSession.closeBrowser()
				}

				if (!block.partial) {
					telemetryService.captureToolUsage(this.taskId, block.name)
				}

				// Validate tool use before execution
				const { mode, customModes } =
					(await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter
				try {
					validateToolUse(
						block.name as ToolName,
						mode ?? defaultModeSlug,
						customModes ?? [],
						{
							apply_diff: this.diffEnabled,
						},
						block.params,
					)
				} catch (error) {
					this.consecutiveMistakeCount++
					const typedError = error as { message?: string }
					pushToolResult(formatResponse.toolError(typedError.message ?? "Unknown error"))
					break
				}

				switch (block.name) {
					case "write_to_file":
						await writeToFileTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "apply_diff":
						await applyDiffTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "insert_content":
						await insertContentTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "search_and_replace":
						await searchAndReplaceTool(
							this,
							block,
							askApproval,
							handleError,
							pushToolResult,
							removeClosingTag,
						)
						break
					case "read_file":
						await readFileTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "fetch_instructions":
						await fetchInstructionsTool(this, block, askApproval, handleError, pushToolResult)
						break
					case "list_files":
						await listFilesTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "list_code_definition_names":
						await listCodeDefinitionNamesTool(
							this,
							block,
							askApproval,
							handleError,
							pushToolResult,
							removeClosingTag,
						)
						break
					case "search_files":
						await searchFilesTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "browser_action":
						await browserActionTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "execute_command":
						await executeCommandTool(
							this,
							block,
							askApproval,
							handleError,
							pushToolResult,
							removeClosingTag,
						)
						break
					case "use_mcp_tool":
						await useMcpToolTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "access_mcp_resource":
						await accessMcpResourceTool(
							this,
							block,
							askApproval,
							handleError,
							pushToolResult,
							removeClosingTag,
						)
						break
					case "ask_followup_question":
						await askFollowupQuestionTool(
							this,
							block,
							askApproval,
							handleError,
							pushToolResult,
							removeClosingTag,
						)
						break
					case "switch_mode":
						await switchModeTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "new_task":
						await newTaskTool(this, block, askApproval, handleError, pushToolResult, removeClosingTag)
						break
					case "attempt_completion":
						await attemptCompletionTool(
							this,
							block,
							askApproval,
							handleError,
							pushToolResult,
							removeClosingTag,
							toolDescription,
							askFinishSubTaskApproval,
						)
						break
				}

				break
		}

		if (isCheckpointPossible) {
			this.checkpointManager?.save() // Use checkpoint manager
		}

		/*
		Seeing out of bounds is fine, it means that the next too call is being built up and ready to add to assistantMessageContent to present.
		When you see the UI inactive during this, it means that a tool is breaking without presenting any UI. For example the write_to_file tool was breaking when relpath was undefined, and for invalid relpath it never presented UI.
		*/
		this.presentAssistantMessageLocked = false // this needs to be placed here, if not then calling this.presentAssistantMessage below would fail (sometimes) since it's locked
		// NOTE: when tool is rejected, iterator stream is interrupted and it waits for userMessageContentReady to be true. Future calls to present will skip execution since didRejectTool and iterate until contentIndex is set to message length and it sets userMessageContentReady to true itself (instead of preemptively doing it in iterator)
		if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
			// block is finished streaming and executing
			if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
				// its okay that we increment if !didCompleteReadingStream, it'll just return bc out of bounds and as streaming continues it will call presentAssitantMessage if a new block is ready. if streaming is finished then we set userMessageContentReady to true when out of bounds. This gracefully allows the stream to continue on and all potential content blocks be presented.
				// last block is complete and it is finished executing
				this.userMessageContentReady = true // will allow pwaitfor to continue
			}

			// call next block if it exists (if not then read stream will call it when its ready)
			this.currentStreamingContentIndex++ // need to increment regardless, so when read stream calls this function again it will be streaming the next block

			if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
				// there are already more content blocks to stream, so we'll call this function ourselves
				// await this.presentAssistantContent()

				await this.presentAssistantMessage()
				return
			}
		}
		// block is partial, but the read stream may have finished
		if (this.presentAssistantMessageHasPendingUpdates) {
			await this.presentAssistantMessage()
		}
	}

	// Used when a sub-task is launched and the parent task is waiting for it to
	// finish.
	// TBD: The 1s should be added to the settings, also should add a timeout to
	// prevent infinite waiting.
	async waitForResume() {
		await new Promise<void>((resolve) => {
			this.pauseInterval = setInterval(() => {
				if (!this.isPaused) {
					clearInterval(this.pauseInterval)
					this.pauseInterval = undefined
					resolve()
				}
			}, 1000)
		})
	}

	// Helper to convert Anthropic messages to Neutral format for Ollama/OpenAI-compatible APIs
	private anthropicToNeutral(anthropicMessages: Anthropic.Messages.MessageParam[]): NeutralMessage[] {
		const neutralMessages: NeutralMessage[] = []
		for (const msg of anthropicMessages) {
			if (msg.role === "user" || msg.role === "assistant") {
				let combinedText = ""
				if (typeof msg.content === "string") {
					combinedText = msg.content
				} else if (Array.isArray(msg.content)) {
					// Combine text blocks, ignore images/tool results/uses for neutral format
					combinedText = msg.content
						.filter((block): block is Anthropic.TextBlockParam => block.type === "text")
						.map((block) => block.text)
						.join("\n\n") // Join multiple text blocks if they exist
				}
				// Only add if there's actual text content
				if (combinedText.trim()) {
					neutralMessages.push({ role: msg.role, content: combinedText })
				}
			}
			// Ignore system messages here, they are handled separately
			// Ignore tool messages for this simplified neutral format
		}
		return neutralMessages
	}

	// Renamed from recursivelyMakeClineRequests
	async recursivelyMakeTheaRequests(userContent: UserContent, includeFileDetails: boolean = false): Promise<boolean> {
		if (this.abort) {
			throw new Error(`[TheaTask#recursivelyMakeTheaRequests] task ${this.taskId}.${this.instanceId} aborted`)
		}

		if (this.consecutiveMistakeCount >= 3) {
			const { response, text, images } = await this.webviewCommunicator.ask(
				"mistake_limit_reached",
				this.api.getModel().id.includes("claude")
					? `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
					: "Thea Code uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.7 Sonnet for its advanced agentic coding capabilities.",
			)

			if (response === "messageResponse") {
				userContent.push(
					...[
						{
							type: "text",
							text: formatResponse.tooManyMistakes(text),
						} as Anthropic.Messages.TextBlockParam,
						...formatResponse.imageBlocks(images),
					],
				)
			}
			this.consecutiveMistakeCount = 0
		}

		// Get previous api req's index to check token usage and determine if we
		// need to truncate conversation history.
		const previousApiReqIndex = findLastIndex(
			this.taskStateManager.theaTaskMessages,
			(m) => m.say === "api_req_started",
		)

		// In this TheaTask request loop, we need to check if this task instance
		// has been asked to wait for a subtask to finish before continuing.
		const provider = this.providerRef.deref()

		if (this.isPaused && provider) {
			await provider.log(`[subtasks] paused ${this.taskId}.${this.instanceId}`)
			await this.waitForResume()
			await provider.log(`[subtasks] resumed ${this.taskId}.${this.instanceId}`)
			const currentMode = (await provider.theaStateManagerInstance.getState())?.mode ?? defaultModeSlug // Renamed getter

			if (currentMode !== this.pausedModeSlug) {
				// The mode has changed, we need to switch back to the paused mode.
				await provider.handleModeSwitchAndUpdate(this.pausedModeSlug) // Use wrapper method

				// Delay to allow mode change to take effect before next tool is executed.
				await delay(500)

				await provider.log(
					`[subtasks] task ${this.taskId}.${this.instanceId} has switched back to '${this.pausedModeSlug}' from '${currentMode}'`,
				)
			}
		}

		// Getting verbose details is an expensive operation, it uses globby to
		// top-down build file structure of project which for large projects can
		// take a few seconds. For the best UX we show a placeholder api_req_started
		// message with a loading spinner as this happens.
		await this.webviewCommunicator.say(
			"api_req_started",
			JSON.stringify({
				request:
					userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n") + "\n\nLoading...",
			}),
		)

		const [parsedUserContent, environmentDetails] = await this.loadContext(userContent, includeFileDetails)
		userContent = parsedUserContent
		// add environment details as its own text block, separate from tool results
		userContent.push({ type: "text", text: environmentDetails })

		await this.taskStateManager.addToApiConversationHistory({ role: "user", content: userContent })
		telemetryService.captureConversationMessage(this.taskId, "user")

		// since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
		const lastApiReqIndex = findLastIndex(
			this.taskStateManager.theaTaskMessages,
			(m) => m.say === "api_req_started",
		)

		this.taskStateManager.theaTaskMessages[lastApiReqIndex].text = JSON.stringify({
			request: userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n"),
		} satisfies TheaApiReqInfo) // Renamed type

		await this.taskStateManager.saveClineMessages()
		await this.providerRef.deref()?.postStateToWebview()

		try {
			let cacheWriteTokens = 0
			let cacheReadTokens = 0
			let inputTokens = 0
			let outputTokens = 0
			let totalCost: number | undefined

			// update api_req_started. we can't use api_req_finished anymore since it's a unique case where it could come after a streaming message (ie in the middle of being updated or executed)
			// fortunately api_req_finished was always parsed out for the gui anyways, so it remains solely for legacy purposes to keep track of prices in tasks from history
			// (it's worth removing a few months from now)
			const updateApiReqMsg = (cancelReason?: TheaApiReqCancelReason, streamingFailedMessage?: string) => {
				// Renamed type
				// Ensure message exists before updating
				if (this.taskStateManager.theaTaskMessages[lastApiReqIndex]) {
					this.taskStateManager.theaTaskMessages[lastApiReqIndex].text = JSON.stringify({
						...JSON.parse(this.taskStateManager.theaTaskMessages[lastApiReqIndex].text || "{}"),
						tokensIn: inputTokens,
						tokensOut: outputTokens,
						cacheWrites: cacheWriteTokens,
						cacheReads: cacheReadTokens,
						cost:
							totalCost ??
							calculateApiCostAnthropic(
								this.api.getModel().info,
								inputTokens,
								outputTokens,
								cacheWriteTokens,
								cacheReadTokens,
							),
						cancelReason,
						streamingFailedMessage,
					} satisfies TheaApiReqInfo) // Renamed type
				}
			}

			const abortStream = async (cancelReason: TheaApiReqCancelReason, streamingFailedMessage?: string) => {
				// Renamed type
				if (this.diffViewProvider.isEditing) {
					await this.diffViewProvider.revertChanges() // closes diff view
				}

				// if last message is a partial we need to update and save it
				const lastMessage = this.taskStateManager.theaTaskMessages.at(-1)

				if (lastMessage && lastMessage.partial) {
					// lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
					lastMessage.partial = false
					// instead of streaming partialMessage events, we do a save and post like normal to persist to disk
					console.log("updating partial message", lastMessage)
					// await this.taskStateManager.saveClineMessages()
				}

				// Let assistant know their response was interrupted for when task is resumed
				await this.taskStateManager.addToApiConversationHistory({
					role: "assistant",
					content: [
						{
							type: "text",
							text:
								assistantMessage +
								`\n\n[${
									cancelReason === "streaming_failed"
										? "Response interrupted by API Error"
										: "Response interrupted by user"
								}]`,
						},
					],
				})

				// update api_req_started to have cancelled and cost, so that we can display the cost of the partial stream
				updateApiReqMsg(cancelReason, streamingFailedMessage)
				await this.taskStateManager.saveClineMessages()

				// signals to provider that it can retrieve the saved messages from disk, as abortTask can not be awaited on in nature
				this.didFinishAbortingStream = true
			}

			// reset streaming state
			this.currentStreamingContentIndex = 0
			this.assistantMessageContent = []
			this.didCompleteReadingStream = false
			this.userMessageContent = []
			this.userMessageContentReady = false
			this.didRejectTool = false
			this.didAlreadyUseTool = false
			this.presentAssistantMessageLocked = false
			this.presentAssistantMessageHasPendingUpdates = false
			this.diffViewProvider.reset()

			// Yields only if the first chunk is successful, otherwise will
			// allow the user to retry the request (most likely due to rate
			// limit error, which gets thrown on the first chunk).
			const stream = this.attemptApiRequest(previousApiReqIndex)
			let assistantMessage = ""
			let reasoningMessage = ""
			this.isStreaming = true

			try {
				for await (const chunk of stream) {
					if (!chunk) {
						// Sometimes chunk is undefined, no idea that can cause it, but this workaround seems to fix it.
						continue
					}

					switch (chunk.type) {
						case "reasoning":
							reasoningMessage += chunk.text
							await this.webviewCommunicator.say("reasoning", reasoningMessage, undefined, true)
							break
						case "usage":
							inputTokens += chunk.inputTokens
							outputTokens += chunk.outputTokens
							cacheWriteTokens += chunk.cacheWriteTokens ?? 0
							cacheReadTokens += chunk.cacheReadTokens ?? 0
							totalCost = chunk.totalCost
							break
						case "text":
							assistantMessage += chunk.text
							// parse raw assistant message into content blocks
							const prevLength = this.assistantMessageContent.length
							this.assistantMessageContent = parseAssistantMessage(assistantMessage)
							if (this.assistantMessageContent.length > prevLength) {
								this.userMessageContentReady = false // new content we need to present, reset to false in case previous content set this to true
							}
							// present content to user
							await this.presentAssistantMessage()
							break
					}

					if (this.abort) {
						console.log(`aborting stream, this.abandoned = ${this.abandoned}`)

						if (!this.abandoned) {
							// only need to gracefully abort if this instance isn't abandoned (sometimes openrouter stream hangs, in which case this would affect future instances of thea)
							await abortStream("user_cancelled")
						}

						break // aborts the stream
					}

					if (this.didRejectTool) {
						// userContent has a tool rejection, so interrupt the assistant's response to present the user's feedback
						assistantMessage += "\n\n[Response interrupted by user feedback]"
						// this.userMessageContentReady = true // instead of setting this premptively, we allow the present iterator to finish and set userMessageContentReady when its ready
						break
					}

					// PREV: we need to let the request finish for openrouter to get generation details
					// UPDATE: it's better UX to interrupt the request at the cost of the api cost not being retrieved
					if (this.didAlreadyUseTool) {
						assistantMessage +=
							"\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
						break
					}
				}
			} catch (error) {
				// abandoned happens when extension is no longer waiting for the thea instance to finish aborting (error is thrown here when any function in the for loop throws due to this.abort)
				if (!this.abandoned) {
					await this.abortTask() // if the stream failed, there's various states the task could be in (i.e. could have streamed some tools the user may have executed), so we just resort to replicating a cancel task

					const typedError = error as { message?: string }
					await abortStream(
						"streaming_failed",
						typedError.message ?? JSON.stringify(serializeError(error), null, 2),
					)

					const history = await this.providerRef
						.deref()
						?.theaTaskHistoryManagerInstance.getTaskWithId(this.taskId) // Renamed getter

					if (history) {
						await this.providerRef.deref()?.initWithHistoryItem(history.historyItem) // TODO: Rename initClineWithHistoryItem
						// await this.providerRef.deref()?.postStateToWebview()
					}
				}
			} finally {
				this.isStreaming = false
			}

			// need to call here in case the stream was aborted
			if (this.abort || this.abandoned) {
				throw new Error(`[TheaTask#recursivelyMakeTheaRequests] task ${this.taskId}.${this.instanceId} aborted`)
			}

			this.didCompleteReadingStream = true

			// set any blocks to be complete to allow presentAssistantMessage to finish and set userMessageContentReady to true
			// (could be a text block that had no subsequent tool uses, or a text block at the very end, or an invalid tool use, etc. whatever the case, presentAssistantMessage relies on these blocks either to be completed or the user to reject a block in order to proceed and eventually set userMessageContentReady to true)
			const partialBlocks = this.assistantMessageContent.filter((block) => block.partial)
			partialBlocks.forEach((block) => {
				block.partial = false
			})
			// this.assistantMessageContent.forEach((e) => (e.partial = false)) // cant just do this bc a tool could be in the middle of executing ()
			if (partialBlocks.length > 0) {
				await this.presentAssistantMessage() // if there is content to update then it will complete and update this.userMessageContentReady to true, which we pwaitfor before making the next request. all this is really doing is presenting the last partial message that we just set to complete
			}

			updateApiReqMsg()
			await this.taskStateManager.saveClineMessages()
			await this.providerRef.deref()?.postStateToWebview()

			// now add to apiconversationhistory
			// need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
			let didEndLoop = false
			if (assistantMessage.length > 0) {
				await this.taskStateManager.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: assistantMessage }],
				})
				telemetryService.captureConversationMessage(this.taskId, "assistant")

				// NOTE: this comment is here for future reference - this was a workaround for userMessageContent not getting set to true. It was due to it not recursively calling for partial blocks when didRejectTool, so it would get stuck waiting for a partial block to complete before it could continue.
				// in case the content blocks finished
				// it may be the api stream finished after the last parsed content block was executed, so  we are able to detect out of bounds and set userMessageContentReady to true (note you should not call presentAssistantMessage since if the last block is completed it will be presented again)
				// const completeBlocks = this.assistantMessageContent.filter((block) => !block.partial) // if there are any partial blocks after the stream ended we can consider them invalid
				// if (this.currentStreamingContentIndex >= completeBlocks.length) {
				// 	this.userMessageContentReady = true
				// }

				await pWaitFor(() => this.userMessageContentReady)

				// if the model did not tool use, then we need to tell it to either use a tool or attempt_completion
				const didToolUse = this.assistantMessageContent.some((block) => block.type === "tool_use")
				if (!didToolUse) {
					this.userMessageContent.push({
						type: "text",
						text: formatResponse.noToolsUsed(),
					})
					this.consecutiveMistakeCount++
				}

				const recDidEndLoop = await this.recursivelyMakeTheaRequests(this.userMessageContent) // Renamed recursivelyMakeClineRequests
				didEndLoop = recDidEndLoop
			} else {
				// if there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
				await this.webviewCommunicator.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
				)
				await this.taskStateManager.addToApiConversationHistory({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}

			return didEndLoop // will always be false for now
		} catch {
			// this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonClicked, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
			return true // needs to be true so parent loop knows to end task
		}
	}

	async loadContext(userContent: UserContent, includeFileDetails: boolean = false) {
		return await Promise.all([
			// Process userContent array, which contains various block types:
			// TextBlockParam, ImageBlockParam, ToolUseBlockParam, and ToolResultBlockParam.
			// We need to apply parseMentions() to:
			// 1. All TextBlockParam's text (first user message with task)
			// 2. ToolResultBlockParam's content/context text arrays if it contains "<feedback>" (see formatToolDeniedFeedback, attemptCompletion, executeCommand, and consecutiveMistakeCount >= 3) or "<answer>" (see askFollowupQuestion), we place all user generated content in these tags so they can effectively be used as markers for when we should parse mentions)
			Promise.all(
				userContent.map(async (block) => {
					const { osInfo } = (await this.providerRef.deref()?.theaStateManagerInstance.getState()) || {
						osInfo: "unix",
					} // Renamed getter

					const shouldProcessMentions = (text: string) =>
						text.includes("<task>") || text.includes("<feedback>")

					if (block.type === "text") {
						if (shouldProcessMentions(block.text)) {
							return {
								...block,
								text: await parseMentions(block.text, this.cwd, this.urlContentFetcher, osInfo),
							}
						}
						return block
					} else if (block.type === "tool_result") {
						if (typeof block.content === "string") {
							if (shouldProcessMentions(block.content)) {
								return {
									...block,
									content: await parseMentions(
										block.content,
										this.cwd,
										this.urlContentFetcher,
										osInfo,
									),
								}
							}
							return block
						} else if (Array.isArray(block.content)) {
							const parsedContent = await Promise.all(
								block.content.map(async (contentBlock) => {
									if (contentBlock.type === "text" && shouldProcessMentions(contentBlock.text)) {
										return {
											...contentBlock,
											text: await parseMentions(
												contentBlock.text,
												this.cwd,
												this.urlContentFetcher,
												osInfo,
											),
										}
									}
									return contentBlock
								}),
							)
							return {
								...block,
								content: parsedContent,
							}
						}
						return block
					}
					return block
				}),
			),
			this.getEnvironmentDetails(includeFileDetails),
		])
	}

	async getEnvironmentDetails(includeFileDetails: boolean = false) {
		let details = ""

		const { terminalOutputLineLimit = 500, maxWorkspaceFiles = 200 } =
			(await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter

		// It could be useful for thea to know if the user went from one or no file to another between messages, so we always include this context
		details += "\n\n# VSCode Visible Files"
		const visibleFilePaths = vscode.window.visibleTextEditors
			?.map((editor) => editor.document?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath) => path.relative(this.cwd, absolutePath))
			.slice(0, maxWorkspaceFiles)

		// Filter paths through theaIgnoreController
		const allowedVisibleFiles = this.theaIgnoreController
			? this.theaIgnoreController.filterPaths(visibleFilePaths)
			: visibleFilePaths.map((p) => p.toPosix()).join("\n")

		if (allowedVisibleFiles) {
			details += `\n${String(allowedVisibleFiles)}`
		} else {
			details += "\n(No visible files)"
		}

		details += "\n\n# VSCode Open Tabs"
		const { maxOpenTabsContext } = (await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter
		const maxTabs = maxOpenTabsContext ?? 20
		const openTabPaths = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.map((tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
			.filter(Boolean)
			.map((absolutePath) => path.relative(this.cwd, absolutePath).toPosix())
			.slice(0, maxTabs)

		// Filter paths through theaIgnoreController
		const allowedOpenTabs = this.theaIgnoreController
			? this.theaIgnoreController.filterPaths(openTabPaths)
			: openTabPaths.map((p) => p.toPosix()).join("\n")

		if (allowedOpenTabs) {
			details += `\n${String(allowedOpenTabs)}`
		} else {
			details += "\n(No open tabs)"
		}

		// Get task-specific and background terminals
		const busyTerminals = [
			...TerminalRegistry.getTerminals(true, this.taskId),
			...TerminalRegistry.getBackgroundTerminals(true),
		]
		const inactiveTerminals = [
			...TerminalRegistry.getTerminals(false, this.taskId),
			...TerminalRegistry.getBackgroundTerminals(false),
		]

		if (busyTerminals.length > 0 && this.didEditFile) {
			await delay(300) // delay after saving file to let terminals catch up
		}

		if (busyTerminals.length > 0) {
			// wait for terminals to cool down
			await pWaitFor(() => busyTerminals.every((t) => !TerminalRegistry.isProcessHot(t.id)), {
				interval: 100,
				timeout: 15_000,
			}).catch(() => {})
		}

		// we want to get diagnostics AFTER terminal cools down for a few reasons: terminal could be scaffolding a project, dev servers (compilers like webpack) will first re-compile and then send diagnostics, etc
		/*
		let diagnosticsDetails = ""
		const diagnostics = await this.diagnosticsMonitor.getCurrentDiagnostics(this.didEditFile || terminalWasBusy) // if thea ran a command (ie npm install) or edited the workspace then wait a bit for updated diagnostics
		for (const [uri, fileDiagnostics] of diagnostics) {
			const problems = fileDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
			if (problems.length > 0) {
				diagnosticsDetails += `\n## ${path.relative(this.cwd, uri.fsPath)}`
				for (const diagnostic of problems) {
					// let severity = diagnostic.severity === vscode.DiagnosticSeverity.Error ? "Error" : "Warning"
					const line = diagnostic.range.start.line + 1 // VSCode lines are 0-indexed
					const source = diagnostic.source ? `[${diagnostic.source}] ` : ""
					diagnosticsDetails += `\n- ${source}Line ${line}: ${diagnostic.message}`
				}
			}
		}
		*/
		this.didEditFile = false // reset, this lets us know when to wait for saved files to update terminals

		// waiting for updated diagnostics lets terminal output be the most up-to-date possible
		let terminalDetails = ""
		if (busyTerminals.length > 0) {
			// terminals are cool, let's retrieve their output
			terminalDetails += "\n\n# Actively Running Terminals"
			for (const busyTerminal of busyTerminals) {
				terminalDetails += `\n## Original command: \`${busyTerminal.getLastCommand()}\``
				let newOutput = TerminalRegistry.getUnretrievedOutput(busyTerminal.id)
				if (newOutput) {
					newOutput = Terminal.compressTerminalOutput(newOutput, terminalOutputLineLimit)
					terminalDetails += `\n### New Output\n${newOutput}`
				} else {
					// details += `\n(Still running, no new output)` // don't want to show this right after running the command
				}
			}
		}

		// First check if any inactive terminals in this task have completed processes with output
		const terminalsWithOutput = inactiveTerminals.filter((terminal) => {
			const completedProcesses = terminal.getProcessesWithOutput()
			return completedProcesses.length > 0
		})

		// Only add the header if there are terminals with output
		if (terminalsWithOutput.length > 0) {
			terminalDetails += "\n\n# Inactive Terminals with Completed Process Output"

			// Process each terminal with output
			for (const inactiveTerminal of terminalsWithOutput) {
				let terminalOutputs: string[] = []

				// Get output from completed processes queue
				const completedProcesses = inactiveTerminal.getProcessesWithOutput()
				for (const process of completedProcesses) {
					let output = process.getUnretrievedOutput()
					if (output) {
						output = Terminal.compressTerminalOutput(output, terminalOutputLineLimit)
						terminalOutputs.push(`Command: \`${process.command}\`\n${output}`)
					}
				}

				// Clean the queue after retrieving output
				inactiveTerminal.cleanCompletedProcessQueue()

				// Add this terminal's outputs to the details
				if (terminalOutputs.length > 0) {
					terminalDetails += `\n## Terminal ${inactiveTerminal.id}`
					terminalOutputs.forEach(output => {
						terminalDetails += `\n### New Output\n${output}`
					})
				}
			}
		}

		// details += "\n\n# VSCode Workspace Errors"
		// if (diagnosticsDetails) {
		// 	details += diagnosticsDetails
		// } else {
		// 	details += "\n(No errors detected)"
		// }

		if (terminalDetails) {
			details += terminalDetails
		}

		// Add current time information with timezone
		const now = new Date()
		const formatter = new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			hour12: true,
		})
		const timeZone = formatter.resolvedOptions().timeZone
		const timeZoneOffset = -now.getTimezoneOffset() / 60 // Convert to hours and invert sign to match conventional notation
		const timeZoneOffsetHours = Math.floor(Math.abs(timeZoneOffset))
		const timeZoneOffsetMinutes = Math.abs(Math.round((Math.abs(timeZoneOffset) - timeZoneOffsetHours) * 60))
		const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : "-"}${timeZoneOffsetHours}:${timeZoneOffsetMinutes.toString().padStart(2, "0")}`
		details += `\n\n# Current Time\n${formatter.format(now)} (${timeZone}, UTC${timeZoneOffsetStr})`

		// Add context tokens information
		const { contextTokens, totalCost } = getApiMetrics(this.taskStateManager.theaTaskMessages)
		const modelInfo = this.api.getModel().info
		const contextWindow = modelInfo.contextWindow
		const contextPercentage =
			contextTokens && contextWindow ? Math.round((contextTokens / contextWindow) * 100) : undefined
		details += `\n\n# Current Context Size (Tokens)\n${contextTokens ? `${contextTokens.toLocaleString()} (${contextPercentage}%)` : "(Not available)"}`
		details += `\n\n# Current Cost\n${totalCost !== null ? `$${totalCost.toFixed(2)}` : "(Not available)"}`
		// Add current mode and any mode-specific warnings
		const {
			mode,
			customModes,
			customModePrompts,
			experiments = {} as Record<ExperimentId, boolean>,
			customInstructions: globalCustomInstructions,
			language,
		} = (await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter
		const currentMode = mode ?? defaultModeSlug
		const modeDetails = await getFullModeDetails(currentMode, customModes, customModePrompts, {
			cwd: this.cwd,
			globalCustomInstructions,
			language: language ?? formatLanguage(vscode.env.language),
		})
		details += `\n\n# Current Mode\n`
		details += `<slug>${currentMode}</slug>\n`
		details += `<name>${modeDetails.name}</name>\n`
		if (Experiments.isEnabled(experiments ?? {}, EXPERIMENT_IDS.POWER_STEERING)) {
			details += `<role>${modeDetails.roleDefinition}</role>\n`
			if (modeDetails.customInstructions) {
				details += `<custom_instructions>${modeDetails.customInstructions}</custom_instructions>\n`
			}
		}

		// Add warning if not in code mode
		if (
			!isToolAllowedForMode("write_to_file", currentMode, customModes ?? [], {
				apply_diff: this.diffEnabled,
			}) &&
			!isToolAllowedForMode("apply_diff", currentMode, customModes ?? [], { apply_diff: this.diffEnabled })
		) {
			const currentModeName = getModeBySlug(currentMode, customModes)?.name ?? currentMode
			const defaultModeName = getModeBySlug(defaultModeSlug, customModes)?.name ?? defaultModeSlug
			details += `\n\nNOTE: You are currently in '${currentModeName}' mode, which does not allow write operations. To write files, the user will need to switch to a mode that supports file writing, such as '${defaultModeName}' mode.`
		}

		if (includeFileDetails) {
			details += `\n\n# Current Working Directory (${this.cwd.toPosix()}) Files\n`
			const isDesktop = arePathsEqual(this.cwd, path.join(os.homedir(), "Desktop"))
			if (isDesktop) {
				// don't want to immediately access desktop since it would show permission popup
				details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
			} else {
				const maxFiles = maxWorkspaceFiles ?? 200
				const [files, didHitLimit] = await listFiles(this.cwd, true, maxFiles)
				const { showTheaIgnoredFiles = true } =
					(await this.providerRef.deref()?.theaStateManagerInstance.getState()) ?? {} // Renamed getter
				const result = formatResponse.formatFilesList(
					this.cwd,
					files,
					didHitLimit,
					this.theaIgnoreController,
					showTheaIgnoredFiles,
				)
				details += result
			}
		}

		return `<environment_details>\n${details.trim()}\n</environment_details>`
	}

	// Checkpoints - Delegated to TaskCheckpointManager

	public async checkpointDiff(options: {
		ts: number
		previousCommitHash?: string
		commitHash: string
		mode: "full" | "checkpoint"
	}) {
		if (!this.checkpointManager) return
		await this.checkpointManager.diff(options)
	}

	public checkpointSave() {
		this.checkpointManager?.save()
	}

	public async checkpointRestore(options: { ts: number; commitHash: string; mode: "preview" | "restore" }) {
		if (!this.checkpointManager) return

		const index = this.taskStateManager.theaTaskMessages.findIndex((m) => m.ts === options.ts)
		if (index === -1) return

		const success = await this.checkpointManager.restore(options)

		if (success && options.mode === "restore") {
			// Update messages and history after successful restore
			await this.taskStateManager.overwriteApiConversationHistory(
				this.taskStateManager.apiConversationHistory.filter((m) => !m.ts || m.ts < options.ts),
			)

			const deletedMessages = this.taskStateManager.theaTaskMessages.slice(index + 1)
			const { totalTokensIn, totalTokensOut, totalCacheWrites, totalCacheReads, totalCost } = getApiMetrics(
				combineApiRequests(combineCommandSequences(deletedMessages)),
			)

			await this.taskStateManager.overwriteClineMessages(
				this.taskStateManager.theaTaskMessages.slice(0, index + 1),
			)

			await this.webviewCommunicator.say(
				"api_req_deleted",
				JSON.stringify({
					tokensIn: totalTokensIn,
					tokensOut: totalTokensOut,
					cacheWrites: totalCacheWrites,
					cacheReads: totalCacheReads,
					cost: totalCost,
				} satisfies TheaApiReqInfo), // Renamed type
			)

			// Re-init task after restore (provider handles cancellation)
			void this.providerRef.deref()?.cancelTask() // Necessary hack? See original code.
		}
	}
}
