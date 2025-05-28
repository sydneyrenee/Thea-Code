import * as path from "path"
import fs from "fs/promises"
import getFolderSize from "get-folder-size"

// Use static import for easier mocking
import { getTaskDirectoryPath } from "../shared/storagePathManager"

import { TheaProvider } from "./webview/TheaProvider" // Renamed import and path
import { TheaMessage } from "../shared/ExtensionMessage" // Renamed import
import { GlobalFileNames } from "../shared/globalFileNames"
import { fileExistsAtPath } from "../utils/fs"
import { findLastIndex } from "../shared/array"
import { getApiMetrics } from "../shared/getApiMetrics"
import { combineApiRequests } from "../shared/combineApiRequests"
import { combineCommandSequences } from "../shared/combineCommandSequences"
import { TokenUsage } from "../schemas"
import type { NeutralMessage, NeutralConversationHistory } from "../shared/neutral-history"; // Import neutral history types
import { convertToNeutralHistory, convertToAnthropicHistory } from "../api/transform/neutral-anthropic-format"; // Import conversion functions

// TODO: Rename types if necessary

interface TaskStateManagerOptions {
	taskId: string
	providerRef: WeakRef<TheaProvider> // Renamed type
	taskNumber: number
	onMessagesUpdate?: (messages: TheaMessage[]) => void // Renamed type
	onHistoryUpdate?: (history: NeutralConversationHistory) => void // Callback for history changes
	onTokenUsageUpdate?: (usage: TokenUsage) => void // Callback for token usage updates
}

export class TaskStateManager {
	private taskId: string
	private providerRef: WeakRef<TheaProvider> // Renamed type
	private taskNumber: number
	private onMessagesUpdate?: (messages: TheaMessage[]) => void // Renamed type
	private onHistoryUpdate?: (history: NeutralConversationHistory) => void
	private onTokenUsageUpdate?: (usage: TokenUsage) => void

	// State properties managed by this class
	public apiConversationHistory: NeutralConversationHistory = []
	public theaTaskMessages: TheaMessage[] = [] // Renamed type
	// private saveTimeout: NodeJS.Timeout | undefined; // Removed debouncing

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

	private async log(message: string) {
		// Added async
		// console.log(`[TaskStateManager:${this.taskId}] ${message}`) // Removed direct console log to reduce test noise
		try {
			await this.providerRef.deref()?.log(`[TaskStateManager:${this.taskId}] ${message}`) // Added await
		} catch {
			// NO-OP
		}
	}

	// --- Directory Management ---

	public async ensureTaskDirectoryExists(): Promise<string> {
		const globalStoragePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
		if (!globalStoragePath) {
			throw new Error("Global storage uri is invalid")
		}
		// Use the statically imported function
		// Await the promise to get the actual path string
		const taskDir: string = await getTaskDirectoryPath(globalStoragePath, this.taskId)
		// Now use the resolved path string with fs.mkdir
		await fs.mkdir(taskDir, { recursive: true }) // Ensure directory exists
		// Return the resolved path string
		return taskDir
	}

	// --- API Conversation History Management ---

	public async loadApiConversationHistory() {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
		const fileExists = await fileExistsAtPath(filePath)
		if (fileExists) {
			try {
				// Read the raw data (which is in the old Anthropic format)
				const rawHistory = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
				// Convert the raw data to the new Neutral format
				this.apiConversationHistory = convertToNeutralHistory(rawHistory);
				await this.log(`Loaded ${this.apiConversationHistory.length} items from API history.`);
				this.onHistoryUpdate?.(this.apiConversationHistory);
			} catch (error) {
				await this.log(`Error loading API conversation history: ${error instanceof Error ? error.message : String(error)}`);
				// If loading or conversion fails, initialize with an empty neutral history
				this.apiConversationHistory = [];
				this.onHistoryUpdate?.(this.apiConversationHistory);
			}
		} else {
			await this.log("No saved API conversation history found.");
			// If no file exists, initialize with an empty neutral history
			this.apiConversationHistory = [];
			this.onHistoryUpdate?.(this.apiConversationHistory);
		}
	}
	public async addToApiConversationHistory(message: NeutralMessage) {
		const messageWithTs = { ...message, ts: Date.now() };
		this.apiConversationHistory.push(messageWithTs);
		this.onHistoryUpdate?.(this.apiConversationHistory);
		await this.saveApiConversationHistory();
	}

	public async overwriteApiConversationHistory(newHistory: NeutralConversationHistory) {
		this.apiConversationHistory = newHistory;
		this.onHistoryUpdate?.(this.apiConversationHistory);
		await this.saveApiConversationHistory();
	}


	private async saveApiConversationHistory() {
		try {
			const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory);
			// Convert the neutral history to the Anthropic format before saving
			const historyToSave = convertToAnthropicHistory(this.apiConversationHistory);
			await fs.writeFile(filePath, JSON.stringify(historyToSave));
			await this.log(`Saved ${this.apiConversationHistory.length} items to API history.`);
		} catch (error) {
			await this.log(`Failed to save API conversation history: ${error instanceof Error ? error.message : String(error)}`);
			console.error("Failed to save API conversation history:", error);
		}
	}

	// --- UI Messages (ClineMessage) Management ---

	public async loadClineMessages() {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)

		if (await fileExistsAtPath(filePath)) {
			try {
				this.theaTaskMessages = JSON.parse(await fs.readFile(filePath, "utf8")) as TheaMessage[]
				await this.log(`Loaded ${this.theaTaskMessages.length} UI messages.`) // Added await
				this.onMessagesUpdate?.(this.theaTaskMessages)
			} catch (error) {
				await this.log(`Error loading UI messages: ${error instanceof Error ? error.message : String(error)}`) // Added await
				this.theaTaskMessages = []
				this.onMessagesUpdate?.(this.theaTaskMessages)
			}
		} else {
			// Check old location (migration)
			const oldPath = path.join(await this.ensureTaskDirectoryExists(), "claude_messages.json")
			if (await fileExistsAtPath(oldPath)) {
				await this.log("Migrating UI messages from old location.") // Added await
				try {
					const data = JSON.parse(await fs.readFile(oldPath, "utf8")) as TheaMessage[]
					await fs.unlink(oldPath) // remove old file
					this.theaTaskMessages = data
					this.onMessagesUpdate?.(this.theaTaskMessages)
					await this.saveClineMessages() // Save to new location
				} catch (error) {
					await this.log(`Error migrating UI messages: ${error instanceof Error ? error.message : String(error)}`) // Added await
					this.theaTaskMessages = []
					this.onMessagesUpdate?.(this.theaTaskMessages)
				}
			} else {
				await this.log("No saved UI messages found.") // Added await
				this.theaTaskMessages = []
				this.onMessagesUpdate?.(this.theaTaskMessages)
			}
		}
	}

	public async addToClineMessages(message: TheaMessage) {
		// Renamed type
		this.theaTaskMessages.push(message)
		this.onMessagesUpdate?.(this.theaTaskMessages) // Notify TheaTask
		// TheaTask is responsible for emitting 'message' event and posting state
		await this.saveClineMessages() // Added await
	}

	public async overwriteClineMessages(newMessages: TheaMessage[]) {
		// Renamed type
		this.theaTaskMessages = newMessages
		this.onMessagesUpdate?.(this.theaTaskMessages)
		await this.saveClineMessages() // Added await
	}

	// Note: updateClineMessage is handled differently, involving posting partial updates.
	// TheaTask will likely retain this method and call saveClineMessages if needed.

	public async saveClineMessages() {
		// Removed debouncing logic
		try {
			const taskDir = await this.ensureTaskDirectoryExists()
			const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
			await fs.writeFile(filePath, JSON.stringify(this.theaTaskMessages))
			await this.log(`Saved ${this.theaTaskMessages.length} UI messages.`) // Added await

			// Update history item and wait for it to complete
			try {
				await this.updateHistoryItem(taskDir)
			} catch (err) {
				await this.log(`Error updating history item: ${err instanceof Error ? err.message : String(err)}`) // Added await
			}
		} catch (error) {
			await this.log(`Failed to save UI messages: ${error instanceof Error ? error.message : String(error)}`) // Added await
			console.error("Failed to save UI messages:", error)
		}
	}

	// --- History Item Update ---

	private async updateHistoryItem(taskDir: string) {
		// Calculate metrics based on current messages
		const apiMetrics = this.getTokenUsage() // This recalculates based on current state

		const taskMessage = this.theaTaskMessages[0] // first message is always the task say
		const lastRelevantMessage =
			this.theaTaskMessages[
				findLastIndex(
					this.theaTaskMessages,
					(m: TheaMessage) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"), // Add type for m
				)
			]

		if (!taskMessage || !lastRelevantMessage) {
			await this.log("Cannot update history item: Missing task or last relevant message.") // Added await
			return
		}

		let taskDirSize = 0
		try {
			taskDirSize = await getFolderSize.loose(taskDir)
		} catch (err) {
			await this.log(
				`Failed to get task directory size (${taskDir}): ${err instanceof Error ? err.message : String(err)}`,
			) // Added await
		}

		// Use the provider reference to access the history manager
		const provider = this.providerRef.deref()
		if (provider?.theaTaskHistoryManagerInstance) {
			// Renamed getter
			await provider.theaTaskHistoryManagerInstance.updateTaskHistory({
				// Renamed getter
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
			await this.log(`Updated history item for task ${this.taskId}.`) // Added await
		} else {
			await this.log("Cannot update history item: Provider or history manager not available.") // Added await
		}
	}

	// --- Token Usage Calculation ---

	public getTokenUsage(): TokenUsage {
		// Ensure messages are sliced correctly (excluding potential initial system message if applicable)
		const messagesForMetrics = this.theaTaskMessages.slice(1) // Assuming first message is user task, not system prompt
		const usage = getApiMetrics(combineApiRequests(combineCommandSequences(messagesForMetrics)))
		this.onTokenUsageUpdate?.(usage) // Notify TheaTask
		return usage
	}
}
