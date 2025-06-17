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
		webviewCommunicator: { 
			ask: jest.Mock
			say: jest.Mock
		}
		diffViewProvider: {
			open: jest.Mock
			update: jest.Mock
			scrollToFirstDiff: jest.Mock
			revertChanges: jest.Mock
			saveChanges: jest.Mock
			reset: jest.Mock
		}
		diffStrategy: { 
			applyDiff: jest.Mock
			getProgressStatus: jest.Mock
		}
		theaIgnoreController: { validateAccess: jest.Mock }
		sayAndCreateMissingParamError: jest.Mock
		cwd: string
		didEditFile?: boolean
	}
	let mockTheaTask: MockTheaTask
	let mockAskApproval: jest.MockedFunction<AskApproval>
	let mockHandleError: jest.MockedFunction<HandleError>
	let mockPushToolResult: jest.MockedFunction<PushToolResult>
	let mockRemoveClosingTag: jest.MockedFunction<RemoveClosingTag>
	const mockedFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		jest.clearAllMocks()
		
		const mockAsk = jest.fn()
		const mockSay = jest.fn()
		const mockOpen = jest.fn()
		const mockUpdate = jest.fn()
		const mockScrollToFirstDiff = jest.fn()
		const mockRevertChanges = jest.fn()
		const mockSaveChanges = jest.fn()
		const mockReset = jest.fn()
		const mockApplyDiff = jest.fn()
		const mockGetProgressStatus = jest.fn()
		const mockValidateAccess = jest.fn()
		const mockSayAndCreateMissingParamError = jest.fn()
		
		// Use type assertion to avoid jest inference issues
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockAsk as any).mockResolvedValue(undefined)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSay as any).mockResolvedValue(undefined)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSaveChanges as any).mockResolvedValue({ newProblemsMessage: "", userEdits: undefined, finalContent: "" })
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockApplyDiff as any).mockResolvedValue({ success: true, content: "" })
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockValidateAccess as any).mockReturnValue(true)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(mockSayAndCreateMissingParamError as any).mockResolvedValue("Missing parameter error")
		
		mockTheaTask = {
			cwd: "/test",
			consecutiveMistakeCount: 0,
			consecutiveMistakeCountForApplyDiff: new Map(),
			webviewCommunicator: {
				ask: mockAsk,
				say: mockSay,
			},
			diffViewProvider: {
				open: mockOpen,
				update: mockUpdate,
				scrollToFirstDiff: mockScrollToFirstDiff,
				revertChanges: mockRevertChanges,
				saveChanges: mockSaveChanges,
				reset: mockReset,
			},
			diffStrategy: {
				applyDiff: mockApplyDiff,
				getProgressStatus: mockGetProgressStatus,
			},
			theaIgnoreController: { validateAccess: mockValidateAccess },
			sayAndCreateMissingParamError: mockSayAndCreateMissingParamError,
		} as MockTheaTask
		mockAskApproval = jest.fn<AskApproval>().mockResolvedValue(true)
		mockHandleError = jest.fn<HandleError>().mockResolvedValue(undefined)
		mockPushToolResult = jest.fn<PushToolResult>()
		mockRemoveClosingTag = jest.fn<RemoveClosingTag>().mockImplementation((tag: string, content?: string) => content ?? "")
	})

	it("handles partial blocks by sending a progress update", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "apply_diff",
			params: { path: "file.txt", diff: "d" },
			partial: true,
		}

		await applyDiffTool(
			mockTheaTask as unknown as TheaTask,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
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
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockTheaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("apply_diff", "path")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		expect(mockTheaTask.consecutiveMistakeCount).toBe(1)
		expect(mockAskApproval).not.toHaveBeenCalled()
	})

	it("handles non-existent files", async () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		;(fileExistsAtPath as any).mockResolvedValue(false)
		const block: ToolUse = {
			type: "tool_use",
			name: "apply_diff",
			params: { path: "file.txt", diff: "d" },
			partial: false,
		}

		await applyDiffTool(
			mockTheaTask as unknown as TheaTask,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
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
