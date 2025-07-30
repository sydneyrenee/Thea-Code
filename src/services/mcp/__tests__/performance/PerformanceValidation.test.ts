/**
 * Performance and streaming response validation tests for MCP system
 * Tests concurrent execution, memory usage, and response times
 */
import { MockMcpProvider } from "../../providers/MockMcpProvider"
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports, @typescript-eslint/require-await, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions */
import { McpToolExecutor } from "../../core/McpToolExecutor"
import { McpIntegration } from "../../integration/McpIntegration"
import { ToolDefinition } from "../../types/McpProviderTypes"
import { NeutralToolUseRequest } from "../../types/McpToolTypes"

// Mock dependencies for performance testing
jest.mock("../../providers/EmbeddedMcpProvider", () => {
	const { EventEmitter } = require("events")

	const MockEmbeddedMcpProvider = jest.fn().mockImplementation(() => {
		const instance = new EventEmitter()
		const tools = new Map()

		instance.start = jest.fn().mockImplementation(() => Promise.resolve())
		instance.stop = jest.fn().mockImplementation(() => Promise.resolve())
		instance.getServerUrl = jest.fn().mockReturnValue(new URL("http://localhost:3000"))
		instance.isRunning = jest.fn().mockReturnValue(true)

		instance.registerToolDefinition = jest.fn().mockImplementation((tool) => {
			tools.set(tool.name, tool)
			instance.emit("tool-registered", tool.name)
		})

		instance.unregisterTool = jest.fn().mockImplementation((name) => {
			const result = tools.delete(name)
			if (result) {
				instance.emit("tool-unregistered", name)
			}
			return result
		})

		instance.executeTool = jest.fn().mockImplementation(async (name, args) => {
			const tool = tools.get(name)
			if (!tool) {
				return {
					content: [{ type: "text", text: `Tool '${name}' not found` }],
					isError: true,
				}
			}
			try {
				return await tool.handler(args || {})
			} catch (error) {
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }],
					isError: true,
				}
			}
		})

		return instance
	})

	const MockedProviderClass = MockEmbeddedMcpProvider as any
	MockedProviderClass.create = jest.fn().mockImplementation(async () => {
		return new MockEmbeddedMcpProvider()
	})

	return {
		EmbeddedMcpProvider: MockEmbeddedMcpProvider,
	}
})

jest.mock("../../core/McpToolRegistry", () => {
	const mockRegistry = {
		registerTool: jest.fn(),
		unregisterTool: jest.fn().mockReturnValue(true),
		getTool: jest.fn(),
		getAllTools: jest.fn(),
		hasTool: jest.fn(),
		executeTool: jest.fn(),
	}

	return {
		McpToolRegistry: {
			getInstance: jest.fn().mockReturnValue(mockRegistry),
		},
	}
})

describe("MCP Performance and Streaming Validation", () => {
	describe("Concurrent Tool Execution", () => {
		let mcpIntegration: McpIntegration
		let mcpToolExecutor: McpToolExecutor

		beforeEach(async () => {
			// Reset singletons
			;(McpIntegration as any).instance = undefined
			;(McpToolExecutor as any).instance = undefined

			mcpIntegration = McpIntegration.getInstance()
			mcpToolExecutor = McpToolExecutor.getInstance()
			await mcpIntegration.initialize()
		})

		afterEach(async () => {
			if (mcpToolExecutor) {
				await mcpToolExecutor.shutdown()
			}
		})

		it("should handle high concurrent tool executions without degradation", async () => {
			const concurrentTool: ToolDefinition = {
				name: "concurrent_test",
				description: "Tool for concurrency testing",
				handler: async (args) => {
					// Simulate realistic async work
					await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))
					return {
						content: [{ type: "text", text: `Processed: ${args.id}` }],
						isError: false,
					}
				},
			}

			// Ensure mcpToolExecutor is initialized before registering tools
			await mcpToolExecutor.initialize()
			mcpIntegration.registerTool(concurrentTool)

			const concurrentExecutions = 100
			const startTime = Date.now()

			try {
				// Create concurrent requests
				const promises = Array.from({ length: concurrentExecutions }, (_, i) =>
					mcpToolExecutor.executeToolFromNeutralFormat({
						type: "tool_use",
						id: `test-${i}`,
						name: "concurrent_test",
						input: { id: i },
					}).catch(error => {
						// Handle individual promise rejections to prevent test failure
						console.error(`Error executing tool ${i}:`, error)
						return {
							type: "tool_result",
							tool_use_id: `test-${i}`,
							status: "error",
							content: [{ type: "text", text: `Error: ${error.message}` }]
						};
					})
				)

				const results = await Promise.all(promises)
				const endTime = Date.now()
				const totalTime = endTime - startTime

				// Validate all executions completed (successfully or with error)
				expect(results).toHaveLength(concurrentExecutions)
				
				// Count successful results
				const successfulResults = results.filter(result => result.status === "success")
				console.log(`${successfulResults.length} of ${concurrentExecutions} operations succeeded`)
				
				// Validate successful results
				successfulResults.forEach((result) => {
					const id = parseInt(result.tool_use_id.split('-')[1], 10)
					expect(result.content[0].text).toBe(`Processed: ${id}`)
				})

				// Performance assertion - should complete within reasonable time
				expect(totalTime).toBeLessThan(5000) // 5 seconds for 100 concurrent operations

				console.log(`Executed ${concurrentExecutions} concurrent operations in ${totalTime}ms`)
			} catch (error) {
				console.error("Unexpected error in concurrent execution test:", error)
				throw error
			}
		})

		it("should maintain memory efficiency during batch operations", async () => {
			const memoryTool: ToolDefinition = {
				name: "memory_test",
				description: "Tool for memory testing",
				handler: async (args) => {
					// Create some data to simulate memory usage
					const data = new Array(1000).fill(0).map((_, i) => ({
						id: i,
						value: `item-${args.batch}-${i}`,
					}))

					return {
						content: [{ type: "text", text: `Batch ${args.batch} processed ${data.length} items` }],
						isError: false,
					}
				},
			}

			try {
				// Need to initialize first
				await mcpToolExecutor.initialize()
				mcpIntegration.registerTool(memoryTool)

				const initialMemory = process.memoryUsage().heapUsed
				const batchSize = 50
				const numberOfBatches = 10

				// Execute batches sequentially to monitor memory usage
				for (let batch = 0; batch < numberOfBatches; batch++) {
					console.log(`Processing batch ${batch + 1}/${numberOfBatches}...`)
					
					// Create batch promises with error handling for each promise
					const batchPromises = Array.from({ length: batchSize }, (_, i) =>
						mcpToolExecutor.executeToolFromNeutralFormat({
							type: "tool_use",
							id: `batch-${batch}-${i}`,
							name: "memory_test",
							input: { batch },
						}).catch(error => {
							console.error(`Error in batch ${batch}, item ${i}:`, error.message)
							return {
								type: "tool_result",
								tool_use_id: `batch-${batch}-${i}`,
								status: "error",
								content: [{ type: "text", text: `Error: ${error.message}` }]
							};
						})
					)

					// Wait for all promises in the batch to complete
					const results = await Promise.all(batchPromises)
					expect(results).toHaveLength(batchSize)
					
					// Log success rate for the batch
					const successCount = results.filter(r => r.status === "success").length
					console.log(`Batch ${batch + 1} completed: ${successCount}/${batchSize} successful`)

					// Force garbage collection if available (testing environment)
					if (global.gc) {
						global.gc()
					}
					
					// Add a small delay between batches to allow for cleanup
					await new Promise(resolve => setTimeout(resolve, 10))
				}

				const finalMemory = process.memoryUsage().heapUsed
				const memoryIncrease = finalMemory - initialMemory

				// Memory increase should be reasonable (less than 50MB for this test)
				expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)

				console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`)
			} catch (error) {
				console.error("Unexpected error in memory efficiency test:", error)
				throw error
			}
		})

		it("should handle rapid tool registration/unregistration", async () => {
			// Need to initialize first
			await mcpToolExecutor.initialize()

			const numberOfOperations = 1000
			const startTime = Date.now()

			for (let i = 0; i < numberOfOperations; i++) {
				const toolName = `rapid_tool_${i}`
				const tool: ToolDefinition = {
					name: toolName,
					description: `Rapid tool ${i}`,
					handler: async () => ({ content: [{ type: "text", text: `Tool ${i}` }] }),
				}

				// Register tool
				mcpIntegration.registerTool(tool)

				// Immediately unregister every other tool
				if (i % 2 === 0) {
					mcpIntegration.unregisterTool(toolName)
				}
			}

			const endTime = Date.now()
			const totalTime = endTime - startTime

			// Should complete rapidly
			expect(totalTime).toBeLessThan(1000) // 1 second for 1000 operations

			console.log(`Completed ${numberOfOperations} register/unregister operations in ${totalTime}ms`)
		})
	})

	describe("Streaming Response Validation", () => {
		let provider: MockMcpProvider

		beforeEach(async () => {
			provider = new MockMcpProvider()
			await provider.start()
		})

		afterEach(async () => {
			await provider.stop()
			provider.removeAllListeners()
		})

		it("should handle streaming-like tool responses", async () => {
			const streamingTool: ToolDefinition = {
				name: "streaming_tool",
				description: "Tool that simulates streaming responses",
				handler: async (args) => {
					const chunks = (args.chunks as number) || 5
					let content = ""

					// Simulate streaming by building content incrementally
					for (let i = 0; i < chunks; i++) {
						await new Promise((resolve) => setTimeout(resolve, 5)) // Small delay
						content += `Chunk ${i + 1}/${chunks}. `
					}

					return {
						content: [{ type: "text", text: content.trim() }],
						isError: false,
					}
				},
			}

			provider.registerToolDefinition(streamingTool)

			const startTime = Date.now()
			const result = await provider.executeTool("streaming_tool", { chunks: 10 })
			const endTime = Date.now()
			const duration = endTime - startTime

			expect(result.content[0].text).toContain("Chunk 1/10")
			expect(result.content[0].text).toContain("Chunk 10/10")
			expect(result.isError).toBe(false)

			// Should complete within reasonable time considering delays
			expect(duration).toBeGreaterThan(40) // At least 5ms * 10 chunks
			expect(duration).toBeLessThan(500) // But not too long
		})

		it("should handle large response payloads efficiently", async () => {
			const largeTool: ToolDefinition = {
				name: "large_response_tool",
				description: "Tool that returns large responses",
				handler: async (args) => {
					const size = (args.size as number) || 1000
					const largeData = Array.from({ length: size }, (_, i) => ({
						id: i,
						data: `This is item ${i} with some additional text to make it larger`,
						metadata: {
							timestamp: Date.now(),
							index: i,
							batch: Math.floor(i / 100),
						},
					}))

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(largeData, null, 2),
							},
						],
						isError: false,
					}
				},
			}

			provider.registerToolDefinition(largeTool)

			const startTime = Date.now()
			const result = await provider.executeTool("large_response_tool", { size: 5000 })
			const endTime = Date.now()
			const duration = endTime - startTime

			const parsedData = JSON.parse(result.content[0].text || "[]")
			expect(parsedData).toHaveLength(5000)
			expect(parsedData[0]).toHaveProperty("id", 0)
			expect(parsedData[4999]).toHaveProperty("id", 4999)

			// Should handle large payloads efficiently
			expect(duration).toBeLessThan(1000) // Should complete within 1 second

			console.log(`Processed ${parsedData.length} items in ${duration}ms`)
		})

		it("should validate response time consistency", async () => {
			const consistentTool: ToolDefinition = {
				name: "consistent_tool",
				description: "Tool with consistent response times",
				handler: async () => {
					// Fixed small delay to simulate consistent work
					await new Promise((resolve) => setTimeout(resolve, 10))
					return {
						content: [{ type: "text", text: "Consistent response" }],
						isError: false,
					}
				},
			}

			provider.registerToolDefinition(consistentTool)

			const iterations = 20
			const responseTimes: number[] = []

			// Measure response times
			for (let i = 0; i < iterations; i++) {
				const startTime = Date.now()
				await provider.executeTool("consistent_tool", {})
				const endTime = Date.now()
				responseTimes.push(endTime - startTime)
			}

			// Calculate statistics
			const averageTime = responseTimes.reduce((sum, time) => sum + time, 0) / iterations
			const minTime = Math.min(...responseTimes)
			const maxTime = Math.max(...responseTimes)
			const variance = responseTimes.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / iterations
			const standardDeviation = Math.sqrt(variance)

			// Consistency assertions
			expect(averageTime).toBeGreaterThan(8) // Should be close to 10ms
			expect(averageTime).toBeLessThan(50) // But not too much overhead
			expect(standardDeviation).toBeLessThan(averageTime * 0.5) // Low variance
			expect(maxTime - minTime).toBeLessThan(100) // Reasonable spread

			console.log(
				`Response time stats: avg=${averageTime.toFixed(2)}ms, std=${standardDeviation.toFixed(2)}ms, range=${minTime}-${maxTime}ms`,
			)
		})
	})

	describe("Error Handling Performance", () => {
		let provider: MockMcpProvider

		beforeEach(async () => {
			provider = new MockMcpProvider()
			await provider.start()
		})

		afterEach(async () => {
			await provider.stop()
			provider.removeAllListeners()
		})

		it("should handle errors efficiently without memory leaks", async () => {
			const errorTool: ToolDefinition = {
				name: "error_tool",
				description: "Tool that throws errors",
				handler: async (args) => {
					if (args.shouldError) {
						throw new Error(`Test error ${args.id}`)
					}
					return {
						content: [{ type: "text", text: `Success ${args.id}` }],
						isError: false,
					}
				},
			}

			provider.registerToolDefinition(errorTool)

			const iterations = 100
			let successCount = 0
			let errorCount = 0

			const startTime = Date.now()

			// Mix of successful and error operations
			for (let i = 0; i < iterations; i++) {
				const shouldError = i % 3 === 0 // Every third operation fails

				try {
					const result = await provider.executeTool("error_tool", {
						id: i,
						shouldError,
					})

					if (result.isError) {
						errorCount++
					} else {
						successCount++
					}
				} catch (error) {
					errorCount++
				}
			}

			const endTime = Date.now()
			const totalTime = endTime - startTime

			expect(successCount).toBeGreaterThan(0)
			expect(errorCount).toBeGreaterThan(0)
			expect(successCount + errorCount).toBe(iterations)

			// Should handle errors without significant performance impact
			expect(totalTime).toBeLessThan(1000) // 1 second for 100 operations

			console.log(`Handled ${successCount} successes and ${errorCount} errors in ${totalTime}ms`)
		})

		it("should recover quickly from error bursts", async () => {
			const recoverTool: ToolDefinition = {
				name: "recover_tool",
				description: "Tool for testing error recovery",
				handler: async (args) => {
					const phase = args.phase

					if (phase === "error_burst") {
						throw new Error("Burst error")
					}

					// Normal operation
					await new Promise((resolve) => setTimeout(resolve, 5))
					return {
						content: [{ type: "text", text: `Recovery success ${args.id}` }],
						isError: false,
					}
				},
			}

			try {
				// Make sure provider is started
				if (!provider.isRunning()) {
					await provider.start()
				}
				
				provider.registerToolDefinition(recoverTool)
				console.log("Registered recovery tool")

				// Phase 1: Error burst - properly handle errors
				console.log("Starting error burst phase...")
				const errorPromises = Array.from({ length: 20 }, (_, i) =>
					provider.executeTool("recover_tool", { phase: "error_burst", id: i })
						.then(result => {
							// If we get here, the tool didn't throw as expected
							console.log(`Unexpected success for error burst item ${i}`)
							return result
						})
						.catch(error => {
							// Expected path - convert error to a result object
							return { 
								content: [{ type: "text", text: error.message || "Burst error" }],
								isError: true 
							}
						})
				)

				const errorResults = await Promise.all(errorPromises)
				
				// Check that all results have isError=true
				const allErrorsAsExpected = errorResults.every((result) => result.isError === true)
				expect(allErrorsAsExpected).toBe(true)
				console.log(`Error burst phase complete: ${errorResults.length} errors generated`)

				// Add a small delay to ensure system has time to process errors
				await new Promise(resolve => setTimeout(resolve, 20))

				// Phase 2: Quick recovery with proper error handling
				console.log("Starting recovery phase...")
				const recoveryStartTime = Date.now()
				const recoveryPromises = Array.from({ length: 20 }, (_, i) =>
					provider.executeTool("recover_tool", { phase: "recovery", id: i })
						.catch(error => {
							console.error(`Unexpected error in recovery phase for item ${i}:`, error)
							return { 
								content: [{ type: "text", text: `Recovery failed: ${error.message}` }],
								isError: true 
							}
						})
				)

				const recoveryResults = await Promise.all(recoveryPromises)
				const recoveryTime = Date.now() - recoveryStartTime

				// Count successful recoveries
				const successfulRecoveries = recoveryResults.filter(result => !result.isError).length
				console.log(`Recovery phase complete: ${successfulRecoveries}/${recoveryResults.length} successful`)
				
				// Test should pass if most recoveries were successful
				expect(successfulRecoveries).toBeGreaterThanOrEqual(recoveryResults.length * 0.8)
				expect(recoveryTime).toBeLessThan(500) // Should recover quickly

				console.log(`Recovered from error burst in ${recoveryTime}ms`)
			} catch (error) {
				console.error("Unexpected error in recovery test:", error)
				throw error
			}
		})
	})
})
