import * as path from "path"
import fs from "fs/promises"
import getFolderSize from "get-folder-size"
import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"

import { TheaProvider } from "./webview/TheaProvider" // Renamed import and path
import { TheaMessage } from "../shared/ExtensionMessage" // Renamed import
import { GlobalFileNames } from "../shared/globalFileNames"
import { fileExistsAtPath } from "../utils/fs"
import { findLastIndex } from "../shared/array"
import { getApiMetrics } from "../shared/getApiMetrics"
import { combineApiRequests } from "../shared/combineApiRequests"
import { combineCommandSequences } from "../shared/combineCommandSequences"
import { TokenUsage } from "../schemas"

// TODO: Rename types if necessary

interface TaskStateManagerOptions {
	taskId: string
	providerRef: WeakRef<TheaProvider> // Renamed type
	taskNumber: number
	onMessagesUpdate?: (messages: TheaMessage[]) => void // Renamed type
	onHistoryUpdate?: (history: (Anthropic.MessageParam & { ts?: number })[]) => void // Callback for history changes
	onTokenUsageUpdate?: (usage: TokenUsage) => void // Callback for token usage updates
}

export class TaskStateManager {
	private taskId: string
	private providerRef: WeakRef<TheaProvider> // Renamed type
	private taskNumber: number
	private onMessagesUpdate?: (messages: TheaMessage[]) => void // Renamed type
	private onHistoryUpdate?: (history: (Anthropic.MessageParam & { ts?: number })[]) => void
	private onTokenUsageUpdate?: (usage: TokenUsage) => void

	// State properties managed by this class
	public apiConversationHistory: (Anthropic.MessageParam & { ts?: number })[] = []
	public clineMessages: TheaMessage[] = [] // Renamed type

	constructor({
		taskId,
		providerRef,
		taskNumber,
		onMessagesUpdate,
		onHistoryUpdate,
		onTokenUsageUpdate,
	}: TaskStateManagerOptions) {
		this.taskId = taskId
		this.providerRef = providerRef
		this.taskNumber = taskNumber
		this.onMessagesUpdate = onMessagesUpdate
		this.onHistoryUpdate = onHistoryUpdate
		this.onTokenUsageUpdate = onTokenUsageUpdate
	}

	private log(message: string) {
		console.log(`[TaskStateManager:${this.taskId}] ${message}`)
		try {
			this.providerRef.deref()?.log(`[TaskStateManager:${this.taskId}] ${message}`)
		} catch (err) {
			// NO-OP
		}
	}

	// --- Directory Management ---

	public async ensureTaskDirectoryExists(): Promise<string> {
		const globalStoragePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
		if (!globalStoragePath) {
			throw new Error("Global storage uri is invalid")
		}
		const { getTaskDirectoryPath } = await import("../shared/storagePathManager")
		// Await the promise to get the actual path string
		const taskDir: string = await getTaskDirectoryPath(globalStoragePath, this.taskId)
		// Now use the resolved path string with fs.mkdir
		await fs.mkdir(taskDir, { recursive: true }) // Ensure directory exists
		// Return the resolved path string
		return taskDir
	}

	// --- API Conversation History Management ---

	public async loadApiConversationHistory(): Promise<void> {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			try {
				this.apiConversationHistory = JSON.parse(await fs.readFile(filePath, "utf8"))
				this.log(`Loaded ${this.apiConversationHistory.length} items from API history.`)
				this.onHistoryUpdate?.(this.apiConversationHistory)
			} catch (error) {
				this.log(`Error loading API conversation history: ${error.message}`)
				this.apiConversationHistory = []
				this.onHistoryUpdate?.(this.apiConversationHistory)
			}
		} else {
			this.log("No saved API conversation history found.")
			this.apiConversationHistory = []
			this.onHistoryUpdate?.(this.apiConversationHistory)
		}
	}

	public async addToApiConversationHistory(message: Anthropic.MessageParam): Promise<void> {
		const messageWithTs = { ...message, ts: Date.now() }
		this.apiConversationHistory.push(messageWithTs)
		this.onHistoryUpdate?.(this.apiConversationHistory)
		await this.saveApiConversationHistory()
	}

	public async overwriteApiConversationHistory(newHistory: (Anthropic.MessageParam & { ts?: number })[]): Promise<void> {
		this.apiConversationHistory = newHistory
		this.onHistoryUpdate?.(this.apiConversationHistory)
		await this.saveApiConversationHistory()
	}

	private async saveApiConversationHistory(): Promise<void> {
		try {
			const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
			await fs.writeFile(filePath, JSON.stringify(this.apiConversationHistory))
			this.log(`Saved ${this.apiConversationHistory.length} items to API history.`)
		} catch (error) {
			this.log(`Failed to save API conversation history: ${error.message}`)
			console.error("Failed to save API conversation history:", error)
		}
	}

	// --- UI Messages (ClineMessage) Management ---

	public async loadClineMessages(): Promise<void> {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)

		if (await fileExistsAtPath(filePath)) {
			try {
				this.clineMessages = JSON.parse(await fs.readFile(filePath, "utf8"))
				this.log(`Loaded ${this.clineMessages.length} UI messages.`)
				this.onMessagesUpdate?.(this.clineMessages)
			} catch (error) {
				this.log(`Error loading UI messages: ${error.message}`)
				this.clineMessages = []
				this.onMessagesUpdate?.(this.clineMessages)
			}
		} else {
			// Check old location (migration)
			const oldPath = path.join(await this.ensureTaskDirectoryExists(), "claude_messages.json")
			if (await fileExistsAtPath(oldPath)) {
				this.log("Migrating UI messages from old location.")
				try {
					const data = JSON.parse(await fs.readFile(oldPath, "utf8"))
					await fs.unlink(oldPath) // remove old file
					this.clineMessages = data
					this.onMessagesUpdate?.(this.clineMessages)
					await this.saveClineMessages() // Save to new location
				} catch (error) {
					this.log(`Error migrating UI messages: ${error.message}`)
					this.clineMessages = []
					this.onMessagesUpdate?.(this.clineMessages)
				}
			} else {
				this.log("No saved UI messages found.")
				this.clineMessages = []
				this.onMessagesUpdate?.(this.clineMessages)
			}
		}
	}

	public async addToClineMessages(message: TheaMessage): Promise<void> { // Renamed type
		this.clineMessages.push(message)
		this.onMessagesUpdate?.(this.clineMessages) // Notify TheaTask
		// TheaTask is responsible for emitting 'message' event and posting state
		await this.saveClineMessages()
	}

	public async overwriteClineMessages(newMessages: TheaMessage[]): Promise<void> { // Renamed type
		this.clineMessages = newMessages
		this.onMessagesUpdate?.(this.clineMessages)
		await this.saveClineMessages()
	}

	// Note: updateClineMessage is handled differently, involving posting partial updates.
	// TheaTask will likely retain this method and call saveClineMessages if needed.

	public async saveClineMessages(): Promise<void> {
		try {
			const taskDir = await this.ensureTaskDirectoryExists()
			const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
			await fs.writeFile(filePath, JSON.stringify(this.clineMessages))
			this.log(`Saved ${this.clineMessages.length} UI messages.`)

			// Update history item in the background
			this.updateHistoryItem(taskDir).catch((err) => {
				this.log(`Error updating history item: ${err.message}`)
			})
		} catch (error) {
			this.log(`Failed to save UI messages: ${error.message}`)
			console.error("Failed to save UI messages:", error)
		}
	}

	// --- History Item Update ---

	private async updateHistoryItem(taskDir: string): Promise<void> {
		// Calculate metrics based on current messages
		const apiMetrics = this.getTokenUsage() // This recalculates based on current state

		const taskMessage = this.clineMessages[0] // first message is always the task say
		const lastRelevantMessage =
			this.clineMessages[
				findLastIndex(
					this.clineMessages,
					(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
				)
			]

		if (!taskMessage || !lastRelevantMessage) {
			this.log("Cannot update history item: Missing task or last relevant message.")
			return
		}

		let taskDirSize = 0
		try {
			taskDirSize = await getFolderSize.loose(taskDir)
		} catch (err) {
			this.log(`Failed to get task directory size (${taskDir}): ${err instanceof Error ? err.message : String(err)}`)
		}

		// Use the provider reference to access the history manager
		const provider = this.providerRef.deref()
		if (provider?.theaTaskHistoryManagerInstance) { // Renamed getter
			await provider.theaTaskHistoryManagerInstance.updateTaskHistory({ // Renamed getter
				id: this.taskId,
				number: this.taskNumber,
				ts: lastRelevantMessage.ts,
				task: taskMessage.text ?? "",
				tokensIn: apiMetrics.totalTokensIn,
				tokensOut: apiMetrics.totalTokensOut,
				cacheWrites: apiMetrics.totalCacheWrites,
				cacheReads: apiMetrics.totalCacheReads,
				totalCost: apiMetrics.totalCost,
				size: taskDirSize,
			})
			this.log(`Updated history item for task ${this.taskId}.`)
		} else {
			this.log("Cannot update history item: Provider or history manager not available.")
		}
	}

	// --- Token Usage Calculation ---

	public getTokenUsage(): TokenUsage {
		// Ensure messages are sliced correctly (excluding potential initial system message if applicable)
		const messagesForMetrics = this.clineMessages.slice(1) // Assuming first message is user task, not system prompt
		const usage = getApiMetrics(combineApiRequests(combineCommandSequences(messagesForMetrics)))
		this.onTokenUsageUpdate?.(usage) // Notify TheaTask
		return usage
	}
}