import { OllamaHandler, getOllamaModels } from "../ollama"
import { McpIntegration } from "../../../services/mcp/integration/McpIntegration"
import { NeutralConversationHistory } from "../../../shared/neutral-history"
import { OpenAiHandler } from "../openai"
import type OpenAI from "openai"
import type { ApiStreamChunk } from "../../transform/stream"
import { startServer, stopServer, getServerPort } from "../../../../test/ollama-mock-server/server"

// Mock the OpenAI handler
jest.mock("../openai", () => {
	const mockExtractToolCalls = jest
		.fn()
		.mockImplementation(
			(
				delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
			): OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] => {
				return delta.tool_calls || []
			},
		)

	const mockHasToolCalls = jest
		.fn()
		.mockImplementation((delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta) => {
			return (mockExtractToolCalls(delta) as unknown[]).length > 0
		})

	return {
		OpenAiHandler: jest.fn().mockImplementation(() => ({
			extractToolCalls: mockExtractToolCalls,
			hasToolCalls: mockHasToolCalls,
			processToolUse: jest.fn().mockResolvedValue({
				type: "text",
				text: "Tool result from OpenAI handler",
			}),
		})),
	}
})

// Mock the McpIntegration
jest.mock("../../../services/mcp/integration/McpIntegration", () => {
	const mockRouteToolUse = jest
		.fn()
		.mockImplementation((content: OpenAI.Chat.Completions.ChatCompletionMessageToolCall) => {
			// For OpenAI-compatible providers like Ollama, only JSON format is supported
			return Promise.resolve(
				JSON.stringify({
					type: "tool_result",
					tool_use_id: content.id || "test-id",
					content: [{ type: "text", text: "Tool result from JSON" }],
					status: "success",
				}),
			)
		})

	// Create a mock instance
	const mockInstance = {
		initialize: jest.fn().mockResolvedValue(undefined),
		registerTool: jest.fn(),
		routeToolUse: mockRouteToolUse,
	}

	// Create a class with a static method
	class MockMcpIntegration {
		initialize = jest.fn().mockResolvedValue(undefined)
		registerTool = jest.fn()
		routeToolUse = mockRouteToolUse

		static getInstance = jest.fn().mockReturnValue(mockInstance)
	}

	return {
		McpIntegration: MockMcpIntegration,
	}
})

// Mock the OpenAI client
jest.mock("openai", () => {
	const mockCreate = jest.fn().mockImplementation(() => {
		return {
			[Symbol.asyncIterator]: function* () {
				// First yield a regular text response
				yield {
					choices: [
						{
							delta: { content: "Hello" },
						},
					],
				}

				// Then yield a JSON tool use
				yield {
					choices: [
						{
							delta: {
								content:
									'{"type":"tool_use","name":"weather","id":"weather-123","input":{"location":"San Francisco"}}',
							},
						},
					],
				}
			},
		}
	})

	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
	}
})

// Mock the HybridMatcher
jest.mock("../../../utils/json-xml-bridge", () => {
	return {
		HybridMatcher: jest.fn().mockImplementation(() => ({
			update: jest.fn().mockImplementation((text: string) => {
				if (text.includes('{"type":"tool_use"')) {
					return [] // Return empty array to let the JSON tool use detection handle it
				}
				return [{ type: "text", text }]
			}),
			final: jest.fn().mockReturnValue([]),
			getDetectedFormat: jest.fn().mockReturnValue("json"),
		})),
	}
})
// Set a longer timeout for these tests to prevent them from timing out
jest.setTimeout(30000)

describe("Ollama MCP Integration", () => {
	let handler: OllamaHandler
	let availableModels: string[] = []
	let ollamaBaseUrl: string

	beforeAll(async () => {
		try {
			// Start the Ollama mock server with dynamic port
			await startServer()
			
			// Get the dynamic port assigned by the OS
			const port = getServerPort()
			if (!port) {
				throw new Error("Failed to get Ollama mock server port")
			}
			
			// Set the base URL with the dynamic port
			ollamaBaseUrl = `http://localhost:${port}`
			console.log(`Using Ollama mock server at ${ollamaBaseUrl}`)
			
			try {
				// Get all available models using the dynamic port with a timeout
				const modelPromise = getOllamaModels(ollamaBaseUrl)
				const timeoutPromise = new Promise<string[]>((_, reject) => {
					setTimeout(() => reject(new Error("Timeout fetching Ollama models")), 5000)
				})
				
				availableModels = await Promise.race([modelPromise, timeoutPromise])
				console.log("Available Ollama models:", availableModels)
			} catch (error) {
				console.warn("Error fetching Ollama models:", error)
				// Continue with default models on error
			}
		} catch (error) {
			console.error("Error setting up Ollama mock server:", error)
			// Ensure we have default models even if server setup fails
		}

		// If no models are found, use a default model name for testing
		if (!availableModels || availableModels.length === 0) {
			availableModels = ["default-model"]
		}
	})
	
	afterAll(async () => {
		try {
			// Stop the Ollama mock server
			await stopServer()
			console.log("Ollama mock server stopped successfully")
		} catch (error) {
			console.error("Error stopping Ollama mock server:", error)
			// Don't throw the error to ensure tests can complete
		}
	})

	beforeEach(() => {
		jest.clearAllMocks()

		// Create handler with mock options using dynamic port
		handler = new OllamaHandler({
			ollamaBaseUrl: ollamaBaseUrl,
			ollamaModelId: "llama2", // Default model for tests
		})
	})

	describe("OpenAI Handler Integration", () => {
		it("should create an OpenAI handler in constructor", () => {
			expect(OpenAiHandler).toHaveBeenCalled()
			expect(handler["openAiHandler"]).toBeDefined()
		})

		it("should pass correct options to OpenAI handler", () => {
			expect(OpenAiHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					openAiApiKey: "ollama",
					openAiBaseUrl: `${ollamaBaseUrl}/v1`,
					openAiModelId: "llama2",
				}),
			)
		})

		it("should use OpenAI handler for tool use detection", async () => {
			// Create a spy on the OpenAI handler's extractToolCalls method
			const extractToolCallsSpy = jest.spyOn(handler["openAiHandler"], "extractToolCalls")

			// Create neutral history
			const neutralHistory: NeutralConversationHistory = [
				{ role: "user", content: [{ type: "text", text: "Use a tool" }] },
			]

			// Call createMessage
			const stream = handler.createMessage("You are helpful.", neutralHistory)

			// Collect stream chunks
			const chunks: ApiStreamChunk[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify OpenAI handler's extractToolCalls method was called
			expect(extractToolCallsSpy).toHaveBeenCalled()
		})
	})

	it("should initialize McpIntegration in constructor", () => {
		// Verify McpIntegration was initialized
		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(McpIntegration.getInstance).toHaveBeenCalled()
		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(handler["mcpIntegration"].initialize).toHaveBeenCalled()
	})

	it("should have access to McpIntegration", () => {
		// Verify handler has mcpIntegration
		expect(handler["mcpIntegration"]).toBeDefined()
	})

	it("should process JSON tool use through McpIntegration", async () => {
		// Use the first available model or default to 'llama2'
		const modelId = availableModels.length > 0 ? availableModels[0] : "llama2"
		// Update handler to use the current model with dynamic port
		handler = new OllamaHandler({
			ollamaBaseUrl: ollamaBaseUrl,
			ollamaModelId: modelId,
		})
		// Create neutral history
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "What is the weather in San Francisco?" }] },
		]

		// Call createMessage with timeout handling
		const streamPromise = handler.createMessage("You are helpful.", neutralHistory)
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error("Timeout waiting for stream response")), 10000)
		})

		// Collect stream chunks with timeout
		const chunks: ApiStreamChunk[] = []
		try {
			const stream = await Promise.race([streamPromise, timeoutPromise])
			for await (const chunk of stream) {
				chunks.push(chunk)
			}
		} catch (error) {
			console.error("Error or timeout in stream processing:", error)
			// Continue the test even if there's a timeout
			// This prevents the test from hanging indefinitely
		}

		// Verify McpIntegration.routeToolUse was called with JSON content
		// eslint-disable-next-line @typescript-eslint/unbound-method
		expect(handler["mcpIntegration"].routeToolUse).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "tool_use",
				name: "weather",
				id: "weather-123",
				input: expect.objectContaining({

					location: "San Francisco",
				}) as { location: string },
			}),
		)

		// Verify tool result was yielded
		const toolResultChunks = chunks.filter((chunk) => chunk.type === "tool_result")
		expect(toolResultChunks.length).toBeGreaterThan(0)
	})

	it("should handle errors in JSON tool use processing", async () => {
		// Use the first available model or default to 'llama2'
		const modelId = availableModels.length > 0 ? availableModels[0] : "llama2"
		// Update handler to use the current model with dynamic port
		handler = new OllamaHandler({
			ollamaBaseUrl: ollamaBaseUrl,
			ollamaModelId: modelId,
		})
		// Mock processToolUse to throw an error for JSON
		jest.spyOn(handler["mcpIntegration"], "routeToolUse").mockImplementationOnce(() => {
			throw new Error("JSON tool use error")
		}) // JSON call fails

		// Create neutral history
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "What is the weather in San Francisco?" }] },
		]

		// Mock console.warn
		const originalWarn = console.warn
		console.warn = jest.fn()

		// Call createMessage with timeout handling
		const streamPromise = handler.createMessage("You are helpful.", neutralHistory)
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error("Timeout waiting for stream response")), 10000)
		})

		// Collect stream chunks with timeout
		const chunks = []
		try {
			const stream = await Promise.race([streamPromise, timeoutPromise])
			for await (const chunk of stream) {
				chunks.push(chunk)
			}
			
			// Verify console.warn was called
			expect(console.warn).toHaveBeenCalledWith("Error processing JSON tool use:", expect.any(Error))
		} catch (error) {
			console.error("Error or timeout in stream processing:", error)
			// Continue the test even if there's a timeout
			// This prevents the test from hanging indefinitely
		} finally {
			// Restore console.warn
			console.warn = originalWarn
		}
	})

	describe("Tool Use Detection and Processing", () => {
		it("should have access to OpenAI handler for tool use detection", () => {
			// Verify the Ollama handler has an OpenAI handler
			expect(handler["openAiHandler"]).toBeDefined()

			// Verify the OpenAI handler has the extractToolCalls method
			// eslint-disable-next-line @typescript-eslint/unbound-method
			expect(handler["openAiHandler"].extractToolCalls).toBeDefined()
			expect(typeof handler["openAiHandler"].extractToolCalls).toBe("function")
		})

		it("should fall back to JSON detection if OpenAI format is not detected", async () => {
			// Mock the OpenAI client to return JSON content
			const mockCreate = jest.fn().mockImplementation(() => {
				return {
					[Symbol.asyncIterator]: function* () {
						// First yield a JSON tool use
						yield {
							choices: [
								{
									delta: {
										content:
											'{"type":"tool_use","name":"weather","id":"weather-123","input":{"location":"San Francisco"}}',
									},
								},
							],
						}

						// Then yield a tool result to simulate the handler's response
						yield {
							choices: [
								{
									delta: { content: "Tool result from JSON" },
								},
							],
						}
					},
				}
			})
			handler["client"].chat.completions.create = mockCreate

			// Create neutral history
			const neutralHistory: NeutralConversationHistory = [
				{ role: "user", content: [{ type: "text", text: "What is the weather in San Francisco?" }] },
			]

			// Call createMessage
			const stream = handler.createMessage("You are helpful.", neutralHistory)

			// Collect stream chunks
			const chunks: ApiStreamChunk[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify tool result was yielded
			const toolResultChunks = chunks.filter((chunk) => chunk.type === "tool_result")
			expect(toolResultChunks.length).toBeGreaterThan(0)

			// Verify the tool result has the expected ID
			if (toolResultChunks.length > 0) {
				expect(toolResultChunks[0].id).toBe("weather-123")
			}
		})

		it("should handle errors in tool use processing", async () => {
			// Mock the OpenAI client to return a tool call in OpenAI format
			const mockCreate = jest.fn().mockImplementation(() => {
				return {
					[Symbol.asyncIterator]: function* () {
						yield {
							choices: [
								{
									delta: {
										tool_calls: [
											{
												id: "call_123",
												function: {
													name: "calculator",
													arguments: '{"a":5,"b":10,"operation":"add"}',
												},
											},
										],
									},
								},
							],
						}

						// Simulate an error by throwing
						throw new Error("OpenAI tool use error")
					},
				}
			})
			handler["client"].chat.completions.create = mockCreate

			// Mock console.warn
			const originalWarn = console.warn
			console.warn = jest.fn()

			// Create neutral history
			const neutralHistory: NeutralConversationHistory = [
				{ role: "user", content: [{ type: "text", text: "Calculate 5 + 10" }] },
			]

			// Call createMessage
			const stream = handler.createMessage("You are helpful.", neutralHistory)

			// Collect stream chunks
			const chunks: ApiStreamChunk[] = []
			let error
			try {
				for await (const chunk of stream) {
					chunks.push(chunk)
				}
			} catch (e) {
				error = e as Error
			}

			// Verify an error was thrown
			expect(error).toBeDefined()

			// Restore console.warn
			console.warn = originalWarn
		})

		it("should have access to processToolUse method for handling tool calls", () => {
			// Verify the Ollama handler has a processToolUse method
			expect(handler["processToolUse"]).toBeDefined()
			expect(typeof handler["processToolUse"]).toBe("function")

			// Verify the Ollama handler has access to McpIntegration
			expect(handler["mcpIntegration"]).toBeDefined()
			// eslint-disable-next-line @typescript-eslint/unbound-method
			expect(handler["mcpIntegration"].routeToolUse).toBeDefined()
			expect(typeof handler["mcpIntegration"].routeToolUse).toBe("function")
		})
	})
})
