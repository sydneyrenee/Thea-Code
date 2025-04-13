// filepath: /Volumes/stuff/Projects/Thea-Code/src/core/webview/__tests__/ClineStack.test.ts
import { ClineStack } from "../cline/ClineStack"
import { Cline } from "../../Cline"

// Mock dependencies
jest.mock("../../Cline")

describe("ClineStack", () => {
	let clineStack: ClineStack
	
	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Create instance of ClineStack
		clineStack = new ClineStack()

		// Mock console to prevent test output noise
		jest.spyOn(console, "log").mockImplementation(() => {})
		jest.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	test("addCline adds a Cline instance to the stack", async () => {
		// Setup
		const mockCline = {
			taskId: "test-task-id-1",
			instanceId: "instance-1",
		} as unknown as Cline

		// Execute
		await clineStack.addCline(mockCline)

		// Verify
		expect(clineStack.getSize()).toBe(1)
		expect(clineStack.getCurrentCline()).toBe(mockCline)
	})

	test("addCline adds multiple instances correctly", async () => {
		// Setup
		const mockCline1 = { taskId: "test-task-id-1", instanceId: "instance-1" } as unknown as Cline
		const mockCline2 = { taskId: "test-task-id-2", instanceId: "instance-2" } as unknown as Cline

		// Execute
		await clineStack.addCline(mockCline1)
		await clineStack.addCline(mockCline2)

		// Verify
		expect(clineStack.getSize()).toBe(2)
		expect(clineStack.getCurrentCline()).toBe(mockCline2)
		expect(clineStack.getTaskStack()).toEqual(["test-task-id-1", "test-task-id-2"])
	})

	test("removeCurrentCline removes and aborts the top Cline instance", async () => {
		// Setup
		const mockCline = {
			taskId: "test-task-id",
			instanceId: "instance-1",
			abortTask: jest.fn().mockResolvedValue(undefined),
		} as unknown as Cline
		await clineStack.addCline(mockCline)

		// Execute
		const removed = await clineStack.removeCurrentCline()

		// Verify
		expect(clineStack.getSize()).toBe(0)
		expect(removed).toBe(mockCline)
		expect(mockCline.abortTask).toHaveBeenCalledWith(true)
	})

	test("removeCurrentCline returns undefined when stack is empty", async () => {
		// Execute
		const result = await clineStack.removeCurrentCline()

		// Verify
		expect(result).toBeUndefined()
	})

	test("removeCurrentCline handles abort errors gracefully", async () => {
		// Setup
		const mockCline = {
			taskId: "test-task-id",
			instanceId: "instance-1",
			abortTask: jest.fn().mockRejectedValue(new Error("Abort error")),
		} as unknown as Cline
		await clineStack.addCline(mockCline)

		// Execute
		const removed = await clineStack.removeCurrentCline()

		// Verify
		expect(clineStack.getSize()).toBe(0)
		expect(removed).toBe(mockCline)
		expect(mockCline.abortTask).toHaveBeenCalledWith(true)
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining("encountered error while aborting task"))
	})

	test("getCurrentCline returns the top instance", async () => {
		// Setup
		const mockCline1 = { taskId: "test-task-id-1" } as unknown as Cline
		const mockCline2 = { taskId: "test-task-id-2" } as unknown as Cline
		await clineStack.addCline(mockCline1)
		await clineStack.addCline(mockCline2)

		// Execute
		const current = clineStack.getCurrentCline()

		// Verify
		expect(current).toBe(mockCline2)
	})

	test("getCurrentCline returns undefined when stack is empty", () => {
		// Execute
		const result = clineStack.getCurrentCline()

		// Verify
		expect(result).toBeUndefined()
	})

	test("getSize returns the number of instances in the stack", async () => {
		// Setup
		const mockCline1 = { taskId: "test-task-id-1" } as unknown as Cline
		const mockCline2 = { taskId: "test-task-id-2" } as unknown as Cline
		
		// Execute & Verify - Empty stack
		expect(clineStack.getSize()).toBe(0)
		
		// Add instances and verify
		await clineStack.addCline(mockCline1)
		expect(clineStack.getSize()).toBe(1)
		
		await clineStack.addCline(mockCline2)
		expect(clineStack.getSize()).toBe(2)
		
		await clineStack.removeCurrentCline()
		expect(clineStack.getSize()).toBe(1)
		
		await clineStack.removeCurrentCline()
		expect(clineStack.getSize()).toBe(0)
	})

	test("getTaskStack returns an array of task IDs", async () => {
		// Setup
		const mockCline1 = { taskId: "test-task-id-1" } as unknown as Cline
		const mockCline2 = { taskId: "test-task-id-2" } as unknown as Cline
		await clineStack.addCline(mockCline1)
		await clineStack.addCline(mockCline2)

		// Execute
		const taskStack = clineStack.getTaskStack()

		// Verify
		expect(taskStack).toEqual(["test-task-id-1", "test-task-id-2"])
	})

	test("finishSubTask removes current task and resumes parent task", async () => {
		// Setup
		const mockParentCline = {
			taskId: "parent-task-id",
			resumePausedTask: jest.fn(),
		} as unknown as Cline
		
		const mockSubTaskCline = {
			taskId: "subtask-id",
			abortTask: jest.fn().mockResolvedValue(undefined),
		} as unknown as Cline
		
		await clineStack.addCline(mockParentCline)
		await clineStack.addCline(mockSubTaskCline)

		// Execute
		await clineStack.finishSubTask("Task completed")

		// Verify
		expect(clineStack.getSize()).toBe(1)
		expect(clineStack.getCurrentCline()).toBe(mockParentCline)
		expect(mockParentCline.resumePausedTask).toHaveBeenCalledWith("Task completed")
	})

	test("finishSubTask handles empty stack gracefully", async () => {
		// Execute
		await clineStack.finishSubTask()

		// Verify - Should not throw errors
		expect(clineStack.getSize()).toBe(0)
	})
})