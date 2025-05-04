import * as vscode from "vscode"
import * as path from "path"
import fs from "fs/promises"
import { Anthropic } from "@anthropic-ai/sdk" // Assuming this path is correct

import { HistoryItem } from "../../../shared/HistoryItem" // Adjusted path
import { ContextProxy } from "../../config/ContextProxy" // Adjusted path
import { GlobalFileNames } from "../../../shared/globalFileNames" // Adjusted path
import { getTaskDirectoryPath } from "../../../shared/storagePathManager" // Added static import
import { fileExistsAtPath } from "../../../utils/fs" // Adjusted path
import { TheaTask } from "../../TheaTask" // Updated import path and type
import { ShadowCheckpointService } from "../../../services/checkpoints/ShadowCheckpointService" // Adjusted path
import { downloadTask } from "../../../integrations/misc/export-markdown" // Adjusted path
import { t } from "../../../i18n" // Adjusted path
import { getWorkspacePath } from "../../../utils/path" // Adjusted path

/**
 * Manages task history storage, retrieval, and associated file operations.
 */
export class TheaTaskHistory {
	// Renamed class
	private workspaceDir: string

	constructor(
		private readonly context: vscode.ExtensionContext, // Keep context if needed (e.g., for globalStorageUri)
		private readonly contextProxy: ContextProxy,
	) {
		this.workspaceDir = getWorkspacePath() // Store workspace dir on construction
	}

	/**
	 * Gets the complete task history list from global state.
	 */
	private async getHistoryList(): Promise<HistoryItem[]> {
		return (await this.contextProxy.getValue("taskHistory")) ?? []
	}

	/**
	 * Updates the task history list in global state.
	 */
	private async updateHistoryList(history: HistoryItem[]): Promise<void> {
		await this.contextProxy.setValue("taskHistory", history)
	}

	/**
	 * Updates the task history with a new or existing item.
	 */
	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = await this.getHistoryList()
		const existingItemIndex = history.findIndex((h) => h.id === item.id)

		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}

		await this.updateHistoryList(history)
		return history
	}

	/**
	 * Gets a task by ID along with associated file paths and conversation history.
	 * Throws an error if the task is not found after attempting cleanup.
	 */
	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = await this.getHistoryList()
		const historyItem = history.find((item) => item.id === id)

		if (historyItem) {
			// Use statically imported function
			const globalStoragePath = this.context.globalStorageUri.fsPath // Use stored context
			const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)

			let apiConversationHistory: Anthropic.MessageParam[] = []
			try {
				const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
				if (fileExists) {
					apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				}
			} catch (readError) {
				console.error(`Error reading conversation history for task ${id}:`, readError)
				// Proceed with empty history, maybe log this more formally
			}

			return {
				historyItem,
				taskDirPath,
				apiConversationHistoryFilePath,
				uiMessagesFilePath,
				apiConversationHistory,
			}
		}

		// If task metadata not found in history list, try to clean up and throw
		console.warn(`Task ${id} not found in history list. Attempting cleanup from state.`)
		await this.deleteTaskFromState(id) // Attempt removal from state only
		throw new Error(`Task ${id} not found`)
	}

	/**
	 * Handles the logic to show a task, requiring provider interaction via callbacks.
	 */
	async showTaskWithId(
		id: string,
		getCurrentCline: () => TheaTask | undefined, // Renamed type
		initClineWithHistoryItem: (historyItem: HistoryItem) => Promise<TheaTask>, // Renamed return type
		postWebviewAction: (action: string) => Promise<void>, // Type was already string, ensure consistency
	): Promise<void> {
		if (id !== getCurrentCline()?.taskId) {
			// Non-current task.
			const { historyItem } = await this.getTaskWithId(id)
			await initClineWithHistoryItem(historyItem) // Provider handles clearing stack and init
		}
		await postWebviewAction("chatButtonClicked") // Provider handles posting message
	}

	/**
	 * Exports a task's conversation history to a Markdown file.
	 */
	async exportTaskWithId(id: string): Promise<void> {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory) // Assuming downloadTask is accessible
	}

	/**
	 * Deletes a task completely, including history entry, checkpoints, and task directory.
	 * Requires provider interaction via callbacks.
	 */
	async deleteTaskWithId(
		id: string,
		getCurrentCline: () => TheaTask | undefined, // Renamed type
		finishSubTask: (message?: string) => Promise<void>,
	): Promise<void> {
		let taskDirPath: string | undefined
		try {
			// Get path before deleting from state, handle potential early error
			try {
				const taskData = await this.getTaskWithId(id)
				taskDirPath = taskData.taskDirPath
			} catch (getTaskError) {
				// If getTaskWithId threw because it wasn't found (and already deleted from state),
				// there's nothing more to do here. If another error, log it.
				if (getTaskError instanceof Error && getTaskError.message.includes("not found")) {
					console.log(`Task ${id} already removed or data inaccessible.`)
					return // Exit successfully
				} else {
					throw getTaskError // Re-throw other errors
				}
			}

			// Remove task from stack if it's the current task (using callback)
			if (id === getCurrentCline()?.taskId) {
				await finishSubTask(t("common:tasks.deleted")) // Provider handles stack removal
			}

			// Delete task from the task history state (will update UI via provider later)
			await this.deleteTaskFromState(id) // Keep internal state update separate

			// Delete associated shadow repository or branch.
			const globalStorageDir = this.context.globalStorageUri.fsPath

			try {
				await ShadowCheckpointService.deleteTask({
					taskId: id,
					globalStorageDir,
					workspaceDir: this.workspaceDir,
				})
			} catch (error) {
				console.error(
					`[deleteTaskWithId ${id}] failed to delete associated shadow repository or branch: ${error instanceof Error ? error.message : String(error)}`,
				)
			}

			// Delete the entire task directory if path was found
			if (taskDirPath) {
				try {
					await fs.rm(taskDirPath, { recursive: true, force: true })
					console.log(`[deleteTaskWithId ${id}] removed task directory ${taskDirPath}`)
				} catch (error) {
					console.error(
						`[deleteTaskWithId ${id}] failed to remove task directory ${taskDirPath}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}
		} catch (error) {
			console.error(`General error in deleteTaskWithId for ${id}:`, error)
			// Avoid re-deleting from state if error happens after initial getTaskWithId failure
			if (!(error instanceof Error && error.message.includes("not found"))) {
				await this.deleteTaskFromState(id) // Ensure state cleanup on other errors
			}
			throw error // Re-throw to indicate failure
		}
	}

	/**
	 * Removes a task entry only from the global state history list.
	 * Does not post updates to the webview.
	 */
	async deleteTaskFromState(id: string): Promise<void> {
		const taskHistory = await this.getHistoryList()
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		// Only update if the list actually changed
		if (updatedTaskHistory.length !== taskHistory.length) {
			await this.updateHistoryList(updatedTaskHistory)
			console.log(`Removed task ${id} from state.`)
		}
		// Removed postStateToWebview - provider's responsibility
	}
}
