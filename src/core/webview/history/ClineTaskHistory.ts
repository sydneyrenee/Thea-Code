// Extracted from src/core/webview/ClineProvider-original.ts

import * as vscode from 'vscode'
import * as path from 'path'
import fs from 'fs/promises'
import { HistoryItem } from "../../../shared/HistoryItem"
import { ContextProxy } from "../../contextProxy"
import { GlobalFileNames } from "../../../shared/globalFileNames"
import { fileExistsAtPath } from "../../../utils/fs"
import { Anthropic } from "@anthropic-ai/sdk"
import { Cline } from "../../Cline"
import { ShadowCheckpointService } from "../../../services/checkpoints/ShadowCheckpointService"
import { downloadTask } from "../../../integrations/misc/export-markdown"
import { t } from "../../../i18n"
import { getWorkspacePath } from "../../../utils/path"

/**
 * Manages task history storage and retrieval
 */
export class ClineTaskHistory {
    private contextProxy: ContextProxy
    private workspaceDir: string
    
    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.contextProxy = new ContextProxy(context)
        this.workspaceDir = getWorkspacePath()
    }

    /**
     * Updates the task history with a new item
     */
    async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
        try {
            const history = (await this.getTaskHistory()) || []
            const existingItemIndex = history.findIndex((h) => h.id === item.id)

            if (existingItemIndex !== -1) {
                history[existingItemIndex] = item
            } else {
                history.push(item)
            }
            
            await this.contextProxy.updateGlobalState("taskHistory", history)
            return history
        } catch (error) {
            console.error(`Error updating task history: ${error instanceof Error ? error.message : String(error)}`)
            return await this.getTaskHistory() || []
        }
    }

    /**
     * Gets the complete task history
     */
    async getTaskHistory(): Promise<HistoryItem[]> {
        try {
            return (await this.contextProxy.getGlobalState("taskHistory")) as HistoryItem[] || []
        } catch (error) {
            console.error(`Error getting task history: ${error instanceof Error ? error.message : String(error)}`)
            return []
        }
    }
    
    /**
     * Gets a task by ID with all associated data
     */
    async getTaskWithId(id: string): Promise<{
        historyItem: HistoryItem
        taskDirPath: string
        apiConversationHistoryFilePath: string
        uiMessagesFilePath: string
        apiConversationHistory: Anthropic.MessageParam[]
    }> {
        const history = await this.getTaskHistory()
        const historyItem = history.find((item) => item.id === id)
        
        if (!historyItem) {
            // If we tried to get a task that doesn't exist, remove it from state
            await this.deleteTaskFromState(id)
            throw new Error("Task not found")
        }
        
        const { getTaskDirectoryPath } = await import("../../../shared/storagePathManager")
        const globalStoragePath = this.context.globalStorageUri.fsPath
        const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id)
        const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
        const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
            
        try {
            const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
            
            if (fileExists) {
                const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
                return {
                    historyItem,
                    taskDirPath,
                    apiConversationHistoryFilePath,
                    uiMessagesFilePath,
                    apiConversationHistory,
                }
            }
        } catch (error) {
            console.error(`Error accessing task files: ${error}`)
        }
        
        // Return a minimal object with empty conversation history if files can't be accessed
        return {
            historyItem,
            taskDirPath,
            apiConversationHistoryFilePath,
            uiMessagesFilePath,
            apiConversationHistory: [],
        }
    }
    
    /**
     * Shows a task in the UI
     */
    async showTaskWithId(id: string, getCurrentCline: () => Cline | undefined, initHistoryItem: (item: HistoryItem) => Promise<void>, postAction: () => Promise<void>): Promise<void> {
        if (id !== getCurrentCline()?.taskId) {
            // Non-current task.
            const { historyItem } = await this.getTaskWithId(id)
            await initHistoryItem(historyItem) // Clears existing task.
        }

        await postAction()
    }
    
    /**
     * Exports a task to markdown
     */
    async exportTaskWithId(id: string): Promise<void> {
        const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
        await downloadTask(historyItem.ts, apiConversationHistory)
    }
    
    /**
     * Deletes a task and all associated data
     */
    async deleteTaskWithId(id: string, getCurrentCline: () => Cline | undefined, finishSubTask: (message?: string) => Promise<void>): Promise<void> {
        try {
            // Get the task directory full path
            const { taskDirPath } = await this.getTaskWithId(id)

            // Remove task from stack if it's the current task
            if (id === getCurrentCline()?.taskId) {
                // If we found the taskid to delete - call finish to abort this task and allow a new task to be started
                await finishSubTask(t("common:tasks.deleted"))
            }

            // Delete task from the task history state
            await this.deleteTaskFromState(id)

            // Delete associated shadow repository or branch
            const globalStorageDir = this.context.globalStorageUri.fsPath
            
            try {
                await ShadowCheckpointService.deleteTask({ taskId: id, globalStorageDir, workspaceDir: this.workspaceDir })
            } catch (error) {
                console.error(
                    `[deleteTaskWithId${id}] failed to delete associated shadow repository or branch: ${error instanceof Error ? error.message : String(error)}`,
                )
            }

            // Delete the entire task directory including checkpoints and all content
            try {
                await fs.rm(taskDirPath, { recursive: true, force: true })
                console.log(`[deleteTaskWithId${id}] removed task directory`)
            } catch (error) {
                console.error(
                    `[deleteTaskWithId${id}] failed to remove task directory: ${error instanceof Error ? error.message : String(error)}`,
                )
            }
        } catch (error) {
            // If task is not found, just remove it from state
            if (error instanceof Error && error.message === "Task not found") {
                await this.deleteTaskFromState(id)
                return
            }
            throw error
        }
    }
    
    /**
     * Removes a task from the history state
     */
    async deleteTaskFromState(id: string): Promise<void> {
        const history = await this.getTaskHistory()
        const updatedHistory = history.filter((task) => task.id !== id)
        await this.contextProxy.updateGlobalState("taskHistory", updatedHistory)
    }
}
