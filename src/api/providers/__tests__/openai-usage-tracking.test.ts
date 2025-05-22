import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"
import { NeutralMessage } from "../../../shared/neutral-history"
import type OpenAI from "openai"

// Mock OpenAI client with multiple chunks that contain usage data
const mockCreate = jest.fn()
jest.mock("openai", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					// eslint-disable-next-line @typescript-eslint/require-await
					create: mockCreate.mockImplementation(async (options: OpenAI.Chat.ChatCompletionCreateParams) => {
						if (!options.stream) {
							return {
								id: "test-completion",
								choices: [
									{
										message: { role: "assistant", content: "Test response" },
										finish_reason: "stop",
										index: 0,
									},
								],
								usage: {
									prompt_tokens: 10,
									completion_tokens: 5,
									total_tokens: 15,
								},
							};
						}

						// Return a stream with multiple chunks that include usage metrics
						return {
							// eslint-disable-next-line @typescript-eslint/require-await
							[Symbol.asyncIterator]: async function* (): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk> {
								// First chunk with partial usage
								yield {
									id: "chatcmpl-test-1",
									created: 1678886400,
									model: "gpt-4",
									object: "chat.completion.chunk",
									choices: [
										{
											delta: { content: "Test " },
											index: 0,
											finish_reason: null,
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 2,
										total_tokens: 12,
									},
								};

								// Second chunk with updated usage
								yield {
									id: "chatcmpl-test-2",
									created: 1678886401,
									model: "gpt-4",
									object: "chat.completion.chunk",
									choices: [
										{
											delta: { content: "response" },
											index: 0,
											finish_reason: null,
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 4,
										total_tokens: 14,
									},
								};

								// Final chunk with complete usage
								yield {
									id: "chatcmpl-test-3",
									created: 1678886402,
									model: "gpt-4",
									object: "chat.completion.chunk",
									choices: [
										{
											delta: {},
											index: 0,
											finish_reason: "stop",
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 5,
										total_tokens: 15,
									},
								};
							},
						};
					}),
				},
			},
		})),
	}
})

describe("OpenAiHandler with usage tracking fix", () => {
	let handler: OpenAiHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			openAiApiKey: "test-api-key",
			openAiModelId: "gpt-4",
			openAiBaseUrl: "https://api.openai.com/v1",
		}
		handler = new OpenAiHandler(mockOptions)
		mockCreate.mockClear()
	})

	describe("usage metrics with streaming", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: NeutralMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Hello!",
					},
				],
			},
		]

		it("should only yield usage metrics once at the end of the stream", async () => {
			const stream = handler.createMessage(systemPrompt, messages);
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			// Check we have text chunks
			const textChunks = chunks.filter((chunk) => chunk.type === "text");
			expect(textChunks).toHaveLength(2);
			expect(textChunks[0].text).toBe("Test ");
			expect(textChunks[1].text).toBe("response");

			// Check we only have one usage chunk and it's the last one
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage");
			expect(usageChunks).toHaveLength(1);
			expect(usageChunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
			});

			// Check the usage chunk is the last one reported from the API
			const lastChunk = chunks[chunks.length - 1];
			expect(lastChunk.type).toBe("usage");
			expect(lastChunk.inputTokens).toBe(10);
			expect(lastChunk.outputTokens).toBe(5);
		})

		it("should handle case where usage is only in the final chunk", async () => {
			// Override the mock for this specific test
			// eslint-disable-next-line @typescript-eslint/require-await
			mockCreate.mockImplementationOnce(async (options: OpenAI.Chat.ChatCompletionCreateParams) => {
				if (!options.stream) {
					return {
						id: "test-completion",
						choices: [{ message: { role: "assistant", content: "Test response" } }],
						usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
					};
				}

				return {
					// eslint-disable-next-line @typescript-eslint/require-await
					[Symbol.asyncIterator]: async function* (): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk> {
						// First chunk with no usage
						yield {
							id: "chatcmpl-test-4",
							created: 1678886403,
							model: "gpt-4",
							object: "chat.completion.chunk",
							choices: [{ delta: { content: "Test " }, index: 0, finish_reason: null }],
							usage: null,
						};

						// Second chunk with no usage
						yield {
							id: "chatcmpl-test-5",
							created: 1678886404,
							model: "gpt-4",
							object: "chat.completion.chunk",
							choices: [{ delta: { content: "response" }, index: 0, finish_reason: null }],
							usage: null,
						};

						// Final chunk with usage data
						yield {
							id: "chatcmpl-test-6",
							created: 1678886405,
							model: "gpt-4",
							object: "chat.completion.chunk",
							choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
							usage: {
								prompt_tokens: 10,
								completion_tokens: 5,
								total_tokens: 15,
							},
						};
					},
				};
			});

			const stream = handler.createMessage(systemPrompt, messages);
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			// Check usage metrics
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage");
			expect(usageChunks).toHaveLength(1);
			expect(usageChunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
			});
		})

		it("should handle case where no usage is provided", async () => {
			// Override the mock for this specific test
			// eslint-disable-next-line @typescript-eslint/require-await
			mockCreate.mockImplementationOnce(async (options: OpenAI.Chat.ChatCompletionCreateParams) => {
				if (!options.stream) {
					return {
						id: "test-completion",
						choices: [{ message: { role: "assistant", content: "Test response" } }],
						usage: null,
					};
				}

				return {
					// eslint-disable-next-line @typescript-eslint/require-await
					[Symbol.asyncIterator]: async function* (): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk> {
						yield {
							id: "chatcmpl-test-7",
							created: 1678886406,
							model: "gpt-4",
							object: "chat.completion.chunk",
							choices: [{ delta: { content: "Test response" }, index: 0, finish_reason: null }],
							usage: null,
						};
						yield {
							id: "chatcmpl-test-8",
							created: 1678886407,
							model: "gpt-4",
							object: "chat.completion.chunk",
							choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
							usage: null,
						};
					},
				};
			});

			const stream = handler.createMessage(systemPrompt, messages);
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			// Check we don't have any usage chunks
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage");
			expect(usageChunks).toHaveLength(0);
		})
	})
})
