// filepath: /Volumes/stuff/Projects/Thea-Code/src/core/webview/__tests__/TheaTaskStack.test.ts
/* eslint-disable @typescript-eslint/unbound-method */
import { TheaTaskStack } from "../thea/TheaTaskStack" // Renamed import and path
import { TheaTask } from "../../TheaTask" // Renamed import

// Mock dependencies
jest.mock("../../TheaTask") // Updated mock path

describe("TheaTaskStack", () => {
	let theaTaskStack: TheaTaskStack

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Create instance of TheaTaskStack
		theaTaskStack = new TheaTaskStack()

		// Mock console to prevent test output noise
		jest.spyOn(console, "log").mockImplementation(() => {})
		jest.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	test("addCline adds a TheaTask instance to the stack", async () => {
		// Setup
                const mockTheaTask = {
                        taskId: "test-task-id-1",
                        instanceId: "instance-1",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>

		// Execute
		await theaTaskStack.addTheaTask(mockTheaTask)

		// Verify
		expect(theaTaskStack.getSize()).toBe(1)
		expect(theaTaskStack.getCurrentTheaTask()).toBe(mockTheaTask)
	})

	test("addCline adds multiple instances correctly", async () => {
		// Setup
                const mockTheaTask1 = {
                        taskId: "test-task-id-1",
                        instanceId: "instance-1",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
                const mockTheaTask2 = {
                        taskId: "test-task-id-2",
                        instanceId: "instance-2",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>

		// Execute
		await theaTaskStack.addTheaTask(mockTheaTask1)
		await theaTaskStack.addTheaTask(mockTheaTask2)

		// Verify
		expect(theaTaskStack.getSize()).toBe(2)
		expect(theaTaskStack.getCurrentTheaTask()).toBe(mockTheaTask2)
		expect(theaTaskStack.getTaskStack()).toEqual(["test-task-id-1", "test-task-id-2"])
	})

	test("removeCurrentCline removes and aborts the top TheaTask instance", async () => {
		// Setup
                const mockTheaTask = {
                        taskId: "test-task-id",
                        instanceId: "instance-1",
                        abortTask: jest.fn().mockResolvedValue(undefined),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
		await theaTaskStack.addTheaTask(mockTheaTask)

		// Execute
		const removed = await theaTaskStack.removeCurrentTheaTask()

		// Verify
		expect(theaTaskStack.getSize()).toBe(0)
		expect(removed).toBe(mockTheaTask)
		expect(mockTheaTask.abortTask).toHaveBeenCalledWith(true)
	})

	test("removeCurrentCline returns undefined when stack is empty", async () => {
		// Execute
		const result = await theaTaskStack.removeCurrentTheaTask()

		// Verify
		expect(result).toBeUndefined()
	})

	test("removeCurrentCline handles abort errors gracefully", async () => {
		// Setup
                const mockTheaTask = {
                        taskId: "test-task-id",
                        instanceId: "instance-1",
                        abortTask: jest.fn().mockRejectedValue(new Error("Abort error")),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
		await theaTaskStack.addTheaTask(mockTheaTask)

		// Execute
		const removed = await theaTaskStack.removeCurrentTheaTask()

		// Verify
		expect(theaTaskStack.getSize()).toBe(0)
		expect(removed).toBe(mockTheaTask)
		expect(mockTheaTask.abortTask).toHaveBeenCalledWith(true)
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining("encountered error while aborting task"))
	})

	test("getCurrentCline returns the top instance", async () => {
		// Setup
                const mockTheaTask1 = {
                        taskId: "test-task-id-1",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
                const mockTheaTask2 = {
                        taskId: "test-task-id-2",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
		await theaTaskStack.addTheaTask(mockTheaTask1)
		await theaTaskStack.addTheaTask(mockTheaTask2)

		// Execute
		const current = theaTaskStack.getCurrentTheaTask()

		// Verify
		expect(current).toBe(mockTheaTask2)
	})

	test("getCurrentCline returns undefined when stack is empty", () => {
		// Execute
		const result = theaTaskStack.getCurrentTheaTask()

		// Verify
		expect(result).toBeUndefined()
	})

	test("getSize returns the number of instances in the stack", async () => {
		// Setup
                const mockTheaTask1 = {
                        taskId: "test-task-id-1",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
                const mockTheaTask2 = {
                        taskId: "test-task-id-2",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>

		// Execute & Verify - Empty stack
		expect(theaTaskStack.getSize()).toBe(0)

		// Add instances and verify
		await theaTaskStack.addTheaTask(mockTheaTask1)
		expect(theaTaskStack.getSize()).toBe(1)

		await theaTaskStack.addTheaTask(mockTheaTask2)
		expect(theaTaskStack.getSize()).toBe(2)

		await theaTaskStack.removeCurrentTheaTask()
		expect(theaTaskStack.getSize()).toBe(1)

		await theaTaskStack.removeCurrentTheaTask()
		expect(theaTaskStack.getSize()).toBe(0)
	})

	test("getTaskStack returns an array of task IDs", async () => {
		// Setup
                const mockTheaTask1 = {
                        taskId: "test-task-id-1",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
                const mockTheaTask2 = {
                        taskId: "test-task-id-2",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>
		await theaTaskStack.addTheaTask(mockTheaTask1)
		await theaTaskStack.addTheaTask(mockTheaTask2)

		// Execute
		const taskStack = theaTaskStack.getTaskStack()

		// Verify
		expect(taskStack).toEqual(["test-task-id-1", "test-task-id-2"])
	})

	test("finishSubTask removes current task and resumes parent task", async () => {
		// Setup
                const mockParentTheaTask = {
                        taskId: "parent-task-id",
                        abortTask: jest.fn(),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>

                const mockSubTaskTheaTask = {
                        taskId: "subtask-id",
                        abortTask: jest.fn().mockResolvedValue(undefined),
                        resumePausedTask: jest.fn(),
                } as unknown as jest.Mocked<TheaTask>

		await theaTaskStack.addTheaTask(mockParentTheaTask)
		await theaTaskStack.addTheaTask(mockSubTaskTheaTask)

		// Execute
		await theaTaskStack.finishSubTask("Task completed")

		// Verify
		expect(theaTaskStack.getSize()).toBe(1)
		expect(theaTaskStack.getCurrentTheaTask()).toBe(mockParentTheaTask)
		expect(mockParentTheaTask.resumePausedTask).toHaveBeenCalledWith("Task completed")
	})

	test("finishSubTask handles empty stack gracefully", async () => {
		// Execute
		await theaTaskStack.finishSubTask()

		// Verify - Should not throw errors
		expect(theaTaskStack.getSize()).toBe(0)
	})
})
