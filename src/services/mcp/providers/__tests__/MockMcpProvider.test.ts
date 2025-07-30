/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import { MockMcpProvider } from "../MockMcpProvider"
import { ToolDefinition, ToolCallResult } from "../../types/McpProviderTypes"

describe("MockMcpProvider", () => {
	let mockProvider: MockMcpProvider

	beforeEach(() => {
		mockProvider = new MockMcpProvider()
	})

	afterEach(() => {
		// Clean up event listeners
		mockProvider.removeAllListeners()
	})

	describe("lifecycle", () => {
		it("should initialize as not started", () => {
			expect(mockProvider.isRunning()).toBe(false)
			expect(mockProvider.getServerUrl()).toBeUndefined()
		})

		it("should start successfully", async () => {
			const startedSpy = jest.fn()
			mockProvider.on("started", startedSpy)

			await mockProvider.start()

			expect(mockProvider.isRunning()).toBe(true)
			expect(mockProvider.getServerUrl()).toBeInstanceOf(URL)
			expect(startedSpy).toHaveBeenCalledWith({ url: mockProvider.getServerUrl()?.toString() })
		})

		it("should not start twice", async () => {
			const startedSpy = jest.fn()
			mockProvider.on("started", startedSpy)

			await mockProvider.start()
			await mockProvider.start()

			expect(startedSpy).toHaveBeenCalledTimes(1)
		})

		it("should stop successfully", async () => {
			const stoppedSpy = jest.fn()
			mockProvider.on("stopped", stoppedSpy)

			await mockProvider.start()
			await mockProvider.stop()

			expect(mockProvider.isRunning()).toBe(false)
			expect(mockProvider.getServerUrl()).toBeUndefined()
			expect(stoppedSpy).toHaveBeenCalled()
		})

		it("should not stop if not started", async () => {
			const stoppedSpy = jest.fn()
			mockProvider.on("stopped", stoppedSpy)

			await mockProvider.stop()

			expect(stoppedSpy).not.toHaveBeenCalled()
		})
	})

	describe("tool registration", () => {
		const sampleTool: ToolDefinition = {
			name: "test_tool",
			description: "A test tool",
			paramSchema: { type: "object" },
			handler: async () => ({
				content: [{ type: "text", text: "Test result" }],
				isError: false,
			}),
		}

		it("should register a tool", async () => {
			const registeredSpy = jest.fn()
			mockProvider.on("tool-registered", registeredSpy)

			await mockProvider.registerToolDefinition(sampleTool)

			expect(registeredSpy).toHaveBeenCalledWith("test_tool")
		})

		it("should unregister a tool", async () => {
			const unregisteredSpy = jest.fn()
			mockProvider.on("tool-unregistered", unregisteredSpy)

			await mockProvider.registerToolDefinition(sampleTool)
			const result = await mockProvider.unregisterTool("test_tool")

			expect(result).toBe(true)
			expect(unregisteredSpy).toHaveBeenCalledWith("test_tool")
		})

		it("should return false when unregistering non-existent tool", async () => {
			const unregisteredSpy = jest.fn()
			mockProvider.on("tool-unregistered", unregisteredSpy)

			const result = await mockProvider.unregisterTool("non_existent")

			expect(result).toBe(false)
			expect(unregisteredSpy).not.toHaveBeenCalled()
		})
	})

	describe("tool execution", () => {
		const successTool: ToolDefinition = {
			name: "success_tool",
			description: "A successful tool",
			paramSchema: { type: "object" },
			handler: async (args) => ({
				content: [{ type: "text", text: `Success with args: ${JSON.stringify(args)}` }],
				isError: false,
			}),
		}

		const errorTool: ToolDefinition = {
			name: "error_tool",
			description: "A tool that returns an error",
			paramSchema: { type: "object" },
			handler: async () => ({
				content: [{ type: "text", text: "Tool failed" }],
				isError: true,
			}),
		}

		const throwTool: ToolDefinition = {
			name: "throw_tool",
			description: "A tool that throws an exception",
			paramSchema: { type: "object" },
			handler: async () => {
				throw new Error("Tool execution failed")
			},
		}

		beforeEach(() => {
			mockProvider.registerToolDefinition(successTool)
			mockProvider.registerToolDefinition(errorTool)
			mockProvider.registerToolDefinition(throwTool)
		})

		it("should execute a tool successfully", async () => {
			const args = { param1: "value1" }
			const result = await mockProvider.executeTool("success_tool", args)

			expect(result).toEqual({
				content: [{ type: "text", text: 'Success with args: {"param1":"value1"}' }],
				isError: false,
			})
		})

		it("should handle tool returning error", async () => {
			const result = await mockProvider.executeTool("error_tool", {})

			expect(result).toEqual({
				content: [{ type: "text", text: "Tool failed" }],
				isError: true,
			})
		})

		it("should handle tool throwing exception", async () => {
			const result = await mockProvider.executeTool("throw_tool", {})

			expect(result).toEqual({
				content: [{ type: "text", text: "Error executing tool 'throw_tool': Tool execution failed" }],
				isError: true,
			})
		})

		it("should handle non-existent tool", async () => {
			const result = await mockProvider.executeTool("non_existent", {})

			expect(result).toEqual({
				content: [{ type: "text", text: "Tool 'non_existent' not found" }],
				isError: true,
			})
		})

		it("should handle null/undefined args", async () => {
			const result = await mockProvider.executeTool("success_tool", null as any)

			expect(result).toEqual({
				content: [{ type: "text", text: "Success with args: {}" }],
				isError: false,
			})
		})
	})
})
