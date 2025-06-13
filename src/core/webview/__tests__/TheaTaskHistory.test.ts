// filepath: /Volumes/stuff/Projects/Thea-Code/src/core/webview/__tests__/ClineTaskHistory.test.ts
/* eslint-disable @typescript-eslint/unbound-method */
import * as vscode from "vscode"
import * as path from "path"
import fs from "fs/promises"
import { TheaTaskHistory } from "../history/TheaTaskHistory" // Updated import
import { ContextProxy } from "../../config/ContextProxy"
import { fileExistsAtPath } from "../../../utils/fs"
import { ShadowCheckpointService } from "../../../services/checkpoints/ShadowCheckpointService"
import { downloadTask } from "../../../integrations/misc/export-markdown"
import { getWorkspacePath } from "../../../utils/path"
import { GlobalFileNames } from "../../../shared/globalFileNames"
import { HistoryItem } from "../../../shared/HistoryItem"

// Mock dependencies
jest.mock("vscode")
jest.mock("fs/promises")
jest.mock("../../config/ContextProxy")
jest.mock("../../../utils/fs")
jest.mock("../../TheaTask") // Updated mock path
jest.mock("../../../services/checkpoints/ShadowCheckpointService")
jest.mock("../../../integrations/misc/export-markdown")
jest.mock("../../../utils/path")
jest.mock("../../../shared/storagePathManager", () => ({
	getTaskDirectoryPath: jest
		.fn()
		.mockImplementation((storagePath: string, id: string) => path.join(storagePath, "tasks", id)),
}))

describe("TheaTaskHistory", () => {
	// Updated describe block
	let taskHistory: TheaTaskHistory // Updated type
	let mockContext: vscode.ExtensionContext
	let mockContextProxy: jest.Mocked<ContextProxy>

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Mock context
		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalStorageUri: {
				fsPath: "/test/storage/path",
			},
		} as unknown as vscode.ExtensionContext

		// Mock contextProxy
		mockContextProxy = {
			getValue: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
			setValue: jest.fn().mockImplementation(() => Promise.resolve()),
		} as unknown as jest.Mocked<ContextProxy>

		// Mock getWorkspacePath
		;(getWorkspacePath as jest.Mock).mockReturnValue("/test/workspace")

		// Create instance of TheaTaskHistory
		taskHistory = new TheaTaskHistory(mockContext, mockContextProxy) // Updated instantiation

		// Mock fs methods
		;(fs.rm as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve())
		;(fs.readFile as jest.Mock).mockImplementation(() => Promise.resolve("[]"))

		// Mock console to prevent test output noise
		jest.spyOn(console, "log").mockImplementation(() => {})
		jest.spyOn(console, "error").mockImplementation(() => {})
		jest.spyOn(console, "warn").mockImplementation(() => {})
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	describe("updateTaskHistory", () => {
		test("adds a new history item when it doesn't exist", async () => {
			// Setup
			const mockHistory: HistoryItem[] = []
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve(mockHistory))

			const newHistoryItem: HistoryItem = {
				id: "test-task-id",
				task: "Test Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}

			// Execute
			const result = await taskHistory.updateTaskHistory(newHistoryItem)

			// Verify
			expect(mockContextProxy.getValue).toHaveBeenCalledWith("taskHistory")
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("taskHistory", [newHistoryItem])
			expect(result).toEqual([newHistoryItem])
		})

		test("updates an existing history item", async () => {
			// Setup
			const existingItem: HistoryItem = {
				id: "test-task-id",
				task: "Original Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}

			const mockHistory = [existingItem]
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve(mockHistory))

			const updatedItem: HistoryItem = {
				id: "test-task-id",
				task: "Updated Task",
				ts: 123456789,
				number: 1,
				tokensIn: 150,
				tokensOut: 250,
				totalCost: 0.02,
			}

			// Execute
			const result = await taskHistory.updateTaskHistory(updatedItem)

			// Verify
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("taskHistory", [updatedItem])
			expect(result).toEqual([updatedItem])
		})

		test("handles empty history list", async () => {
			// Setup
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve(null))
			const newHistoryItem: HistoryItem = {
				id: "test-task-id",
				task: "Test Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}

			// Execute
			const result = await taskHistory.updateTaskHistory(newHistoryItem)

			// Verify
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("taskHistory", [newHistoryItem])
			expect(result).toEqual([newHistoryItem])
		})
	})

	describe("getTaskWithId", () => {
		test("returns task data when task exists", async () => {
			// Setup
			const mockHistoryItem: HistoryItem = {
				id: "test-task-id",
				task: "Test Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve([mockHistoryItem]))

			const expectedTaskDirPath = path.join("/test/storage/path", "tasks", "test-task-id")
			const expectedApiHistoryPath = path.join(expectedTaskDirPath, GlobalFileNames.apiConversationHistory)
			const expectedUiMessagesPath = path.join(expectedTaskDirPath, GlobalFileNames.uiMessages)

			;(fileExistsAtPath as jest.Mock).mockResolvedValue(true)
			;(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify([{ role: "user", content: "Hello" }]))

			// Execute
			const result = await taskHistory.getTaskWithId("test-task-id")

			// Verify
			expect(result).toEqual({
				historyItem: mockHistoryItem,
				taskDirPath: expectedTaskDirPath,
				apiConversationHistoryFilePath: expectedApiHistoryPath,
				uiMessagesFilePath: expectedUiMessagesPath,
				apiConversationHistory: [{ role: "user", content: "Hello" }],
			})
		})

		test("handles missing conversation history file", async () => {
			// Setup
			const mockHistoryItem: HistoryItem = {
				id: "test-task-id",
				task: "Test Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve([mockHistoryItem]))
			;(fileExistsAtPath as jest.Mock).mockResolvedValue(false)

			// Execute
			const result = await taskHistory.getTaskWithId("test-task-id")

			// Verify
			expect(result.apiConversationHistory).toEqual([])
		})

		test("throws error and attempts cleanup when task not found", async () => {
			// Setup
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve([]))

			// Mock the deleteTaskFromState method
			const deleteTaskFromStateSpy = jest.spyOn(taskHistory, "deleteTaskFromState").mockResolvedValue(undefined)

			// Execute & Verify
			await expect(taskHistory.getTaskWithId("non-existent-id")).rejects.toThrow("Task non-existent-id not found")
			expect(deleteTaskFromStateSpy).toHaveBeenCalledWith("non-existent-id")
		})

		test("handles error when reading conversation history", async () => {
			// Setup
			const mockHistoryItem: HistoryItem = {
				id: "test-task-id",
				task: "Test Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve([mockHistoryItem]))
			;(fileExistsAtPath as jest.Mock).mockResolvedValue(true)
			;(fs.readFile as jest.Mock).mockRejectedValue(new Error("Read error"))

			// Execute
			const result = await taskHistory.getTaskWithId("test-task-id")

			// Verify
			expect(result.apiConversationHistory).toEqual([])
			expect(console.error).toHaveBeenCalled()
		})
	})

	describe("showTaskWithId", () => {
		test("initializes new Cline when showing a different task", async () => {
			// Setup
			const mockHistoryItem: HistoryItem = {
				id: "different-task-id",
				task: "Different Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}
			const mockGetTaskWithId = jest
				.spyOn(taskHistory, "getTaskWithId")
				.mockResolvedValue({ historyItem: mockHistoryItem })

			const mockGetCurrentCline = jest.fn().mockReturnValue({ taskId: "current-task-id" }) // Keep as is, represents return value
			const mockInitClineWithHistoryItem = jest.fn().mockResolvedValue({ taskId: mockHistoryItem.id }) // Keep as is, represents return value
			const mockPostWebviewAction = jest.fn().mockResolvedValue(undefined)

			// Execute
			await taskHistory.showTaskWithId(
				"different-task-id",
				mockGetCurrentCline,
				mockInitClineWithHistoryItem,
				mockPostWebviewAction,
			)

			// Verify
			expect(mockGetTaskWithId).toHaveBeenCalledWith("different-task-id")
			expect(mockInitClineWithHistoryItem).toHaveBeenCalledWith(mockHistoryItem)
			expect(mockPostWebviewAction).toHaveBeenCalledWith("chatButtonClicked")
		})

		test("doesn't initialize TheaTask when showing current task", async () => {
			// Updated test description
			// Setup
			const mockGetCurrentCline = jest.fn().mockReturnValue({ taskId: "current-task-id" })
			const mockInitClineWithHistoryItem = jest.fn()
			const mockPostWebviewAction = jest.fn().mockResolvedValue(undefined)
			const mockGetTaskWithId = jest.spyOn(taskHistory, "getTaskWithId")

			// Execute
			await taskHistory.showTaskWithId(
				"current-task-id",
				mockGetCurrentCline,
				mockInitClineWithHistoryItem,
				mockPostWebviewAction,
			)

			// Verify
			expect(mockGetTaskWithId).not.toHaveBeenCalled()
			expect(mockInitClineWithHistoryItem).not.toHaveBeenCalled()
			expect(mockPostWebviewAction).toHaveBeenCalledWith("chatButtonClicked")
		})
	})

	describe("exportTaskWithId", () => {
		test("exports task conversation to markdown", async () => {
			// Setup
			const mockHistoryItem: HistoryItem = {
				id: "test-task-id",
				task: "Test Task",
				ts: 123456789,
				number: 1,
				tokensIn: 100,
				tokensOut: 200,
				totalCost: 0.01,
			}
			const mockApiHistory = [{ role: "user", content: "Hello" }]
			const mockGetTaskWithId = jest
				.spyOn(taskHistory, "getTaskWithId")
				.mockResolvedValue({ historyItem: mockHistoryItem, apiConversationHistory: mockApiHistory })

			// Execute
			await taskHistory.exportTaskWithId("test-task-id")

			// Verify
			expect(mockGetTaskWithId).toHaveBeenCalledWith("test-task-id")
			expect(downloadTask).toHaveBeenCalledWith(123456789, mockApiHistory)
		})
	})

	describe("deleteTaskWithId", () => {
		test("deletes task data, directory, and shadow checkpoints", async () => {
			// Setup
			const taskId = "test-task-id"
			const taskDirPath = path.join("/test/storage/path", "tasks", taskId)
			jest.spyOn(taskHistory, "getTaskWithId").mockResolvedValue({ taskDirPath })
			jest.spyOn(taskHistory, "deleteTaskFromState").mockResolvedValue(undefined)

			// Mock getCurrentCline to return a different task ID
			const mockGetCurrentCline = jest.fn().mockReturnValue({ taskId: "different-task-id" })
			const mockFinishSubTask = jest.fn()

			// Execute
			await taskHistory.deleteTaskWithId(taskId, mockGetCurrentCline, mockFinishSubTask)

			// Verify
			expect(mockGetTaskWithId).toHaveBeenCalledWith(taskId)
			expect(mockDeleteTaskFromState).toHaveBeenCalledWith(taskId)
			expect(ShadowCheckpointService.deleteTask).toHaveBeenCalledWith({
				taskId,
				globalStorageDir: "/test/storage/path",
				workspaceDir: "/test/workspace",
			})
			expect(fs.rm).toHaveBeenCalledWith(taskDirPath, { recursive: true, force: true })
			expect(mockFinishSubTask).not.toHaveBeenCalled() // Should not be called for non-current task
		})

		test("finishes subtask when deleting current task", async () => {
			// Setup
			const taskId = "current-task-id"
			const taskDirPath = path.join("/test/storage/path", "tasks", taskId)
			jest.spyOn(taskHistory, "getTaskWithId").mockResolvedValue({ taskDirPath })

			jest.spyOn(taskHistory, "deleteTaskFromState").mockResolvedValue(undefined)

			// Mock getCurrentCline to return the same task ID
			const mockGetCurrentCline = jest.fn().mockReturnValue({ taskId })
			const mockFinishSubTask = jest.fn().mockResolvedValue(undefined)

			// Execute
			await taskHistory.deleteTaskWithId(taskId, mockGetCurrentCline, mockFinishSubTask)

			// Verify
			expect(mockFinishSubTask).toHaveBeenCalled() // Should be called for current task
		})

		test("handles task not found error", async () => {
			// Setup
			const taskId = "non-existent-id"
			jest.spyOn(taskHistory, "getTaskWithId").mockRejectedValue(new Error("Task non-existent-id not found"))

			const mockGetCurrentCline = jest.fn()
			const mockFinishSubTask = jest.fn()

			// Execute
			await taskHistory.deleteTaskWithId(taskId, mockGetCurrentCline, mockFinishSubTask)

			// Verify - should handle gracefully
			expect(console.log).toHaveBeenCalled()
		})

		test("handles shadow checkpoint deletion error", async () => {
			// Setup
			const taskId = "test-task-id"
			const taskDirPath = path.join("/test/storage/path", "tasks", taskId)
			jest.spyOn(taskHistory, "getTaskWithId").mockResolvedValue({ taskDirPath })
			jest.spyOn(taskHistory, "deleteTaskFromState").mockResolvedValue(undefined)

			// Mock ShadowCheckpointService to throw an error
			const mockError = new Error("Shadow deletion error")
			;(ShadowCheckpointService.deleteTask as jest.Mock).mockRejectedValue(mockError)

			const mockGetCurrentCline = jest.fn().mockReturnValue({ taskId: "different-task-id" })
			const mockFinishSubTask = jest.fn()

			// Execute
			await taskHistory.deleteTaskWithId(taskId, mockGetCurrentCline, mockFinishSubTask)

			// Verify - should continue and log error
			expect(console.error).toHaveBeenCalled()
			expect(fs.rm).toHaveBeenCalled() // Should still try to delete directory
		})
	})

	describe("deleteTaskFromState", () => {
		test("removes task from history list", async () => {
			// Setup
			const taskId = "test-task-id"
			const mockHistory = [
				{
					id: "other-task-id",
					task: "Other Task",
					number: 1,
					ts: 123456789,
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
				{
					id: taskId,
					task: "Test Task",
					number: 2,
					ts: 123456789,
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
			]
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve(mockHistory))

			// Execute
			await taskHistory.deleteTaskFromState(taskId)

			// Verify
			expect(mockContextProxy.setValue).toHaveBeenCalledWith("taskHistory", [
				{
					id: "other-task-id",
					task: "Other Task",
					number: 1,
					ts: 123456789,
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
			])
		})

		test("does nothing when task is not in history list", async () => {
			// Setup
			const taskId = "non-existent-id"
			const mockHistory = [
				{
					id: "other-task-id",
					task: "Other Task",
					number: 1,
					ts: 123456789,
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
			]
			mockContextProxy.getValue.mockImplementation(() => Promise.resolve(mockHistory))

			// Execute
			await taskHistory.deleteTaskFromState(taskId)

			// Verify
			expect(mockContextProxy.setValue).not.toHaveBeenCalled()
		})
	})
})
