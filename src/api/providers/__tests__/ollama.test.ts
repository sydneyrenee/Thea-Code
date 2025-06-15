/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { OllamaHandler } from "../ollama"
import { convertToOllamaHistory, convertToOllamaContentBlocks } from "../../transform/neutral-ollama-format"
import { NeutralConversationHistory, NeutralMessageContent } from "../../../shared/neutral-history"
import { XmlMatcher } from "../../../utils/xml-matcher"
import type { ApiStreamChunk } from "../../transform/stream"
import { Readable } from "stream"

// Mock the transform functions
jest.mock("../../transform/neutral-ollama-format", () => ({
	convertToOllamaHistory: jest.fn(),
	convertToOllamaContentBlocks: jest.fn(),
}))

// TODO: Replace nock with fetch mocks as per architectural guidelines
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nock = require("nock")

// Mock the XmlMatcher
jest.mock("../../../utils/xml-matcher", () => {
	return {
		XmlMatcher: jest.fn().mockImplementation(() => ({
			update: jest.fn().mockImplementation((text: string) => {
				if (text.includes("<think>")) {
					return [{ type: "reasoning", text: text.replace(/<\/?think>/g, "") }]
				}
				return [{ type: "text", text }]
			}),
			final: jest.fn().mockReturnValue([]),
		})),
	}
})

describe("OllamaHandler", () => {
	let handler: OllamaHandler
	// Define availableModels as a const directly for .each
	const availableModels: string[] = ["llama2", "mistral", "gemma"]

	beforeEach(() => {
		jest.clearAllMocks()
		nock.cleanAll()

		// Create handler with mock options
		handler = new OllamaHandler({
			ollamaBaseUrl: "http://localhost:10000",
			ollamaModelId: "llama2", // Default model for tests
		})
	})

	afterEach(() => {
		nock.cleanAll()
	})

	describe("createMessage", () => {
		it.each(availableModels)(
			"should use convertToOllamaHistory to convert messages with %s model",
			async (modelId) => {
				// Update handler to use the current model
				handler = new OllamaHandler({
					ollamaBaseUrl: "http://localhost:10000",
					ollamaModelId: modelId,
				})
				// Mock implementation
				;(convertToOllamaHistory as jest.Mock).mockReturnValue([{ role: "user", content: "Hello" }])

				// Create neutral history
				const neutralHistory: NeutralConversationHistory = [
					{ role: "user", content: [{ type: "text", text: "Hello" }] },
				]

				let requestBody: Record<string, unknown> | undefined
				nock("http://localhost:10000")
					.post("/v1/chat/completions")
					.reply(function (_uri: string, body: unknown) {
						requestBody = body as Record<string, unknown>
						const deltas = [
							{ content: "Hello" },
							{ content: " world" },
							{ content: "<think>This is reasoning</think>" },
						]
						const stream = new Readable({ read() {} })
						for (const delta of deltas) {
							const chunk = {
								id: "id",
								object: "chat.completion.chunk",
								created: 0,
								model: "test",
								choices: [{ delta, index: 0, finish_reason: null }],
							}
							stream.push(`data: ${JSON.stringify(chunk)}\n\n`)
						}
						stream.push("data: [DONE]\n\n")
						stream.push(null)
						return [200, stream]
					})

				const stream = handler.createMessage("You are helpful.", neutralHistory)

				// Collect stream chunks
				const chunks: ApiStreamChunk[] = []
				for await (const chunk of stream) {
					chunks.push(chunk)
				}

				// Verify transform function was called
				expect(convertToOllamaHistory).toHaveBeenCalledWith(neutralHistory)

				const rb = requestBody as {
					model: string
					messages: unknown
					temperature: number
					stream: boolean
				}
				expect(rb).toEqual(
					expect.objectContaining({
						model: modelId,
						messages: expect.arrayContaining([
							{ role: "system", content: "You are helpful." },
							{ role: "user", content: "Hello" },
						]) as unknown,
						temperature: 0,
						stream: true,
					}),
				)

				// Verify stream chunks
				expect(chunks).toContainEqual({ type: "text", text: "Hello" })
				expect(chunks).toContainEqual({ type: "text", text: " world" })
				expect(chunks).toContainEqual({ type: "reasoning", text: "This is reasoning" })
			},
		)

		it.each(availableModels)(
			"should not add system prompt if already included in messages with %s model",
			async (modelId) => {
				// Update handler to use the current model
				handler = new OllamaHandler({
					ollamaBaseUrl: "http://localhost:10000",
					ollamaModelId: modelId,
				})
				// Mock implementation with system message already included
				;(convertToOllamaHistory as jest.Mock).mockReturnValue([
					{ role: "system", content: "Existing system prompt" },
					{ role: "user", content: "Hello" },
				])			// Create neutral history
			const neutralHistory: NeutralConversationHistory = [
				{ role: "system", content: [{ type: "text", text: "Existing system prompt" }] },
				{ role: "user", content: [{ type: "text", text: "Hello" }] },
			]

			let requestBody: Record<string, unknown> | undefined
			nock("http://localhost:10000")
				.post("/v1/chat/completions")
				.reply((_uri: string, body: unknown) => {
					requestBody = body as Record<string, unknown>
					const stream = new Readable({ read() {} })
					const deltas = [{ content: "Hello" }, { content: " world" }]
					for (const d of deltas) {
						const chunk = {
							id: "id",
							object: "chat.completion.chunk",
							created: 0,
							model: "test",
							choices: [{ delta: d, index: 0, finish_reason: null }],
						}
						stream.push(`data: ${JSON.stringify(chunk)}\n\n`)
					}
					stream.push("data: [DONE]\n\n")
					stream.push(null)
					return [200, stream]
				})

				const stream = handler.createMessage("You are helpful.", neutralHistory)

				// Collect stream chunks (just to complete the generator)
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				for await (const _chunk of stream) {
					// Do nothing - we're just consuming the stream
				}

				expect(requestBody).toEqual({
					model: modelId,
					messages: [
						{ role: "system", content: "Existing system prompt" },
						{ role: "user", content: "Hello" },
					],
					temperature: 0,
					stream: true,
				})
			},
		)

		it.each(availableModels)("should handle empty system prompt with %s model", async (modelId) => {
			// Update handler to use the current model
			handler = new OllamaHandler({
				ollamaBaseUrl: "http://localhost:10000",
				ollamaModelId: modelId,
			})
			// Mock implementation
			;(convertToOllamaHistory as jest.Mock).mockReturnValue([{ role: "user", content: "Hello" }])

			// Create neutral history
			const neutralHistory: NeutralConversationHistory = [
				{ role: "user", content: [{ type: "text", text: "Hello" }] },
			]

			let requestBody: Record<string, unknown> | undefined
			nock("http://localhost:10000")
				.post("/v1/chat/completions")
				.reply(function (_uri: string, body: unknown) {
					requestBody = body as Record<string, unknown>
					const stream = new Readable({ read() {} })
					stream.push("data: [DONE]\n\n")
					stream.push(null)
					return [200, stream]
				})

			const stream = handler.createMessage("", neutralHistory)

			// Collect stream chunks (just to complete the generator)
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _chunk of stream) {
				// Do nothing - we're just consuming the stream
			}

			expect(requestBody).toEqual({
				model: modelId,
				messages: [{ role: "user", content: "Hello" }],
				temperature: 0,
				stream: true,
			})
		})

		it.each(availableModels)("should use XmlMatcher for processing responses with %s model", async (modelId) => {
			// Update handler to use the current model
			handler = new OllamaHandler({
				ollamaBaseUrl: "http://localhost:10000",
				ollamaModelId: modelId,
			})
			// Mock implementation
			;(convertToOllamaHistory as jest.Mock).mockReturnValue([{ role: "user", content: "Hello" }])

			// Create neutral history
			const neutralHistory: NeutralConversationHistory = [
				{ role: "user", content: [{ type: "text", text: "Hello" }] },
			]

			// Call createMessage
			const stream = handler.createMessage("You are helpful.", neutralHistory)

			// Collect stream chunks
			const chunks: ApiStreamChunk[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify XmlMatcher was created with the correct tag
			expect(XmlMatcher).toHaveBeenCalledWith("think", expect.any(Function))

			// Verify XmlMatcher.update was called for each chunk
			const xmlMatcherInstance = (XmlMatcher as jest.Mock).mock.results[0].value as {
				update: jest.Mock
				final: jest.Mock
			}
			expect(xmlMatcherInstance.update).toHaveBeenCalledWith("Hello")
			expect(xmlMatcherInstance.update).toHaveBeenCalledWith(" world")

			// Verify XmlMatcher.final was called
			expect(xmlMatcherInstance.final).toHaveBeenCalled()
		})
	})

	describe("countTokens", () => {
		it.each(availableModels)("should use convertToOllamaContentBlocks with %s model", async (modelId) => {
			// Update handler to use the current model
			handler = new OllamaHandler({
				ollamaBaseUrl: "http://localhost:10000",
				ollamaModelId: modelId,
			})
			// Mock implementation
			;(convertToOllamaContentBlocks as jest.Mock).mockReturnValue("Hello world")

			// Mock the base provider's countTokens method
			const mockSuperCountTokens = jest.spyOn(Object.getPrototypeOf(OllamaHandler.prototype), "countTokens")
			mockSuperCountTokens.mockResolvedValue(2) // 2 tokens for "Hello world"

			// Create neutral content
			const neutralContent: NeutralMessageContent = [{ type: "text", text: "Hello world" }]

			// Call countTokens
			const tokenCount = await handler.countTokens(neutralContent)

			// Verify transform function was called
			expect(convertToOllamaContentBlocks).toHaveBeenCalledWith(neutralContent)

			// Verify base provider's countTokens was called with the converted content
			expect(mockSuperCountTokens).toHaveBeenCalledWith([{ type: "text", text: "Hello world" }])

			// Verify token count
			expect(tokenCount).toBe(2)

			// Clean up
			mockSuperCountTokens.mockRestore()
		})

		it.each(availableModels)("should handle errors and use fallback with %s model", async (modelId) => {
			// Update handler to use the current model
			handler = new OllamaHandler({
				ollamaBaseUrl: "http://localhost:10000",
				ollamaModelId: modelId,
			})
			// Mock implementation that throws an error
			;(convertToOllamaContentBlocks as jest.Mock).mockImplementation(() => {
				throw new Error("Conversion error")
			})

			// Mock console.warn
			const originalWarn = console.warn
			console.warn = jest.fn()

			// Mock the base provider's countTokens method
			const mockSuperCountTokens = jest.spyOn(Object.getPrototypeOf(OllamaHandler.prototype), "countTokens")
			mockSuperCountTokens.mockResolvedValue(2) // 2 tokens for fallback

			// Create neutral content
			const neutralContent: NeutralMessageContent = [{ type: "text", text: "Hello world" }]

			// Call countTokens
			const tokenCount = await handler.countTokens(neutralContent)

			// Verify transform function was called
			expect(convertToOllamaContentBlocks).toHaveBeenCalledWith(neutralContent)

			// Verify console.warn was called
			expect(console.warn).toHaveBeenCalled()

			// Verify base provider's countTokens was called with the original content
			expect(mockSuperCountTokens).toHaveBeenCalledWith(neutralContent)

			// Verify token count
			expect(tokenCount).toBe(2)

			// Clean up
			console.warn = originalWarn
			mockSuperCountTokens.mockRestore()
		})
	})

	describe("completePrompt", () => {
		it.each(availableModels)(
			"should convert prompt to neutral format and use convertToOllamaHistory with %s model",
			async (modelId) => {
				// Update handler to use the current model
				handler = new OllamaHandler({
					ollamaBaseUrl: "http://localhost:10000",
					ollamaModelId: modelId,
				})
				// Mock implementation
				;(convertToOllamaHistory as jest.Mock).mockReturnValue([{ role: "user", content: "Hello" }])

				let requestBody: Record<string, unknown> | undefined
				nock("http://localhost:10000")
					.post("/v1/chat/completions")
					.reply(function (_uri: string, body: unknown) {
						requestBody = body as Record<string, unknown>
						return [200, { choices: [{ message: { content: "Hello world" } }] }]
					})

				// Call completePrompt
				const result = await handler.completePrompt("Hello")

				// Verify transform function was called with the correct neutral history
				expect(convertToOllamaHistory).toHaveBeenCalledWith([
					{ role: "user", content: [{ type: "text", text: "Hello" }] },
				])

				expect(requestBody).toEqual({
					model: modelId,
					messages: [{ role: "user", content: "Hello" }],
					temperature: 0,
					stream: false,
				})

				// Verify result
				expect(result).toBe("Hello world")
			},
		)

		it.each(availableModels)("should handle errors with %s model", async (modelId) => {
			// Update handler to use the current model
			handler = new OllamaHandler({
				ollamaBaseUrl: "http://localhost:10000",
				ollamaModelId: modelId,
			})
			// Mock implementation
			;(convertToOllamaHistory as jest.Mock).mockReturnValue([{ role: "user", content: "Hello" }])

			nock("http://localhost:10000")
				.post("/v1/chat/completions")
				.reply(500, { error: { message: "API error" } })

			// Call completePrompt and expect it to throw
			await expect(handler.completePrompt("Hello")).rejects.toThrow("Ollama completion error: API error")
		})
	})
})
