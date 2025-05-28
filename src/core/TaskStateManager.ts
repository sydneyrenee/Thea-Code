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
import { TokenUsage } from "../schemas"
import type { NeutralMessage, NeutralConversationHistory } from "../shared/neutral-history"; // Import neutral history types

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

	private log(message: string) {
		// console.log(`[TaskStateManager:${this.taskId}] ${message}`) // Removed direct console log to reduce test noise
		try {
			this.providerRef.deref()?.log(`[TaskStateManager:${this.taskId}] ${message}`)
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
				// Read the raw data (which should now be in Neutral format)
				const rawHistory = JSON.parse(await fs.readFile(filePath, "utf8")) as NeutralConversationHistory;
				this.apiConversationHistory = rawHistory;
				this.log(`Loaded ${this.apiConversationHistory.length} items from API history.`);
				this.onHistoryUpdate?.(this.apiConversationHistory);
			} catch (error) {
				this.log(`Error loading API conversation history: ${error instanceof Error ? error.message : String(error)}`);
				// If loading or conversion fails, initialize with an empty neutral history
				this.apiConversationHistory = [];
				this.onHistoryUpdate?.(this.apiConversationHistory);
			}
		} else {
			this.log("No saved API conversation history found.");
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
			// Save the neutral history directly
			await fs.writeFile(filePath, JSON.stringify(this.apiConversationHistory));
			this.log(`Saved ${this.apiConversationHistory.length} items to API history.`);
		} catch (error) {
			this.log(`Failed to save API conversation history: ${error instanceof Error ? error.message : String(error)}`);
			console.error("Failed to save API conversation history:", error);
		}
	}

	// --- UI Messages (ClineMessage) Management ---

	public async loadClineMessages() {
		const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)

		if (await fileExistsAtPath(filePath)) {
			try {
				this.theaTaskMessages = JSON.parse(await fs.readFile(filePath, "utf8")) as TheaMessage[]
				this.log(`Loaded ${this.theaTaskMessages.length} UI messages.`) // Added await
				this.onMessagesUpdate?.(this.theaTaskMessages)
			} catch (error) {
				this.log(`Error loading UI messages: ${error instanceof Error ? error.message : String(error)}`) // Added await
				this.theaTaskMessages = []
				this.onMessagesUpdate?.(this.theaTaskMessages)
			}
		} else {
			// Check old location (migration)
			const oldPath = path.join(await this.ensureTaskDirectoryExists(), "claude_messages.json")
			if (await fileExistsAtPath(oldPath)) {
				this.log("Migrating UI messages from old location.") // Added await
				try {
					const data = JSON.parse(await fs.readFile(oldPath, "utf8")) as TheaMessage[]
					await fs.unlink(oldPath) // remove old file
					this.theaTaskMessages = data
					this.onMessagesUpdate?.(this.theaTaskMessages)
					await this.saveClineMessages() // Save to new location
				} catch (error) {
					this.log(`Error migrating UI messages: ${error instanceof Error ? error.message : String(error)}`) // Added await
					this.theaTaskMessages = []
					this.onMessagesUpdate?.(this.theaTaskMessages)
				}
			} else {
				this.log("No saved UI messages found.") // Added await
				this.theaTaskMessages = []
				this.onMessagesUpdate?.(this.theaTaskMessages)
			}
		}
	}

	public async addToClineMessages(message: TheaMessage) {
		// Add message to array
		this.theaTaskMessages.push(message)
		// Notify listeners
		this.onMessagesUpdate?.(this.theaTaskMessages)
		// Save to disk
		await this.saveClineMessages()
	}

	public async overwriteClineMessages(newMessages: TheaMessage[]) {
		// Replace entire array
		this.theaTaskMessages = newMessages
		// Notify listeners
		this.onMessagesUpdate?.(this.theaTaskMessages)
		// Save to disk
		await this.saveClineMessages()
	}

	public async saveClineMessages() {
		// Removed debouncing logic
		try {
			const taskDir = await this.ensureTaskDirectoryExists()
			const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
			await fs.writeFile(filePath, JSON.stringify(this.theaTaskMessages))
			this.log(`Saved ${this.theaTaskMessages.length} UI messages.`) // Added await

			// Update history item and wait for it to complete
			try {
				await this.updateHistoryItem(taskDir)
			} catch (err) {
				this.log(`Error updating history item: ${err instanceof Error ? err.message : String(err)}`) // Added await
			}
		} catch (error) {
			this.log(`Failed to save UI messages: ${error instanceof Error ? error.message : String(error)}`) // Added await
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
			this.log("Cannot update history item: Missing task or last relevant message.") // Added await
			return
		}

		let taskDirSize = 0
		try {
			taskDirSize = await getFolderSize.loose(taskDir)
		} catch (err) {
			this.log(
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
			this.log(`Updated history item for task ${this.taskId}.`) // Added await
		} else {
			this.log("Cannot update history item: Provider or history manager not available.") // Added await
		}
	}

	// --- Token Usage Tracking ---

	public getTokenUsage(): TokenUsage {
		// Calculate metrics based on current messages
		return getApiMetrics(this.apiConversationHistory)
	}
}
