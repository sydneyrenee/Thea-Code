// npx jest src/api/providers/__tests__/openrouter.test.ts

import axios from "axios"
import OpenAI from "openai"
import { NeutralMessage } from "../../../shared/neutral-history"
import type { ApiStreamChunk } from "../../transform/stream"; // Added for chunk typing
import { OpenRouterHandler } from "../openrouter"
import { ApiHandlerOptions, ModelInfo } from "../../../shared/api"
import { API_REFERENCES } from "../../../../dist/thea-config" // Import branded constants
// Mock dependencies
jest.mock("axios")
jest.mock("delay", () => jest.fn(() => Promise.resolve()))

const mockOpenRouterModelInfo: ModelInfo = {
	maxTokens: 1000,
	contextWindow: 2000,
	supportsPromptCache: true,
	inputPrice: 0.01,
	outputPrice: 0.02,
}

describe("OpenRouterHandler", () => {
	const mockOptions: ApiHandlerOptions = {
		openRouterApiKey: "test-key",
		openRouterModelId: "test-model",
		openRouterModelInfo: mockOpenRouterModelInfo,
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	test("constructor initializes with correct options", () => {
		const handler = new OpenRouterHandler(mockOptions)
		expect(handler).toBeInstanceOf(OpenRouterHandler)
		expect(OpenAI).toHaveBeenCalledWith({
			baseURL: "https://openrouter.ai/api/v1",
			apiKey: mockOptions.openRouterApiKey,
			defaultHeaders: {
				"HTTP-Referer": API_REFERENCES.HOMEPAGE,
				"X-Title": API_REFERENCES.APP_TITLE,
			},
		})
	})

	test("getModel returns correct model info when options are provided", () => {
		const handler = new OpenRouterHandler(mockOptions)
		const result = handler.getModel()

		expect(result).toEqual({
			id: mockOptions.openRouterModelId,
			info: mockOptions.openRouterModelInfo,
			maxTokens: 1000,
			temperature: 0,
			thinking: undefined,
			topP: undefined,
		})
	})

	test("getModel returns default model info when options are not provided", () => {
		const handler = new OpenRouterHandler({})
		const result = handler.getModel()

		expect(result.id).toBe("anthropic/claude-3.7-sonnet")
		expect(result.info.supportsPromptCache).toBe(true)
	})

	test("getModel honors custom maxTokens for thinking models", () => {
		const handler = new OpenRouterHandler({
			openRouterApiKey: "test-key",
			openRouterModelId: "test-model",
			openRouterModelInfo: {
				...mockOpenRouterModelInfo,
				maxTokens: 128_000,
				thinking: true,
			},
			modelMaxTokens: 32_768,
			modelMaxThinkingTokens: 16_384,
		})

		const result = handler.getModel()
		expect(result.maxTokens).toBe(32_768)
		expect(result.thinking).toEqual({ type: "enabled", budget_tokens: 16_384 })
		expect(result.temperature).toBe(1.0)
	})

	test("getModel does not honor custom maxTokens for non-thinking models", () => {
		const handler = new OpenRouterHandler({
			...mockOptions,
			modelMaxTokens: 32_768,
			modelMaxThinkingTokens: 16_384,
		})

		const result = handler.getModel()
		expect(result.maxTokens).toBe(1000)
		expect(result.thinking).toBeUndefined()
		expect(result.temperature).toBe(0)
	})

	test("createMessage generates correct stream chunks", async () => {
		const handler = new OpenRouterHandler(mockOptions)
		const mockStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> = (async function* () { // eslint-disable-line @typescript-eslint/require-await
			yield {
				id: "test-id-1",
				created: 1678886400,
				model: "test-model",
				object: "chat.completion.chunk",
				choices: [
					{
						delta: {
							content: "test response",
						},
						index: 0,
						finish_reason: null,
					},
				],
			};
			// Add usage information in the stream response
			yield {
				id: "test-id-2",
				created: 1678886401,
				model: "test-model",
				object: "chat.completion.chunk",
				choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30,
				},
			};
		})()

		// Mock OpenAI chat.completions.create
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
		const mockCreate = jest.spyOn(OpenAI.prototype.chat.completions, "create").mockImplementation(() => mockStream as any);

		const systemPrompt = "test system prompt"
		const messages: NeutralMessage[] = [{ role: "user", content: "test message" }];

		const generator = handler.createMessage(systemPrompt, messages)
		const chunks: ApiStreamChunk[] = [];

		for await (const chunk of generator) {
			chunks.push(chunk)
		}

		// Verify stream chunks
		expect(chunks).toHaveLength(2) // One text chunk and one usage chunk
		expect(chunks[0]).toEqual({
			type: "text",
			text: "test response",
		})
		expect(chunks[1]).toEqual({
			type: "usage",
			inputTokens: 10,
			outputTokens: 20,
			// totalCost: 0.001, // Removed as cost is no longer in mock usage
		})

		// Verify OpenAI client was called with correct parameters
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: mockOptions.openRouterModelId,
				temperature: 0,
				messages: expect.arrayContaining([ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
					{ role: "system", content: systemPrompt },
					{ role: "user", content: "test message" },
				]),
				stream: true,
			}),
		)
	})

	test("createMessage with middle-out transform enabled", async () => {
		const handler = new OpenRouterHandler({
			...mockOptions,
			openRouterUseMiddleOutTransform: true,
		})
		const mockStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> = (async function* () { // eslint-disable-line @typescript-eslint/require-await
			yield {
				id: "test-id-3",
				created: 1678886402,
				model: "test-model",
				object: "chat.completion.chunk",
				choices: [
					{
						delta: {
							content: "test response",
						},
						index: 0,
						finish_reason: "stop",
					},
				],
			};
		})()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
		const mockCreate = jest.spyOn(OpenAI.prototype.chat.completions, "create").mockImplementation(() => mockStream as any);
		;(axios.get as jest.Mock).mockResolvedValue({ data: { data: {} } })

		await handler.createMessage("test", []).next();

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				transforms: ["middle-out"],
			}),
		)
	})

	test("createMessage with Claude model adds cache control", async () => {
		const handler = new OpenRouterHandler({
			...mockOptions,
			openRouterModelId: "anthropic/claude-3.5-sonnet",
		})
		const mockStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> = (async function* () { // eslint-disable-line @typescript-eslint/require-await
			yield {
				id: "test-id-4",
				created: 1678886403,
				model: "test-model",
				object: "chat.completion.chunk",
				choices: [
					{
						delta: {
							content: "test response",
						},
						index: 0,
						finish_reason: "stop",
					},
				],
			};
		})()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
		const mockCreate = jest.spyOn(OpenAI.prototype.chat.completions, "create").mockImplementation(() => mockStream as any);
		;(axios.get as jest.Mock).mockResolvedValue({ data: { data: {} } })

		const messages: NeutralMessage[] = [
			{ role: "user", content: "message 1" },
			{ role: "assistant", content: "response 1" },
			{ role: "user", content: "message 2" },
		];

		await handler.createMessage("test system", messages).next();

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({  
				messages: expect.arrayContaining([ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
					expect.objectContaining({
						role: "system",
						content: expect.arrayContaining([ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
							expect.objectContaining({
								cache_control: { type: "ephemeral" },
							}),
						]),
					}),
				]),
			}),
		)
	})

	test("createMessage handles API errors", async () => {
		const handler = new OpenRouterHandler(mockOptions)
		const mockStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> = (async function* () { // eslint-disable-line @typescript-eslint/require-await
			throw new Error("API Error"); // Throw error directly from the stream
		})()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
		jest.spyOn(OpenAI.prototype.chat.completions, "create").mockImplementation(() => mockStream as any);

		const generator = handler.createMessage("test", [])
		await expect(generator.next()).rejects.toThrow("OpenRouter API Error 500: API Error")
	})

	test("completePrompt returns correct response", async () => {
		const handler = new OpenRouterHandler(mockOptions)
		const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
			id: "chatcmpl-test",
			choices: [{ message: { content: "test completion", role: "assistant", refusal: null }, finish_reason: "stop", index: 0, logprobs: null }],
			created: 1234567890,
			model: "test-model",
			object: "chat.completion",
		}

		const mockCreate = jest.spyOn(OpenAI.prototype.chat.completions, "create").mockResolvedValue(mockResponse)

		const result = await handler.completePrompt("test prompt")

		expect(result).toBe("test completion")

		expect(mockCreate).toHaveBeenCalledWith({
			model: mockOptions.openRouterModelId,
			max_tokens: 1000,
			thinking: undefined,
			temperature: 0,
			messages: [{ role: "user", content: "test prompt" }],
			stream: false,
		})
	})

	test("completePrompt handles API errors", async () => {
		const handler = new OpenRouterHandler(mockOptions)
		const mockError = new OpenAI.APIError(500, { error: { message: "API Error" } }, "API Error", {})

		jest.spyOn(OpenAI.prototype.chat.completions, "create").mockRejectedValue(mockError);

		await expect(handler.completePrompt("test prompt")).rejects.toThrow("OpenRouter API Error 500: API Error")
	})

        test("completePrompt handles unexpected errors", async () => {
                const handler = new OpenRouterHandler(mockOptions)
                jest.spyOn(OpenAI.prototype.chat.completions, "create").mockImplementation(() => { throw new Error("Unexpected error"); })

                await expect(handler.completePrompt("test prompt")).rejects.toThrow("Unexpected error")
        })

        test("createMessage processes OpenAI tool calls", async () => {
                const handler = new OpenRouterHandler(mockOptions)
                const mockStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> = (async function* () { // eslint-disable-line @typescript-eslint/require-await
                        yield {
                                id: "test-id-6",
                                created: 1678886405,
                                model: "test-model",
                                object: "chat.completion.chunk",
                                choices: [
                                        {
                                                delta: {
                                                        tool_calls: [
                                                                {
                                                                        index: 0,
                                                                        id: "call1",
                                                                        function: { name: "testTool", arguments: '{"foo":1}' },
                                                                },
                                                        ],
                                                },
                                                index: 0,
                                                finish_reason: null,
                                        },
                                ],
                        };
                })()

                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
                jest.spyOn(OpenAI.prototype.chat.completions, "create").mockImplementation(() => mockStream as any);
              
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const processSpy = jest.spyOn(handler as any, "processToolUse").mockResolvedValue({ result: "ok" });
              
                const generator = handler.createMessage("test", [])
                const chunks: ApiStreamChunk[] = []
                for await (const chunk of generator) {
                        chunks.push(chunk)
                }

                expect(processSpy).toHaveBeenCalledWith({ id: "call1", name: "testTool", input: { foo: 1 } })
                expect(chunks).toContainEqual({ type: "tool_result", id: "call1", content: { result: "ok" } })
        })
})
