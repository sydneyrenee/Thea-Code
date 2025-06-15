/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"
import type { NeutralConversationHistory } from "../../../shared/neutral-history"
import { API_REFERENCES } from "../../../../dist/thea-config" // Import branded constants
import { Readable } from "stream"
import openaiSetup, { openAIMock } from "../../../../test/openai-mock/setup.ts"
import { openaiTeardown } from "../../../../test/openai-mock/teardown.ts"

let requestBody: any
let capturedHeaders: Record<string, string | string[]> = {}

beforeEach(async () => {
	await openaiTeardown()
	await openaiSetup()
	requestBody = undefined
	capturedHeaders = {};
	(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", function (_uri: any, body: any) {
		// `this` is the nock request
		// @ts-expect-error req is provided by nock
		capturedHeaders = this.req.headers as Record<string, string | string[]>
		requestBody = body

		if (!body.stream) {
			return [
				200,
				{
					id: "test-completion",
					choices: [
						{
							message: { role: "assistant", content: "Test response", refusal: null },
							logprobs: null,
							finish_reason: "stop",
							index: 0,
						},
					],
					usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
				},
			]
		}

		const stream = new Readable({ read() {} })
		const chunk1 = {
			id: "chatcmpl-test-1",
			created: 1678886400,
			model: "gpt-4",
			object: "chat.completion.chunk",
			choices: [{ delta: { content: "Test response" }, index: 0, finish_reason: "stop", logprobs: null }],
			usage: null,
		}
		const chunk2 = {
			id: "chatcmpl-test-2",
			created: 1678886401,
			model: "gpt-4",
			object: "chat.completion.chunk",
			choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		}
		stream.push(`data: ${JSON.stringify(chunk1)}\n\n`)
		stream.push(`data: ${JSON.stringify(chunk2)}\n\n`)
		stream.push("data: [DONE]\n\n")
		stream.push(null)
		return [200, stream]
	})
})

afterEach(async () => {
	await openaiTeardown()
})

describe("OpenAiHandler", () => {
	let handler: OpenAiHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			openAiApiKey: "test-api-key",
			openAiModelId: "gpt-4",
			openAiBaseUrl: "https://api.openai.com/v1",
		}
		handler = new OpenAiHandler(mockOptions)
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(OpenAiHandler)
			expect(handler.getModel().id).toBe(mockOptions.openAiModelId)
		})

		it("should use custom base URL if provided", () => {
			const customBaseUrl = "https://custom.openai.com/v1"
			const handlerWithCustomUrl = new OpenAiHandler({
				...mockOptions,
				openAiBaseUrl: customBaseUrl,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(OpenAiHandler)
		})

		it("should set default headers correctly", async () => {
			await handler.completePrompt("Hi")
			expect(capturedHeaders["http-referer"]).toBe(API_REFERENCES.HOMEPAGE)
			expect(capturedHeaders["x-title"]).toBe(API_REFERENCES.APP_TITLE)
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: NeutralConversationHistory = [
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

		it("should handle non-streaming mode", async () => {
			const handler = new OpenAiHandler({
				...mockOptions,
				openAiStreamingEnabled: false,
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunk = chunks.find((chunk) => chunk.type === "text")
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")

			expect(textChunk).toBeDefined()
			expect(textChunk?.text).toBe("Test response")
			expect(usageChunk).toBeDefined()
			expect(usageChunk?.inputTokens).toBe(10)
			expect(usageChunk?.outputTokens).toBe(5)
		})

		it("should handle streaming responses", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Test response")
		})
	})

	describe("error handling", () => {
		const testMessages: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Hello",
					},
				],
			},
		]

	it("should handle API errors", async () => {
		await openaiTeardown()
		await openaiSetup();
		(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => [
			500,
			{ error: { message: "API Error" } },
		])

		const stream = handler.createMessage("system prompt", testMessages)

			await expect(async () => {
				for await (const chunk of stream) {
					void chunk
				}
			}).rejects.toThrow("API Error")
		})

	it("should handle rate limiting", async () => {
		await openaiTeardown()
		await openaiSetup();
		(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => [
			429,
			{ error: { message: "Rate limit exceeded" } },
		])

		const stream = handler.createMessage("system prompt", testMessages)

			await expect(async () => {
				for await (const chunk of stream) {
					void chunk
				}
			}).rejects.toThrow("Rate limit exceeded")
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(requestBody).toEqual(
				expect.objectContaining({
					model: mockOptions.openAiModelId,
					messages: [{ role: "user", content: "Test prompt" }],
					max_tokens: expect.any(Number),
					temperature: expect.any(Number),
					stream: false,
				}),
			)
		})

	it("should handle API errors", async () => {
		await openaiTeardown()
		await openaiSetup();
		(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => [
			500,
			{ error: { message: "API Error" } },
		])

		await expect(handler.completePrompt("Test prompt")).rejects.toThrow("OpenAI completion error: API Error")
	})

		it("should handle empty response", async () => {
			await openaiTeardown()
			await openaiSetup()(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => [
				200,
				{ choices: [{ message: { content: "" } }] },
			])
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return model info with sane defaults", () => {
			const model = handler.getModel()
			expect(model.id).toBe(mockOptions.openAiModelId)
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(128_000)
			expect(model.info.supportsImages).toBe(true)
		})

		it("should handle undefined model ID", () => {
			const handlerWithoutModel = new OpenAiHandler({
				...mockOptions,
				openAiModelId: undefined,
			})
			const model = handlerWithoutModel.getModel()
			expect(model.id).toBe("")
			expect(model.info).toBeDefined()
		})
	})

	describe("Tool Use Detection", () => {
		it("should extract tool calls from delta", () => {
			const delta = {
				tool_calls: [
					{
						index: 0,
						id: "call_123",
						function: {
							name: "test_tool",
							arguments: '{"param":"value"}',
						},
					},
				],
			}

			const toolCalls = handler.extractToolCalls(delta)

			expect(toolCalls).toEqual(delta.tool_calls)
		})

		it("should return empty array if no tool calls", () => {
			const delta = {
				content: "Hello",
			}

			const toolCalls = handler.extractToolCalls(delta)

			expect(toolCalls).toEqual([])
		})

		it("should detect if delta has tool calls", () => {
			const delta = {
				tool_calls: [
					{
						index: 0,
						id: "call_123",
						function: {
							name: "test_tool",
							arguments: '{"param":"value"}',
						},
					},
				],
			}

			const hasToolCalls = handler.hasToolCalls(delta)

			expect(hasToolCalls).toBe(true)
		})

		it("should detect if delta has no tool calls", () => {
			const delta = {
				content: "Hello",
			}

			const hasToolCalls = handler.hasToolCalls(delta)

			expect(hasToolCalls).toBe(false)
		})
	})
})
