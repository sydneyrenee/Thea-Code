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

 
describe("applyDiffTool", () => {
	type MockTheaTask = {
		cwd: string
		consecutiveMistakeCount: number
		consecutiveMistakeCountForApplyDiff: Map<string, number>
		webviewCommunicator: { 
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			ask: jest.MockedFunction<() => Promise<any>>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			say: jest.MockedFunction<() => Promise<any>>
		}
		diffViewProvider: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			open: jest.MockedFunction<() => any>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			update: jest.MockedFunction<() => any>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			scrollToFirstDiff: jest.MockedFunction<any>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			revertChanges: jest.MockedFunction<any>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			saveChanges: jest.MockedFunction<any>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			reset: jest.MockedFunction<any>
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		diffStrategy: { applyDiff: jest.MockedFunction<any>; getProgressStatus: jest.MockedFunction<any> }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		theaIgnoreController: { validateAccess: jest.MockedFunction<any> }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		sayAndCreateMissingParamError: jest.MockedFunction<any>
		didEditFile?: boolean
	}
	let mockTheaTask: MockTheaTask
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockAskApproval: jest.MockedFunction<any>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockHandleError: jest.MockedFunction<any>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockPushToolResult: jest.MockedFunction<any>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockRemoveClosingTag: jest.MockedFunction<any>
	const mockedFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		jest.clearAllMocks()
		mockTheaTask = {
			cwd: "/test",
			consecutiveMistakeCount: 0,
			consecutiveMistakeCountForApplyDiff: new Map(),
			webviewCommunicator: {
				// @ts-expect-error - Jest mock setup requires bypassing strict typing
				ask: jest.fn().mockResolvedValue(undefined),
				// @ts-expect-error - Jest mock setup requires bypassing strict typing
				say: jest.fn().mockResolvedValue(undefined),
			},
			diffViewProvider: {
				open: jest.fn(),
				update: jest.fn(),
				scrollToFirstDiff: jest.fn(),
				revertChanges: jest.fn(),
				// @ts-expect-error - Jest mock setup requires bypassing strict typing
				saveChanges: jest.fn().mockResolvedValue({ newProblemsMessage: "", userEdits: undefined, finalContent: "" }),
				reset: jest.fn(),
			},
			diffStrategy: {
				// @ts-expect-error - Jest mock setup requires bypassing strict typing
				applyDiff: jest.fn().mockResolvedValue({ success: true, content: "" }),
				getProgressStatus: jest.fn(),
			},
			theaIgnoreController: { validateAccess: jest.fn().mockReturnValue(true) },
			// @ts-expect-error - Jest mock setup requires bypassing strict typing
			sayAndCreateMissingParamError: jest.fn().mockResolvedValue("Missing parameter error"),
		} as MockTheaTask
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockAskApproval = jest.fn().mockResolvedValue(true)
		// @ts-expect-error - Jest mock setup requires bypassing strict typing
		mockHandleError = jest.fn().mockResolvedValue(undefined)
		mockPushToolResult = jest.fn()
		mockRemoveClosingTag = jest.fn().mockReturnValue("")
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
