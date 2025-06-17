// npx jest src/core/tools/__tests__/executeCommandTool.test.ts

import { describe, expect, it, jest, beforeEach } from "@jest/globals"
import { executeCommandTool } from "../executeCommandTool"
import { TheaTask } from "../../TheaTask" // Renamed import
import { ToolUse } from "../../assistant-message"
import { formatResponse } from "../../prompts/responses"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../types"

// Mock dependencies
jest.mock("../../TheaTask") // Renamed mock
jest.mock("../../prompts/responses")

describe("executeCommandTool", () => {
	// Setup common test variables
	let mockTheaTask: {
		consecutiveMistakeCount: number
		didRejectTool: boolean
		webviewCommunicator: { 
			say: jest.Mock
			ask: jest.Mock
		}
		taskStateManager: { getTokenUsage: jest.Mock }
		theaIgnoreController: { validateCommand: jest.Mock }
		sayAndCreateMissingParamError: jest.Mock
		executeCommandTool: jest.Mock
	}
	let mockAskApproval: jest.MockedFunction<AskApproval>
	let mockHandleError: jest.MockedFunction<HandleError>
	let mockPushToolResult: jest.MockedFunction<PushToolResult>
	let mockRemoveClosingTag: jest.MockedFunction<RemoveClosingTag>
	let mockToolUse: ToolUse

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Create simplified mocks focused on what we're testing
		const mockSay = jest.fn()
		const mockAsk = jest.fn()
		const mockGetTokenUsage = jest.fn()
		const mockValidateCommand = jest.fn()
		const mockSayAndCreateMissingParamError = jest.fn()
		const mockExecuteCommandTool = jest.fn()
		
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSay as any).mockResolvedValue(undefined)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockAsk as any).mockResolvedValue({ response: "yesButtonClicked" })
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockGetTokenUsage as any).mockReturnValue({ totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, contextTokens: 0 })
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockValidateCommand as any).mockReturnValue(null)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSayAndCreateMissingParamError as any).mockResolvedValue("Missing parameter error")
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockExecuteCommandTool as any).mockResolvedValue([false, "Command executed"])

		mockTheaTask = {
			consecutiveMistakeCount: 0,
			didRejectTool: false,
			webviewCommunicator: {
				say: mockSay,
				ask: mockAsk,
			},
			taskStateManager: { getTokenUsage: mockGetTokenUsage },
			theaIgnoreController: { validateCommand: mockValidateCommand },
			sayAndCreateMissingParamError: mockSayAndCreateMissingParamError,
			executeCommandTool: mockExecuteCommandTool,
		}

		mockAskApproval = jest.fn<AskApproval>().mockResolvedValue(true)
		mockHandleError = jest.fn<HandleError>().mockResolvedValue(undefined)
		mockPushToolResult = jest.fn<PushToolResult>()
		mockRemoveClosingTag = jest.fn<RemoveClosingTag>().mockReturnValue("command")

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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			;(mockAskApproval as any).mockResolvedValue(false)

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
