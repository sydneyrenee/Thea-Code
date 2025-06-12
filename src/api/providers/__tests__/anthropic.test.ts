// npx jest src/api/providers/__tests__/anthropic.test.ts

import { AnthropicHandler } from "../anthropic"
import { ApiHandlerOptions } from "../../../shared/api"
import type { NeutralConversationHistory } from "../../../shared/neutral-history"

// Mock NeutralAnthropicClient instead of the direct SDK
const mockCreateMessage = jest.fn()
const mockCountTokens = jest.fn()

jest.mock("../../../services/anthropic/NeutralAnthropicClient", () => {
	return {
		NeutralAnthropicClient: jest.fn().mockImplementation(() => ({
			createMessage: mockCreateMessage,
			countTokens: mockCountTokens,
		})),
	}
})

describe("AnthropicHandler", () => {
	let handler: AnthropicHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			apiKey: "test-api-key",
			apiModelId: "claude-3-5-sonnet-20241022",
		}
		handler = new AnthropicHandler(mockOptions)
		mockCreateMessage.mockClear()
		mockCountTokens.mockClear()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(AnthropicHandler)
			expect(handler.getModel().id).toBe(mockOptions.apiModelId)
		})

		it("should initialize with undefined API key", () => {
			// The SDK will handle API key validation, so we just verify it initializes
			const handlerWithoutKey = new AnthropicHandler({
				...mockOptions,
				apiKey: undefined,
			})
			expect(handlerWithoutKey).toBeInstanceOf(AnthropicHandler)
		})

		it("should use custom base URL if provided", () => {
			const customBaseUrl = "https://custom.anthropic.com"
			const handlerWithCustomUrl = new AnthropicHandler({
				...mockOptions,
				anthropicBaseUrl: customBaseUrl,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(AnthropicHandler)
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."

		beforeEach(() => {
			// Setup a default mock for createMessage that returns expected chunks
			mockCreateMessage.mockImplementation(async function*() {
				yield {
					type: "usage",
					inputTokens: 100,
					outputTokens: 50,
					cacheWriteTokens: 20,
					cacheReadTokens: 10,
				}
				// Add await to satisfy async requirement
				await Promise.resolve()
				yield { type: "text", text: "Hello" }
				yield { type: "text", text: " world" }
			})
		})

		it("should handle prompt caching for supported models", async () => {
			// Use neutral format for messages
			const neutralMessages: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "First message" }],
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "Response" }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "Second message" }],
				},
			];
			
			const stream = handler.createMessage(systemPrompt, neutralMessages)

			const chunks: Array<{
				type: string;
				inputTokens?: number;
				outputTokens?: number;
				cacheWriteTokens?: number;
				cacheReadTokens?: number;
				text?: string;
			}> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify usage information
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toBeDefined()
			expect(usageChunk?.inputTokens).toBe(100)
			expect(usageChunk?.outputTokens).toBe(50)
			expect(usageChunk?.cacheWriteTokens).toBe(20)
			expect(usageChunk?.cacheReadTokens).toBe(10)

			// Verify text content
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(2)
			expect(textChunks[0].text).toBe("Hello")
			expect(textChunks[1].text).toBe(" world")

			// Verify the neutral client was called
			expect(mockCreateMessage).toHaveBeenCalledWith({
				model: mockOptions.apiModelId,
				systemPrompt,
				messages: neutralMessages,
				maxTokens: 8192,
				temperature: 0,
			})
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			// Setup mock to return a simple text stream
			mockCreateMessage.mockImplementation(async function*() {
				yield { type: "text", text: "Test response" }
				await Promise.resolve() // Add await to satisfy async requirement
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreateMessage).toHaveBeenCalledWith({
				model: mockOptions.apiModelId,
				systemPrompt: "",
				messages: [{ role: "user", content: "Test prompt" }],
				maxTokens: 8192,
				temperature: 0,
			})
		})

		it("should handle non-text content", async () => {
			// Setup mock to return a stream with different text chunks
			mockCreateMessage.mockImplementation(async function*() {
				yield { type: "text", text: "Hello" }
				yield { type: "text", text: " world" }
				await Promise.resolve() // Add await to satisfy async requirement
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Hello world")
		})

		it("should handle empty response", async () => {
			// Setup mock to return empty stream
			mockCreateMessage.mockImplementation(async function*() {
				// No yields, empty stream
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return default model if no model ID is provided", () => {
			const handlerWithoutModel = new AnthropicHandler({
				...mockOptions,
				apiModelId: undefined,
			})
			const model = handlerWithoutModel.getModel()
			expect(model.id).toBeDefined()
			expect(model.info).toBeDefined()
		})

		it("should return specified model if valid model ID is provided", () => {
			const model = handler.getModel()
			expect(model.id).toBe(mockOptions.apiModelId)
			expect(model.info).toBeDefined()
			expect(model.info.maxTokens).toBe(8192)
			expect(model.info.contextWindow).toBe(200_000)
			expect(model.info.supportsImages).toBe(true)
			expect(model.info.supportsPromptCache).toBe(true)
		})

		it("honors custom maxTokens for thinking models", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-3-7-sonnet-20250219:thinking",
				modelMaxTokens: 32_768,
				modelMaxThinkingTokens: 16_384,
			})

			const result = handler.getModel()
			expect(result.maxTokens).toBe(32_768)
			expect(result.thinking).toEqual({ type: "enabled", budget_tokens: 16_384 })
			expect(result.temperature).toBe(1.0)
		})

		it("does not honor custom maxTokens for non-thinking models", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-3-7-sonnet-20250219",
				modelMaxTokens: 32_768,
				modelMaxThinkingTokens: 16_384,
			})

			const result = handler.getModel()
			expect(result.maxTokens).toBe(8192)
			expect(result.thinking).toBeUndefined()
			expect(result.temperature).toBe(0)
		})
	})

	describe("countTokens", () => {
		it("should count tokens using NeutralAnthropicClient", async () => {
			// Setup the mock to return token count
			mockCountTokens.mockResolvedValue(42);
			
			// Create neutral content for testing
			const neutralContent = [
				{ type: "text" as const, text: "Test message" }
			];
			
			// Call the method
			const result = await handler.countTokens(neutralContent);
			
			// Verify the result
			expect(result).toBe(42);
			
			// Verify the NeutralAnthropicClient countTokens was called
			expect(mockCountTokens).toHaveBeenCalledWith("claude-3-5-sonnet-20241022", neutralContent);
		});
		
		it("should fall back to base provider implementation on error", async () => {
			// Mock the countTokens to throw an error
			mockCountTokens.mockRejectedValue(new Error("API Error"));
			
			// Mock the base provider's countTokens method
			const mockBaseCountTokens = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'countTokens')
				.mockResolvedValue(24);
			
			// Create neutral content for testing
			const neutralContent = [
				{ type: "text" as const, text: "Test message" }
			];
			
			// Call the method
			const result = await handler.countTokens(neutralContent);
			
			// Verify the result comes from the base implementation
			expect(result).toBe(24);
			
			// Verify the base method was called with the original neutral content
			expect(mockBaseCountTokens).toHaveBeenCalledWith(neutralContent);
		});
	})
})
