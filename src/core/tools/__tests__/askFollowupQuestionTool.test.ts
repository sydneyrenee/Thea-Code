// npx jest src/core/tools/__tests__/askFollowupQuestionTool.test.ts

import { describe, it, expect, jest, beforeEach } from "@jest/globals"
import { askFollowupQuestionTool } from "../askFollowupQuestionTool"
import { TheaTask } from "../../TheaTask"
import type { ToolUse } from "../../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../types"
import { formatResponse } from "../../prompts/responses"

jest.mock("../../prompts/responses")

describe("askFollowupQuestionTool", () => {
	type MockTheaTask = {
		consecutiveMistakeCount: number
		webviewCommunicator: { 
			ask: jest.Mock
			say: jest.Mock
		}
		sayAndCreateMissingParamError: jest.Mock
	}

	let mockTheaTask: MockTheaTask
	let mockAskApproval: jest.MockedFunction<AskApproval>
	let mockHandleError: jest.MockedFunction<HandleError>
	let mockPushToolResult: jest.MockedFunction<PushToolResult>
	let mockRemoveClosingTag: jest.MockedFunction<RemoveClosingTag>
	const mockedFormatResponse = formatResponse as jest.Mocked<typeof formatResponse>

	beforeEach(() => {
		jest.clearAllMocks()
		const mockAsk = jest.fn()
		const mockSay = jest.fn()
		const mockSayAndCreateMissingParamError = jest.fn()
		
		// Use type assertion to avoid jest inference issues
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockAsk as any).mockResolvedValue({ response: "yesButtonClicked", text: undefined, images: undefined })
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSay as any).mockResolvedValue(undefined)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSayAndCreateMissingParamError as any).mockResolvedValue("Missing param error")
		
		mockTheaTask = {
			consecutiveMistakeCount: 0,
			webviewCommunicator: {
				ask: mockAsk,
				say: mockSay,
			},
			sayAndCreateMissingParamError: mockSayAndCreateMissingParamError,
		}
		mockAskApproval = jest.fn<AskApproval>()
		mockHandleError = jest.fn<HandleError>().mockResolvedValue(undefined)
		mockPushToolResult = jest.fn<PushToolResult>()
		mockRemoveClosingTag = jest.fn<RemoveClosingTag>().mockImplementation((_tag: string, content?: string) => content ?? "")
	})

	it("handles partial blocks by sending a progress update", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: { question: "Test?" },
			partial: true,
		}

		await askFollowupQuestionTool(
			mockTheaTask as unknown as TheaTask,
			block,
			mockAskApproval as unknown as AskApproval,
			mockHandleError as unknown as HandleError,
			mockPushToolResult as unknown as PushToolResult,
			mockRemoveClosingTag as unknown as RemoveClosingTag,
		)

		expect(mockRemoveClosingTag).toHaveBeenCalledWith("question", "Test?")
		expect(mockTheaTask.webviewCommunicator.ask).toHaveBeenCalledWith("followup", "Test?", true)
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
			mockTheaTask as unknown as TheaTask,
			block,
			mockAskApproval as unknown as AskApproval,
			mockHandleError as unknown as HandleError,
			mockPushToolResult as unknown as PushToolResult,
			mockRemoveClosingTag as unknown as RemoveClosingTag,
		)

		expect(mockTheaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("ask_followup_question", "question")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing param error")
		expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
		expect(mockTheaTask.webviewCommunicator.ask).not.toHaveBeenCalled()
	})

	it("sends followup question and pushes tool result", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ask_followup_question",
			params: { question: "What?", follow_up: "<suggest><answer>Yes</answer></suggest>" },
			partial: false,
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockTheaTask.webviewCommunicator.ask as any).mockResolvedValue({ response: "messageResponse", text: "Sure", images: ["img"] })
		mockedFormatResponse.toolResult.mockReturnValue("tool result")

		await askFollowupQuestionTool(
			mockTheaTask as unknown as TheaTask,
			block,
			mockAskApproval as unknown as AskApproval,
			mockHandleError as unknown as HandleError,
			mockPushToolResult as unknown as PushToolResult,
			mockRemoveClosingTag as unknown as RemoveClosingTag,
		)

		expect(mockTheaTask.webviewCommunicator.ask).toHaveBeenCalledWith(
			"followup",
			JSON.stringify({ question: "What?", suggest: [{ answer: "Yes" }] }),
			false,
		)
		expect(mockTheaTask.webviewCommunicator.say).toHaveBeenCalledWith("user_feedback", "Sure", ["img"])
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
			mockTheaTask as unknown as TheaTask,
			block,
			mockAskApproval as unknown as AskApproval,
			mockHandleError as unknown as HandleError,
			mockPushToolResult as unknown as PushToolResult,
			mockRemoveClosingTag as unknown as RemoveClosingTag,
		)

		expect(mockTheaTask.webviewCommunicator.say).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("Failed to parse operations"),
		)
		expect(mockPushToolResult).toHaveBeenCalledWith("tool error")
		expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
	})
})
