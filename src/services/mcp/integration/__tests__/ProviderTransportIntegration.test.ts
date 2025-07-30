/**
 * Integration tests for provider-transport interactions
 * Tests MockMcpProvider scenarios and provider interface compliance
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method */
import { MockMcpProvider } from "../../providers/MockMcpProvider"
import { ToolDefinition } from "../../types/McpProviderTypes"

describe("Provider-Transport Integration", () => {
	describe("MockMcpProvider Integration Scenarios", () => {
		let provider: MockMcpProvider

		beforeEach(() => {
			provider = new MockMcpProvider()
		})

		afterEach(async () => {
			if (provider && provider.isRunning()) {
				await provider.stop()
			}
			provider.removeAllListeners()
		})

		it("should start and provide connection info", async () => {
			const startedSpy = jest.fn()
			provider.on("started", startedSpy)

			await provider.start()

			expect(provider.isRunning()).toBe(true)
			expect(provider.getServerUrl()).toBeInstanceOf(URL)
			expect(startedSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					url: expect.stringContaining("http://localhost:"),
				}),
			)
		})

		it("should stop cleanly", async () => {
			const stoppedSpy = jest.fn()
			provider.on("stopped", stoppedSpy)

			await provider.start()
			await provider.stop()

			expect(provider.isRunning()).toBe(false)
			expect(stoppedSpy).toHaveBeenCalled()
		})

		it("should register and execute tools", async () => {
			const tool: ToolDefinition = {
				name: "integration_tool",
				description: "Test tool for integration",
				paramSchema: { type: "object", properties: { input: { type: "string" } } },
				handler: async (args) => ({
					content: [{ type: "text", text: `Integration result: ${args.input}` }],
					isError: false,
				}),
			}

			await provider.start()
			provider.registerToolDefinition(tool)

			const result = await provider.executeTool("integration_tool", { input: "test data" })

			expect(result).toEqual({
				content: [{ type: "text", text: "Integration result: test data" }],
				isError: false,
			})
		})

		it("should handle multiple tool registrations", async () => {
			const tools: ToolDefinition[] = [
				{
					name: "tool1",
					description: "First tool",
					handler: async () => ({ content: [{ type: "text", text: "Tool 1" }] }),
				},
				{
					name: "tool2",
					description: "Second tool",
					handler: async () => ({ content: [{ type: "text", text: "Tool 2" }] }),
				},
			]

			await provider.start()

			tools.forEach((tool) => provider.registerToolDefinition(tool))

			const result1 = await provider.executeTool("tool1", {})
			const result2 = await provider.executeTool("tool2", {})

			expect(result1.content[0]).toEqual({ type: "text", text: "Tool 1" })
			expect(result2.content[0]).toEqual({ type: "text", text: "Tool 2" })
		})

		it("should emit events for tool lifecycle", async () => {
			const registeredSpy = jest.fn()
			const unregisteredSpy = jest.fn()

			provider.on("tool-registered", registeredSpy)
			provider.on("tool-unregistered", unregisteredSpy)

			// Properly await the start operation
			await provider.start()

			const tool: ToolDefinition = {
				name: "event_tool",
				description: "Tool for event testing",
				handler: async () => ({ content: [] }),
			}

			provider.registerToolDefinition(tool)
			expect(registeredSpy).toHaveBeenCalledWith("event_tool")

			provider.unregisterTool("event_tool")
			expect(unregisteredSpy).toHaveBeenCalledWith("event_tool")
		})

		it("should handle concurrent tool executions", async () => {
			const tool: ToolDefinition = {
				name: "concurrent_tool",
				description: "Tool for concurrency testing",
				handler: async (args) => {
					// Simulate async work
					await new Promise((resolve) => setTimeout(resolve, 10))
					return {
						content: [{ type: "text", text: `Concurrent result: ${args.id}` }],
						isError: false,
					}
				},
			}

			await provider.start()
			provider.registerToolDefinition(tool)

			// Execute multiple tools concurrently
			const promises = Array.from({ length: 5 }, (_, i) => provider.executeTool("concurrent_tool", { id: i }))

			const results = await Promise.all(promises)

			results.forEach((result, index) => {
				expect(result.content[0].text).toBe(`Concurrent result: ${index}`)
				expect(result.isError).toBe(false)
			})
		})

		it("should maintain tool state across provider operations", async () => {
			const tool: ToolDefinition = {
				name: "persistent_tool",
				description: "Tool that persists",
				handler: async () => ({ content: [{ type: "text", text: "persistent" }] }),
			}

			// Register tool before starting
			provider.registerToolDefinition(tool)

			await provider.start()
			const result1 = await provider.executeTool("persistent_tool", {})

			await provider.stop()
			await provider.start()

			// Tool should still be available after restart
			const result2 = await provider.executeTool("persistent_tool", {})

			expect(result1).toEqual(result2)
			expect(result1.content[0]).toEqual({ type: "text", text: "persistent" })

			await provider.stop()
		})

		it("should handle provider error scenarios", async () => {
			const errorTool: ToolDefinition = {
				name: "error_tool",
				description: "Tool that fails",
				handler: async () => {
					throw new Error("Provider error test")
				},
			}

			await provider.start()
			provider.registerToolDefinition(errorTool)

			const result = await provider.executeTool("error_tool", {})

			expect(result.isError).toBe(true)
			expect(result.content[0].text).toContain("Provider error test")
		})

		it("should handle graceful shutdown with active tools", async () => {
			const longRunningTool: ToolDefinition = {
				name: "long_tool",
				description: "Long running tool",
				handler: async () => {
					await new Promise((resolve) => setTimeout(resolve, 50))
					return { content: [{ type: "text", text: "completed" }] }
				},
			}

			await provider.start()
			provider.registerToolDefinition(longRunningTool)

			// Start long-running operation
			const executionPromise = provider.executeTool("long_tool", {})

			// Stop provider while tool is running
			await provider.stop()

			// Tool should still complete
			const result = await executionPromise
			expect(result.content[0].text).toBe("completed")
		})
	})

	describe("Provider Interface Compliance", () => {
		let provider: MockMcpProvider

		beforeEach(() => {
			provider = new MockMcpProvider()
		})

		afterEach(() => {
			provider.removeAllListeners()
		})

		it("should implement all required IMcpProvider methods", () => {
			expect(typeof provider.start).toBe("function")
			expect(typeof provider.stop).toBe("function")
			expect(typeof provider.registerToolDefinition).toBe("function")
			expect(typeof provider.unregisterTool).toBe("function")
			expect(typeof provider.executeTool).toBe("function")
			expect(typeof provider.getServerUrl).toBe("function")
			expect(typeof provider.isRunning).toBe("function")
		})

		it("should extend EventEmitter for event handling", () => {
			expect(provider.on).toBeDefined()
			expect(provider.emit).toBeDefined()
			expect(provider.removeAllListeners).toBeDefined()
		})

		it("should return correct types from methods", async () => {
			await provider.start()

			const tool: ToolDefinition = {
				name: "type_test_tool",
				description: "Tool for type testing",
				handler: async () => ({ content: [{ type: "text", text: "test" }] }),
			}

			// Method return types
			expect(typeof provider.isRunning()).toBe("boolean")
			expect(provider.getServerUrl()).toBeInstanceOf(URL)

			provider.registerToolDefinition(tool)
			expect(typeof provider.unregisterTool("type_test_tool")).toBe("boolean")

			const result = await provider.executeTool("type_test_tool", {})
			expect(result).toHaveProperty("content")
			expect(Array.isArray(result.content)).toBe(true)
			expect(typeof result.isError).toBe("boolean")
		})
	})
})
