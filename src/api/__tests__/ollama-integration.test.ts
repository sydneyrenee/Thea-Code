import { OllamaHandler } from "../providers/ollama"
import { NeutralConversationHistory } from "../../shared/neutral-history"
import OpenAI from "openai"
// Note: This test uses port 10000 which is for Msty, a service that uses Ollama on the backend

// Mock the McpIntegration to avoid initialization issues
jest.mock("../../services/mcp/integration/McpIntegration", () => {
	const mockInstance = {
		initialize: jest.fn().mockResolvedValue(undefined),
		registerTool: jest.fn(),
		routeToolUse: jest.fn().mockResolvedValue("{}"),
	}

	class MockMcpIntegration {
		initialize = jest.fn().mockResolvedValue(undefined)
		registerTool = jest.fn()
		routeToolUse = jest.fn().mockResolvedValue("{}")

		static getInstance = jest.fn().mockReturnValue(mockInstance)
	}

	return {
		McpIntegration: MockMcpIntegration,
	}
})

// Mock the HybridMatcher
jest.mock("../../utils/json-xml-bridge", () => {
	return {
		HybridMatcher: jest.fn().mockImplementation(() => ({
			update: jest.fn().mockImplementation((text: string) => {
				if (text.includes("<think>")) {
					return [{ matched: true, type: "reasoning", data: text.replace(/<\/?think>/g, "") }]
				}
				if (text.includes('{"type":"thinking"')) {
					try {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						const jsonObj = JSON.parse(text)
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						if (jsonObj.type === "thinking") {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
							return [{ matched: true, type: "reasoning", data: String(jsonObj.content) }]
						}
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
					} catch (_e: unknown) {
						// Not valid JSON, treat as text
					}
				}
				return [{ matched: false, type: "text", data: text, text: text }]
			}),

			final: jest.fn().mockImplementation((text: string) => {
				if (text) {
					return [{ matched: false, type: "text", data: text, text: text }]
				}
				return []
			}),
		})),
	}
})

// Mock the XmlMatcher
jest.mock("../../utils/xml-matcher", () => {
	return {
		XmlMatcher: jest.fn().mockImplementation(() => ({
			update: jest.fn().mockImplementation((text: string) => {
				if (text.includes("<think>")) {
					return [{ matched: true, type: "reasoning", data: text.replace(/<\/?think>/g, "") }]
				}
				return [{ matched: false, type: "text", data: text, text: text }]
			}),
			final: jest.fn().mockImplementation((text: string) => {
				if (text) {
					return [{ matched: false, type: "text", data: text, text: text }]
				}
				return []
			}),
		})),
	}
})

// Mock the OpenAI client for integration testing
jest.mock("openai", () => {
	// Create a more realistic mock that simulates Ollama's behavior
	const mockCreate = jest
		.fn()
		.mockImplementation(
			({ messages, stream }: { messages: OpenAI.Chat.ChatCompletionMessageParam[]; stream: boolean }) => {
				// Simulate streaming response
				if (stream) {
					return {
						[Symbol.asyncIterator]: function* () {
							// eslint-disable-next-line @typescript-eslint/no-unused-vars
							const hasSystemMessage = messages.some(
								(msg: OpenAI.Chat.ChatCompletionMessageParam) => msg.role === "system",
							)

							// Check for specific test cases based on user message content

							const userMessage =
								messages.find((msg: OpenAI.Chat.ChatCompletionMessageParam) => msg.role === "user")
									?.content || ""

							if (typeof userMessage === "string" && userMessage.includes("reasoning")) {
								// Test case for reasoning/thinking
								yield {
									choices: [
										{
											delta: { content: "I need to think about this. " },
											index: 0,
											finish_reason: null,
										},
									],
									id: "chatcmpl-reasoning-1",
									created: 1678886400,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
								yield {
									choices: [
										{
											delta: {
												content:
													"<think>This is a reasoning block where I analyze the problem.</think>",
											},
											index: 0,
											finish_reason: null,
										},
									],
									id: "chatcmpl-reasoning-2",
									created: 1678886401,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
								yield {
									choices: [
										{
											delta: { content: " After thinking, my answer is 42." },
											index: 0,
											finish_reason: "stop",
										},
									],
									id: "chatcmpl-reasoning-3",
									created: 1678886402,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
							} else if (typeof userMessage === "string" && userMessage.includes("multi-turn")) {
								// Test case for multi-turn conversations
								// Return a response that acknowledges previous messages

								const assistantMsgContent = messages.find(
									(msg: OpenAI.Chat.ChatCompletionMessageParam) => msg.role === "assistant",
								)?.content
								const previousAssistantMessage =
									typeof assistantMsgContent === "string" ? assistantMsgContent : ""
								yield {
									choices: [
										{
											delta: {
												content: `I see our previous conversation where I said "${previousAssistantMessage}". `,
											},
											index: 0,
											finish_reason: null,
										},
									],
									id: "chatcmpl-multi-turn-1",
									created: 1678886403,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
								yield {
									choices: [
										{
											delta: { content: "Now I can continue from there." },
											index: 0,
											finish_reason: "stop",
										},
									],
									id: "chatcmpl-multi-turn-2",
									created: 1678886404,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
							} else if (typeof userMessage === "string" && userMessage.includes("system prompt")) {
								// Test case for system prompt

								const systemMsgContent = messages.find(
									(msg: OpenAI.Chat.ChatCompletionMessageParam) => msg.role === "system",
								)?.content
								const systemMessage =
									typeof systemMsgContent === "string" ? systemMsgContent : "No system prompt"
								yield {
									choices: [
										{
											delta: { content: `I'm following the system prompt: "${systemMessage}". ` },
											index: 0,
											finish_reason: null,
										},
									],
									id: "chatcmpl-system-prompt-1",
									created: 1678886405,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
								yield {
									choices: [
										{
											delta: { content: "This shows I received it correctly." },
											index: 0,
											finish_reason: "stop",
										},
									],
									id: "chatcmpl-system-prompt-2",
									created: 1678886406,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
							} else {
								// Default response
								yield {
									choices: [
										{
											delta: { content: "Hello! " },
											index: 0,
											finish_reason: null,
										},
									],
									id: "chatcmpl-default-1",
									created: 1678886407,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
								yield {
									choices: [
										{
											delta: { content: "This is a response from the Ollama API." },
											index: 0,
											finish_reason: "stop",
										},
									],
									id: "chatcmpl-default-2",
									created: 1678886408,
									model: "llama2",
									object: "chat.completion.chunk" as const,
								}
							}
						},
					}
				}

				// Non-streaming response
				return {
					choices: [
						{
							message: { content: "Hello! This is a response from the Ollama API.", refusal: null },
						},
					],
				}
			},
		)

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

describe("Ollama Integration", () => {
	let handler: OllamaHandler

	beforeEach(() => {
		jest.clearAllMocks()

		// Create handler with test options
		// Note: Using port 10000 for Msty which uses Ollama on the backend
		handler = new OllamaHandler({
			ollamaBaseUrl: "http://localhost:10000",
			ollamaModelId: "llama2",
		})
	})

	it("should handle basic text messages", async () => {
		// Create neutral history with a simple user message
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "Hello" }] },
		]

		// Call createMessage
		const stream = handler.createMessage("You are helpful.", neutralHistory)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks
		expect(chunks).toContainEqual({ type: "text", text: "Hello! " })
		expect(chunks).toContainEqual({ type: "text", text: "This is a response from the Ollama API." })
	})

	it("should handle reasoning/thinking with XML tags", async () => {
		// Create neutral history with a message that triggers reasoning
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "Please use reasoning to solve this problem." }] },
		]

		// Call createMessage
		const stream = handler.createMessage("You are helpful.", neutralHistory)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks
		expect(chunks).toContainEqual({ type: "text", text: "I need to think about this. " })
		expect(chunks).toContainEqual({
			type: "reasoning",
			text: "This is a reasoning block where I analyze the problem.",
		})
		expect(chunks).toContainEqual({ type: "text", text: " After thinking, my answer is 42." })
	})

	it("should handle multi-turn conversations", async () => {
		// Create neutral history with multiple turns
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "Hello" }] },
			{ role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
			{ role: "user", content: [{ type: "text", text: "Let's continue our multi-turn conversation." }] },
		]

		// Mock the OpenAI client's create method for this specific test
		jest.spyOn(handler["client"].chat.completions, "create").mockImplementationOnce(
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			((_body: OpenAI.Chat.ChatCompletionCreateParams, _options?: OpenAI.RequestOptions) => {
				const chunks = [
					{
						choices: [
							{
								delta: { content: 'I see our previous conversation where I said "Hi there!". ' },
								index: 0,
								finish_reason: null,
							},
						],
						id: "chatcmpl-multi-turn-mock-1",
						created: 1678886409,
						model: "llama2",
						object: "chat.completion.chunk" as const,
					},
					{
						choices: [
							{
								delta: { content: "Now I can continue from there." },
								index: 0,
								finish_reason: "stop" as const,
							},
						],
						id: "chatcmpl-multi-turn-mock-2",
						created: 1678886410,
						model: "llama2",
						object: "chat.completion.chunk" as const,
					}
				]

				// Create a proper async iterator that matches OpenAI's Stream interface
				function* generateChunks() {
					for (const chunk of chunks) {
						yield chunk
					}
				}

				return generateChunks() as any
			}),
		)

		// Call createMessage
		const stream = handler.createMessage("You are helpful.", neutralHistory)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks
		expect(chunks).toContainEqual({
			type: "text",
			text: 'I see our previous conversation where I said "Hi there!". ',
		})
		expect(chunks).toContainEqual({ type: "text", text: "Now I can continue from there." })
	})

	it("should handle system prompts", async () => {
		// Create neutral history
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "Tell me about the system prompt." }] },
		]

		// Call createMessage with a specific system prompt
		const stream = handler.createMessage(
			"You are a helpful assistant that provides concise answers.",
			neutralHistory,
		)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks
		expect(chunks).toContainEqual({
			type: "text",
			text: 'I\'m following the system prompt: "You are a helpful assistant that provides concise answers.". ',
		})
		expect(chunks).toContainEqual({ type: "text", text: "This shows I received it correctly." })
	})

	it("should handle multiple content blocks", async () => {
		// Create neutral history with multiple content blocks
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "First paragraph." },
					{ type: "text", text: "Second paragraph." },
				],
			},
		]

		// Call createMessage
		const stream = handler.createMessage("You are helpful.", neutralHistory)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks (should be the default response)
		expect(chunks).toContainEqual({ type: "text", text: "Hello! " })
		expect(chunks).toContainEqual({ type: "text", text: "This is a response from the Ollama API." })
	})

	it("should handle non-text content blocks by ignoring them", async () => {
		// Create neutral history with mixed content blocks
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Look at this image:" },
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "base64data",
						},
					},
				],
			},
		]

		// Call createMessage
		const stream = handler.createMessage("You are helpful.", neutralHistory)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks (should be the default response)
		expect(chunks).toContainEqual({ type: "text", text: "Hello! " })
		expect(chunks).toContainEqual({ type: "text", text: "This is a response from the Ollama API." })
	})

	it("should handle completePrompt method", async () => {
		// Call completePrompt
		const result = await handler.completePrompt("Hello")

		// Verify result
		expect(result).toBe("Hello! This is a response from the Ollama API.")
	})

	it("should handle countTokens method", async () => {
		// Mock the base provider's countTokens method
		const mockSuperCountTokens = jest.spyOn(Object.getPrototypeOf(OllamaHandler.prototype), "countTokens")
		mockSuperCountTokens.mockResolvedValue(5) // 5 tokens for "Hello! This is a test."

		// Call countTokens
		const tokenCount = await handler.countTokens([{ type: "text", text: "Hello! This is a test." }])

		// Verify token count
		expect(tokenCount).toBe(5)

		// Clean up
		mockSuperCountTokens.mockRestore()
	})

	it("should handle reasoning/thinking with JSON format", async () => {
		// Create neutral history with a message that triggers JSON reasoning
		const neutralHistory: NeutralConversationHistory = [
			{ role: "user", content: [{ type: "text", text: "Let me think about reasoning in JSON format" }] },
		]

		// Mock the OpenAI client's create method for this specific test
		jest.spyOn(handler["client"].chat.completions, "create").mockImplementationOnce(
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			((_body: OpenAI.Chat.ChatCompletionCreateParams, _options?: OpenAI.RequestOptions) => {
				const chunks = [
					{
						choices: [
							{
								delta: { content: "I need to think about this. " },
								index: 0,
								finish_reason: null,
							},
						],
						id: "chatcmpl-json-reasoning-1",
						created: 1678886411,
						model: "llama2",
						object: "chat.completion.chunk" as const,
					},
					{
						choices: [
							{
								delta: {
									content: '{"type":"thinking","content":"This is a reasoning block in JSON format"}',
								},
								index: 0,
								finish_reason: null,
							},
						],
						id: "chatcmpl-json-reasoning-2",
						created: 1678886412,
						model: "llama2",
						object: "chat.completion.chunk" as const,
					},
					{
						choices: [
							{
								delta: { content: " After thinking, my answer is 42." },
								index: 0,
								finish_reason: "stop" as const,
							},
						],
						id: "chatcmpl-json-reasoning-3",
						created: 1678886413,
						model: "llama2",
						object: "chat.completion.chunk" as const,
					}
				]

				// Create a proper async iterator that matches OpenAI's Stream interface
				function* generateChunks() {
					for (const chunk of chunks) {
						yield chunk
					}
				}

				return generateChunks() as any
			}),
		)

		// Call createMessage
		const stream = handler.createMessage("You are helpful.", neutralHistory)

		// Collect stream chunks
		const chunks = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify stream chunks
		expect(chunks).toContainEqual({ type: "text", text: "I need to think about this. " })
		expect(chunks).toContainEqual({ type: "reasoning", text: "This is a reasoning block in JSON format" })
		expect(chunks).toContainEqual({ type: "text", text: " After thinking, my answer is 42." })
	})
})
