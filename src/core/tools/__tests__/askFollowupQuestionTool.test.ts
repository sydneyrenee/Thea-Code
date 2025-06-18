// npx jest src/core/tools/__tests__/askFollowupQuestionTool.test.ts

import { describe, it, expect, jest, beforeEach } from "@jest/globals"
import { askFollowupQuestionTool } from "../askFollowupQuestionTool"
import type { TheaTask } from "../../TheaTask"
import type { ToolUse } from "../../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../types"
import { formatResponse } from "../../prompts/responses"
import type { TheaAskResponse } from "../../../shared/WebviewMessage"

jest.mock("../../prompts/responses")

describe("askFollowupQuestionTool", () => {
	let mockAsk: jest.Mock
	let mockSay: jest.Mock
	let mockSayAndCreateMissingParamError: jest.Mock
	let mockTheaTask: TheaTask
	let mockAskApproval: AskApproval
	let mockHandleError: HandleError
	let mockPushToolResult: PushToolResult
	let mockRemoveClosingTag: RemoveClosingTag
	const mockedFormatResponse = formatResponse as jest.Mocked<typeof formatResponse>

	beforeEach(() => {
		jest.clearAllMocks()
		
		// Create mock functions
		mockAsk = jest.fn()
		mockSay = jest.fn()
		mockSayAndCreateMissingParamError = jest.fn()
		
		// Create mock TheaTask with proper type casting
		mockTheaTask = {
			consecutiveMistakeCount: 0,
			webviewCommunicator: {
				ask: mockAsk,
				say: mockSay,
			},
			sayAndCreateMissingParamError: mockSayAndCreateMissingParamError,
		} as unknown as TheaTask

		// Set up mock return values - Jest mocks have complex typing
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockAsk.mockResolvedValue({ 
			response: "yesButtonClicked" as TheaAskResponse, 
			text: "", 
			images: [] 
		})
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockSay.mockResolvedValue(undefined)
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockSayAndCreateMissingParamError.mockResolvedValue("Missing param error")
		
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockAskApproval = jest.fn().mockResolvedValue(true)
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockHandleError = jest.fn().mockResolvedValue(undefined)
		mockPushToolResult = jest.fn() as PushToolResult
		mockRemoveClosingTag = jest.fn((tag: string, content?: string) => content ?? "") as RemoveClosingTag
	})

	it("handles partial blocks by sending a progress update", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: { question: "Test?" },
			partial: true,
		}

		await askFollowupQuestionTool(
			mockTheaTask,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockRemoveClosingTag).toHaveBeenCalledWith("question", "Test?")
		expect(mockAsk).toHaveBeenCalledWith("followup", "Test?", true)
		expect(mockPushToolResult).not.toHaveBeenCalled()
	})

	it("handles missing question parameter", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: {},
			partial: false,
		}

		await askFollowupQuestionTool(
			mockTheaTask,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockSayAndCreateMissingParamError).toHaveBeenCalledWith("ask_followup_question", "question")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing param error")
		expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
		expect(mockAsk).not.toHaveBeenCalled()
	})

	it("sends followup question and pushes tool result", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: { question: "What?", follow_up: "<suggest><answer>Yes</answer></suggest>" },
			partial: false,
		}
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockAsk.mockResolvedValue({ 
			response: "messageResponse" as TheaAskResponse,
			text: "Sure", 
			images: ["img"] 
		})
		mockedFormatResponse.toolResult.mockReturnValue("tool result")

		await askFollowupQuestionTool(
			mockTheaTask,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAsk).toHaveBeenCalledWith(
			"followup",
			JSON.stringify({ question: "What?", suggest: ["<answer>Yes</answer>"] }),
			false,
		)
		expect(mockSay).toHaveBeenCalledWith("user_feedback", "Sure", ["img"])
		expect(mockPushToolResult).toHaveBeenCalledWith("tool result")
		expect(mockTheaTask.consecutiveMistakeCount).toBe(0)
	})

	it("handles invalid follow_up XML", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: { question: "Q", follow_up: "<invalid" },
			partial: false,
		}
		mockedFormatResponse.toolError.mockReturnValue("tool error")

		await askFollowupQuestionTool(
			mockTheaTask,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockSay).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("Failed to parse operations"),
		)
		expect(mockPushToolResult).toHaveBeenCalledWith("tool error")
		expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
	})
})
