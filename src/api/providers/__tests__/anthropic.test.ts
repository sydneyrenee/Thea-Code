// npx jest src/api/providers/__tests__/anthropic.test.ts

import { AnthropicHandler } from "../anthropic"
import { ApiHandlerOptions } from "../../../shared/api"
import type { NeutralConversationHistory } from "../../../shared/neutral-history"
import { ApiStreamUsageChunk, ApiStreamTextChunk, ApiStreamReasoningChunk, ApiStreamToolUseChunk, ApiStreamToolResultChunk } from "../../transform/stream"
import type * as AnthropicSDK from "@anthropic-ai/sdk";

// Internal type for test mocks that matches the structure of ApiStreamChunk
type Chunk =
  | { type: "message_start"; message: { usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; }; }; }
  | { type: "content_block_start"; index: number; content_block: { type: "text"; text: string; }; }
  | { type: "content_block_delta"; delta: { type: "text_delta"; text: string; }; }
  | ApiStreamUsageChunk
  | ApiStreamTextChunk
  | ApiStreamReasoningChunk
  | ApiStreamToolUseChunk
  | ApiStreamToolResultChunk;

// No need for a special type, we'll use a different approach

const mockCreate = jest.fn()

jest.mock("@anthropic-ai/sdk", () => {
	return {
		Anthropic: jest.fn().mockImplementation(() => ({
			messages: {
				create: mockCreate.mockImplementation((options: AnthropicSDK.Anthropic.MessageCreateParams) => {
					if (!options.stream) {
						return {
							id: "test-completion",
							content: [{ type: "text", text: "Test response" }],
							role: "assistant",
							model: options.model,
							usage: {
								input_tokens: 10,
								output_tokens: 5,
							},
						}
					}
					return {
						*[Symbol.asyncIterator]() {
							yield {
								type: "message_start",
								message: {
									usage: {
										input_tokens: 100,
										output_tokens: 50,
										cache_creation_input_tokens: 20,
										cache_read_input_tokens: 10,
									},
								},
							}
							yield {
								type: "content_block_start",
								index: 0,
								content_block: {
									type: "text",
									text: "Hello",
								},
							}
							yield {
								type: "content_block_delta",
								delta: {
									type: "text_delta",
									text: " world",
								},
							}
						},
					}
				}),
			},
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
		mockCreate.mockClear()
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

			const chunks: Chunk[] = []
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

			// Verify API
			expect(mockCreate).toHaveBeenCalled()
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith({
				model: mockOptions.apiModelId,
				messages: [{ role: "user", content: "Test prompt" }],
				max_tokens: 8192,
				temperature: 0,
				stream: false,
			})
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("Anthropic completion error: API Error"))
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow("Anthropic completion error: API Error")
		})

		it("should handle non-text content", async () => {
			mockCreate.mockImplementationOnce(() => ({
				content: [{ type: "image" }],
			}))
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})

		it("should handle empty response", async () => {
			mockCreate.mockImplementationOnce(() => ({
				content: [{ type: "text", text: "" }],
			}))
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
		it("should count tokens using Anthropic API", async () => {
			// Mock the countTokens response
			const mockCountTokensResponse = {
				input_tokens: 42
			};
			
			// Setup the mock
			const mockCountTokens = jest.fn().mockResolvedValue(mockCountTokensResponse);
			// Using a two-step type assertion to avoid ESLint error
			// First cast to unknown, then to the desired type
			const mockableHandler = handler as unknown;
			// Then access the property
			(mockableHandler as {client: {messages: {countTokens: jest.Mock}}}).client.messages.countTokens = mockCountTokens;
			
			// Create neutral content for testing
			const neutralContent = [
				{ type: "text" as const, text: "Test message" }
			];
			
			// Call the method
			const result = await handler.countTokens(neutralContent);
			
			// Verify the result
			expect(result).toBe(42);
			
			// Verify the API was called with converted content
			expect(mockCountTokens).toHaveBeenCalled();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const callArg = mockCountTokens.mock.calls[0][0] as AnthropicSDK.Anthropic.MessageCreateParams;
			expect(callArg.messages[0].role).toBe("user");
			expect(callArg.messages[0].content).toEqual([
				{ type: "text", text: "Test message" }
			]);
		});
		
		it("should fall back to base provider implementation on error", async () => {
			// Mock the countTokens to throw an error
			const mockCountTokens = jest.fn().mockRejectedValue(new Error("API Error"));
			// Using a two-step type assertion to avoid ESLint error
			// First cast to unknown, then to the desired type
			const mockableHandler = handler as unknown;
			// Then access the property
			(mockableHandler as {client: {messages: {countTokens: jest.Mock}}}).client.messages.countTokens = mockCountTokens;
			
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
