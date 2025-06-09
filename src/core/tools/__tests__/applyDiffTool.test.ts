// npx jest src/core/tools/__tests__/applyDiffTool.test.ts

import { describe, it, expect, jest, beforeEach } from "@jest/globals"
import { applyDiffTool } from "../applyDiffTool"
import { TheaTask } from "../../TheaTask"
import type { ToolUse } from "../../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../types"
import { fileExistsAtPath } from "../../../utils/fs"
import fs from "fs/promises"

jest.mock("fs/promises")
jest.mock("../../../utils/fs")

// We don't mock TheaTask module because we only need a partial object

describe("applyDiffTool", () => {
    type MockTheaTask = jest.Mocked<Partial<TheaTask>> & {
        consecutiveMistakeCount: number
        consecutiveMistakeCountForApplyDiff: Map<string, number>
        webviewCommunicator: { ask: jest.Mock; say: jest.Mock }
        diffViewProvider: {
            open: jest.Mock
            update: jest.Mock
            scrollToFirstDiff: jest.Mock
            revertChanges: jest.Mock
            saveChanges: jest.Mock
            reset: jest.Mock
        }
        diffStrategy: { applyDiff: jest.Mock; getProgressStatus: jest.Mock }
        theaIgnoreController: { validateAccess: jest.Mock }
        sayAndCreateMissingParamError: jest.Mock
        cwd: string
        didEditFile?: boolean
    }
    let mockTheaTask: MockTheaTask
    let mockAskApproval: jest.Mock
    let mockHandleError: jest.Mock
    let mockPushToolResult: jest.Mock
    let mockRemoveClosingTag: jest.Mock
    const mockedFs = fs as jest.Mocked<typeof fs>

    beforeEach(() => {
        jest.clearAllMocks()
        mockTheaTask = {
            cwd: "/test",
            consecutiveMistakeCount: 0,
            consecutiveMistakeCountForApplyDiff: new Map(),
            webviewCommunicator: { ask: jest.fn().mockResolvedValue(undefined), say: jest.fn().mockResolvedValue(undefined) },
            diffViewProvider: {
                open: jest.fn(),
                update: jest.fn(),
                scrollToFirstDiff: jest.fn(),
                revertChanges: jest.fn(),
                saveChanges: jest.fn().mockResolvedValue({ newProblemsMessage: "", userEdits: undefined, finalContent: "" }),
                reset: jest.fn(),
            },
            diffStrategy: { applyDiff: jest.fn().mockResolvedValue({ success: true, content: "" }), getProgressStatus: jest.fn() },
            theaIgnoreController: { validateAccess: jest.fn().mockReturnValue(true) },
            sayAndCreateMissingParamError: jest.fn().mockResolvedValue("Missing parameter error"),
        } as MockTheaTask
        mockAskApproval = jest.fn().mockResolvedValue(true)
        mockHandleError = jest.fn().mockResolvedValue(undefined)
        mockPushToolResult = jest.fn()
        mockRemoveClosingTag = jest.fn((tag: string, content?: string) => content ?? "")
    })

    it("handles partial blocks by sending a progress update", async () => {
        const block: ToolUse = { type: "tool_use", name: "apply_diff", params: { path: "file.txt", diff: "d" }, partial: true }

        await applyDiffTool(
            mockTheaTask as unknown as TheaTask,
            block,
            mockAskApproval as unknown as AskApproval,
            mockHandleError as unknown as HandleError,
            mockPushToolResult as unknown as PushToolResult,
            mockRemoveClosingTag as unknown as RemoveClosingTag,
        )

        expect(mockTheaTask.webviewCommunicator.ask).toHaveBeenCalled()
        expect(mockAskApproval).not.toHaveBeenCalled()
        expect(mockTheaTask.diffViewProvider.open).not.toHaveBeenCalled()
    })

    it("handles missing path parameter", async () => {
        const block: ToolUse = { type: "tool_use", name: "apply_diff", params: { diff: "d" }, partial: false }

        await applyDiffTool(
            mockTheaTask as unknown as TheaTask,
            block,
            mockAskApproval as unknown as AskApproval,
            mockHandleError as unknown as HandleError,
            mockPushToolResult as unknown as PushToolResult,
            mockRemoveClosingTag as unknown as RemoveClosingTag,
        )

        expect(mockTheaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("apply_diff", "path")
        expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
        expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
        expect(mockAskApproval).not.toHaveBeenCalled()
    })

    it("handles non-existent files", async () => {
        ;(fileExistsAtPath as jest.Mock).mockResolvedValue(false)
        const block: ToolUse = { type: "tool_use", name: "apply_diff", params: { path: "file.txt", diff: "d" }, partial: false }

        await applyDiffTool(
            mockTheaTask as unknown as TheaTask,
            block,
            mockAskApproval as unknown as AskApproval,
            mockHandleError as unknown as HandleError,
            mockPushToolResult as unknown as PushToolResult,
            mockRemoveClosingTag as unknown as RemoveClosingTag,
        )

        expect(fileExistsAtPath).toHaveBeenCalled()
        expect(mockTheaTask.webviewCommunicator.say).toHaveBeenCalled()
        expect(mockPushToolResult).toHaveBeenCalled()
        expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
        // ensure no attempt to read file or apply diff
        expect(mockedFs.readFile).not.toHaveBeenCalled()
        expect(mockTheaTask.diffStrategy.applyDiff).not.toHaveBeenCalled()
    })
})
