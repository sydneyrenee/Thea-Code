// npx jest src/core/tools/__tests__/executeCommandTool.test.ts

import { describe, expect, it, jest, beforeEach } from "@jest/globals"
import { executeCommandTool } from "../executeCommandTool"
import { TheaTask } from "../../TheaTask" // Renamed import
import type { TheaIgnoreController } from "../../ignore/TheaIgnoreController"
import type { TaskWebviewCommunicator } from "../../TaskWebviewCommunicator"
import type { TaskStateManager } from "../../TaskStateManager"
jest.mock("../../ignore/TheaIgnoreController")
import { TheaProvider } from "../../webview/TheaProvider"
import type { TheaMessage } from "../../../shared/ExtensionMessage"
import { ToolUse } from "../../assistant-message"
import { formatResponse } from "../../prompts/responses"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../types"
import { TheaAskResponse } from "../../../shared/WebviewMessage" // Import response type

// Mock dependencies
jest.mock("../../TheaTask") // Renamed mock
jest.mock("../../prompts/responses")
jest.mock("../../ignore/TheaIgnoreController")

describe("executeCommandTool", () => {
	// Setup common test variables
	let mockTheaTask: Partial<TheaTask> & {
		consecutiveMistakeCount: number
		didRejectTool: boolean
		webviewCommunicator: Partial<TaskWebviewCommunicator> & { say: jest.Mock }
		taskStateManager: Partial<TaskStateManager> & { getTokenUsage: jest.Mock }
		theaIgnoreController: Partial<TheaIgnoreController>
		ask: jest.Mock
		say: jest.Mock
		sayAndCreateMissingParamError: jest.Mock
		executeCommandTool: jest.Mock
	}
	let mockAskApproval: jest.Mock
	let mockHandleError: jest.Mock
	let mockPushToolResult: jest.Mock
	let mockRemoveClosingTag: jest.Mock
	let mockToolUse: ToolUse

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Create mock implementations with eslint directives to handle the type issues
		mockTheaTask = ({
			ask: jest.fn().mockResolvedValue(undefined as never),
			say: jest.fn().mockResolvedValue(undefined as never),
			sayAndCreateMissingParamError: jest.fn().mockResolvedValue("Missing parameter error" as never),
			executeCommandTool: jest.fn().mockResolvedValue([false, "Command executed"] as never),
			consecutiveMistakeCount: 0,
			didRejectTool: false,
			theaIgnoreController: { 
				validateCommand: jest.fn<(command: string) => string | undefined>().mockReturnValue(undefined),
				validateAccess: jest.fn<(filePath: string) => boolean>().mockReturnValue(true),
				filterPaths: jest.fn<(paths: string[]) => string[]>().mockImplementation((paths) => paths),
				getInstructions: jest.fn<() => string | undefined>().mockReturnValue(undefined)
			} as Partial<TheaIgnoreController>,
			webviewCommunicator: {
				// minimal TaskWebviewCommunicator shape used by code
				saveMessages: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				isTaskAborted: jest.fn<() => boolean>().mockReturnValue(false),
				taskId: "test-task-id",
				instanceId: "test-instance-id",
				onAskResponded: jest.fn(),
				handleWebviewAskResponse: jest.fn().mockResolvedValue(undefined as never),
				say: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				ask: jest
					.fn<() => Promise<{ response: TheaAskResponse; text?: string; images?: string[] }>>()
					.mockResolvedValue({ response: "yesButtonClicked" }),
				providerRef: new WeakRef({} as unknown as TheaProvider),
				getMessages: jest.fn<() => TheaMessage[]>().mockReturnValue([]),
				addMessage: jest.fn<(m: TheaMessage) => Promise<void>>().mockResolvedValue(undefined),
				updateMessageUi: jest.fn<(m: TheaMessage) => Promise<void>>().mockResolvedValue(undefined),
				// optional UI helpers are not required here
			} as Partial<TaskWebviewCommunicator> & { say: jest.Mock },
			taskStateManager: {
				// Add state manager mock setup
				getTokenUsage: jest
					.fn<
						() => {
							totalTokensIn: number
							totalTokensOut: number
							totalCost: number
							contextTokens: number
						}
					>()
					.mockReturnValue({ totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, contextTokens: 0 }),
				providerRef: new WeakRef({} as unknown as TheaProvider),
				taskId: "test",
				taskNumber: 1,
				apiConversationHistory: [],
				setTaskState: jest.fn(),
				updateLatestUiMessage: jest.fn(),
				markTaskComplete: jest.fn(),
				updateTokenUsage: jest.fn(),
			} as Partial<TaskStateManager> & { getTokenUsage: jest.Mock },
		} as unknown) as Partial<TheaTask> & {
			consecutiveMistakeCount: number
			didRejectTool: boolean
			webviewCommunicator: Partial<TaskWebviewCommunicator> & { say: jest.Mock }
			taskStateManager: Partial<TaskStateManager> & { getTokenUsage: jest.Mock }
			theaIgnoreController: Partial<TheaIgnoreController>
			ask: jest.Mock
			say: jest.Mock
			sayAndCreateMissingParamError: jest.Mock
			executeCommandTool: jest.Mock
		}

		// @ts-expect-error - Jest mock function type issues
		mockAskApproval = jest.fn().mockResolvedValue(true)
		// @ts-expect-error - Jest mock function type issues
		mockHandleError = jest.fn().mockResolvedValue(undefined)
		mockPushToolResult = jest.fn()
		mockRemoveClosingTag = jest.fn().mockReturnValue("command")

		// Create a mock tool use object
		mockToolUse = {
			type: "tool_use",
			name: "execute_command",
			params: {
				command: "echo test",
			},
			partial: false,
		}
	})

	/**
	 * Tests for HTML entity unescaping in commands
	 * This verifies that HTML entities are properly converted to their actual characters
	 * before the command is executed
	 */
	describe("HTML entity unescaping", () => {
		it("should unescape &lt; to < character in commands", async () => {
			// Setup
			mockToolUse.params.command = "echo &lt;test&gt;"

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo <test>")
			expect(mockTheaTask.executeCommandTool).toHaveBeenCalledWith("echo <test>", undefined)
		})

		it("should unescape &gt; to > character in commands", async () => {
			// Setup
			mockToolUse.params.command = "echo test &gt; output.txt"

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo test > output.txt")
			expect(mockTheaTask.executeCommandTool).toHaveBeenCalledWith("echo test > output.txt", undefined)
		})

		it("should unescape &amp; to & character in commands", async () => {
			// Setup
			mockToolUse.params.command = "echo foo &amp;&amp; echo bar"

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo foo && echo bar")
			expect(mockTheaTask.executeCommandTool).toHaveBeenCalledWith("echo foo && echo bar", undefined)
		})

		it("should handle multiple mixed HTML entities in commands", async () => {
			// Setup
			mockToolUse.params.command = "grep -E 'pattern' &lt;file.txt &gt;output.txt 2&gt;&amp;1"

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			const expectedCommand = "grep -E 'pattern' <file.txt >output.txt 2>&1"
			expect(mockAskApproval).toHaveBeenCalledWith("command", expectedCommand)
			expect(mockTheaTask.executeCommandTool).toHaveBeenCalledWith(expectedCommand, undefined)
		})
	})

	// Other functionality tests
	describe("Basic functionality", () => {
		it("should execute a command normally without HTML entities", async () => {
			// Setup
			mockToolUse.params.command = "echo test"

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo test")
			expect(mockTheaTask.executeCommandTool).toHaveBeenCalledWith("echo test", undefined)
			expect(mockPushToolResult).toHaveBeenCalledWith("Command executed")
		})

		it("should pass along custom working directory if provided", async () => {
			// Setup
			mockToolUse.params.command = "echo test"
			mockToolUse.params.cwd = "/custom/path"

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockTheaTask.executeCommandTool).toHaveBeenCalledWith("echo test", "/custom/path")
		})
	})

	describe("Error handling", () => {
		it("should handle missing command parameter", async () => {
			// Setup
			mockToolUse.params.command = undefined

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
			expect(mockTheaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("execute_command", "command")
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
			expect(mockAskApproval).not.toHaveBeenCalled()
			expect(mockTheaTask.executeCommandTool).not.toHaveBeenCalled()
		})

		it("should handle command rejection", async () => {
			// Setup
			mockToolUse.params.command = "echo test"
			// @ts-expect-error - Jest mock function type issues
			mockAskApproval.mockResolvedValue(false)

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(mockAskApproval).toHaveBeenCalledWith("command", "echo test")
			expect(mockTheaTask.executeCommandTool).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalled()
		})

		it("should handle theaignore validation failures", async () => {
			// Setup
			mockToolUse.params.command = "cat .env"
			// Override the validateCommand mock to return a filename
			const validateCommandMock = jest.fn().mockReturnValue(".env")
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			mockTheaTask.theaIgnoreController = {
				validateCommand: validateCommandMock, // Simplified mock
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any // Use 'as any' to bypass strict type check for mock

			const mockTheaIgnoreError = "TheaIgnore error"
			;(formatResponse.theaIgnoreError as jest.Mock).mockReturnValue(mockTheaIgnoreError)
			;(formatResponse.toolError as jest.Mock).mockReturnValue("Tool error")

			// Execute
			await executeCommandTool(
				mockTheaTask as unknown as TheaTask,
				mockToolUse,
				mockAskApproval as unknown as AskApproval,
				mockHandleError as unknown as HandleError,
				mockPushToolResult as unknown as PushToolResult,
				mockRemoveClosingTag as unknown as RemoveClosingTag,
			)

			// Verify
			expect(validateCommandMock).toHaveBeenCalledWith("cat .env")
			// Add check to ensure communicator exists
			expect(mockTheaTask.webviewCommunicator).toBeDefined()
			expect(mockTheaTask.webviewCommunicator.say).toHaveBeenCalledWith("theaignore_error", ".env")
			expect(formatResponse.theaIgnoreError).toHaveBeenCalledWith(".env")
			expect(formatResponse.toolError).toHaveBeenCalledWith(mockTheaIgnoreError)
			expect(mockPushToolResult).toHaveBeenCalled()
			expect(mockAskApproval).not.toHaveBeenCalled()
			expect(mockTheaTask.executeCommandTool).not.toHaveBeenCalled()
		})
	})
})
