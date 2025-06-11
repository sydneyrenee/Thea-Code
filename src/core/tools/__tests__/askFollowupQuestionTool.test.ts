// npx jest src/core/tools/__tests__/askFollowupQuestionTool.test.ts

import { describe, it, expect, jest, beforeEach } from "@jest/globals"
import { askFollowupQuestionTool } from "../askFollowupQuestionTool"
import { TheaTask } from "../../TheaTask"
import type { ToolUse } from "../../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../types"
import { formatResponse } from "../../prompts/responses"

jest.mock("../../prompts/responses")

describe("askFollowupQuestionTool", () => {
    type MockTheaTask = jest.Mocked<Partial<TheaTask>> & {
        consecutiveMistakeCount: number
        webviewCommunicator: { ask: jest.Mock; say: jest.Mock }
        sayAndCreateMissingParamError: jest.Mock
    }
    
    let mockTheaTask: MockTheaTask
    let mockAskApproval: jest.Mock
    let mockHandleError: jest.Mock
    let mockPushToolResult: jest.Mock
    let mockRemoveClosingTag: jest.Mock
    const mockedFormatResponse = formatResponse as jest.Mocked<typeof formatResponse>

    beforeEach(() => {
        jest.clearAllMocks()
        mockTheaTask = {
            consecutiveMistakeCount: 0,
            webviewCommunicator: {
                ask: jest.fn().mockResolvedValue({}),
                say: jest.fn().mockResolvedValue(undefined),
            },
            sayAndCreateMissingParamError: jest.fn().mockResolvedValue("Missing param error"),
        } as MockTheaTask
        mockAskApproval = jest.fn()
        mockHandleError = jest.fn().mockResolvedValue(undefined)
        mockPushToolResult = jest.fn()
        mockRemoveClosingTag = jest.fn((_tag: string, content?: string) => content ?? "")
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
        expect(mockTheaTask.webviewCommunicator.ask).toHaveBeenCalledWith(
            "followup",
            "Test?",
            true,
        )
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

        expect(mockTheaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith(
            "ask_followup_question",
            "question",
        )
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
        mockTheaTask.webviewCommunicator.ask.mockResolvedValue({ text: "Sure", images: ["img"] })
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
        expect(mockTheaTask.webviewCommunicator.say).toHaveBeenCalledWith(
            "user_feedback",
            "Sure",
            ["img"],
        )
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

