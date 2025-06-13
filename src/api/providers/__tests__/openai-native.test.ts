import { OpenAiNativeHandler } from "../openai-native"
import { ApiHandlerOptions } from "../../../shared/api"
import { NeutralMessage } from "../../../shared/neutral-history"
import {
	ApiStreamTextChunk,
	ApiStreamUsageChunk,
	ApiStreamReasoningChunk,
	ApiStreamToolUseChunk,
	ApiStreamToolResultChunk,
} from "../../transform/stream"
import { Readable } from "stream"
import openaiSetup, { openAIMock } from "../../../../test/openai-mock/setup.ts"
import { openaiTeardown } from "../../../../test/openai-mock/teardown.ts"

// Define types for openAI mock
interface OpenAIMockInstance {
	addCustomEndpoint: (
		method: string,
		path: string,
		handler: (uri: string, body: Record<string, unknown>) => unknown,
	) => void
}

// Define types for streamed chunks
type StreamChunk =
	| ApiStreamTextChunk
	| ApiStreamUsageChunk
	| ApiStreamReasoningChunk
	| ApiStreamToolUseChunk
	| ApiStreamToolResultChunk

let requestBody: Record<string, unknown> | undefined

beforeEach(async () => {
	await openaiTeardown()
	await openaiSetup()
	requestBody = undefined

	const mockInstance = openAIMock as unknown as OpenAIMockInstance
	mockInstance.addCustomEndpoint(
		"POST",
		"/v1/chat/completions",
		function (_uri: string, body: Record<string, unknown>) {
			requestBody = body
			const typedBody = body as { stream?: boolean }
			if (!typedBody.stream) {
				return [
					200,
					{
						id: "test-completion",
						choices: [
							{
								message: { role: "assistant", content: "Test response" },
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
				choices: [{ delta: { content: "Test response" }, index: 0 }],
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
		},
	)
})

afterEach(async () => {
	await openaiTeardown()
})

describe("OpenAiNativeHandler", () => {
	let handler: OpenAiNativeHandler
	let mockOptions: ApiHandlerOptions
	const systemPrompt = "You are a helpful assistant."
	const messages: NeutralMessage[] = [
		{
			role: "user",
			content: "Hello!",
		},
	]

	beforeEach(() => {
		mockOptions = {
			apiModelId: "gpt-4o",
			openAiNativeApiKey: "test-api-key",
		}
		handler = new OpenAiNativeHandler(mockOptions)
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(OpenAiNativeHandler)
			expect(handler.getModel().id).toBe(mockOptions.apiModelId)
		})

		it("should initialize with empty API key", () => {
			const handlerWithoutKey = new OpenAiNativeHandler({
				apiModelId: "gpt-4o",
				openAiNativeApiKey: "",
			})
			expect(handlerWithoutKey).toBeInstanceOf(OpenAiNativeHandler)
		})
	})

	describe("createMessage", () => {
		it("should handle streaming responses", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: StreamChunk[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk): chunk is ApiStreamTextChunk => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Test response")
		})

		it("should handle API errors", async () => {
			await openaiTeardown()
			await openaiSetup()
			const mockInstance = openAIMock as unknown as OpenAIMockInstance;
			mockInstance.addCustomEndpoint("POST", "/v1/chat/completions", () => [
				500,
				{ error: { message: "API Error" } },
			])

			const stream = handler.createMessage(systemPrompt, messages)
			await expect(async () => {
				for await (const chunk of stream) {
					// should not produce chunks
					void chunk;
				}
			}).rejects.toThrow("API Error")
		})

		it("should handle missing content in response for o1 model", async () => {
			handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "o1",
			})

			await openaiTeardown()
			await openaiSetup()
			const mockInstance = openAIMock as unknown as OpenAIMockInstance;
			mockInstance.addCustomEndpoint("POST", "/v1/chat/completions", () => {
				const stream = new Readable({ read() {} })
				const chunk = {
					id: "chatcmpl-o1-1",
					created: 1678886400,
					model: "o1",
					object: "chat.completion.chunk",
					choices: [{ delta: { content: null }, index: 0 }],
					usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
				}
				stream.push(`data: ${JSON.stringify(chunk)}\n\n`)
				stream.push("data: [DONE]\n\n")
				stream.push(null)
				return [200, stream]
			})

			const generator = handler.createMessage(systemPrompt, messages)
			const results = []
			for await (const result of generator) {
				results.push(result)
			}

			expect(results).toEqual([{ type: "usage", inputTokens: 0, outputTokens: 0 }])

			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "o1",
					messages: [
						{ role: "developer", content: "Formatting re-enabled\n" + systemPrompt },
						{ role: "user", content: "Hello!" },
					],
					stream: true,
					stream_options: { include_usage: true },
				}),
			)
		})

		it("should handle o3-mini model family correctly", async () => {
			handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "o3-mini",
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: StreamChunk[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "o3-mini",
					messages: [
						{ role: "developer", content: "Formatting re-enabled\n" + systemPrompt },
						{ role: "user", content: "Hello!" },
					],
					stream: true,
					stream_options: { include_usage: true },
					reasoning_effort: "medium",
				}),
			)
		})
	})

	describe("streaming models", () => {
		beforeEach(() => {
			handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "gpt-4o",
			})
		})

		it("should handle streaming response", async () => {
			await openaiTeardown()
			await openaiSetup()
			;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => {
				const stream = new Readable({ read() {} })
				const mockStream = [
					{ choices: [{ delta: { content: "Hello" } }], usage: null },
					{ choices: [{ delta: { content: " there" } }], usage: null },
					{ choices: [{ delta: { content: "!" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
				]
				for (const chunk of mockStream) {
					stream.push(
						`data: ${JSON.stringify({
							id: "chunk",
							created: 0,
							model: "gpt-4o",
							object: "chat.completion.chunk",
							...chunk,
						})}\n\n`,
					)
				}
				stream.push("data: [DONE]\n\n")
				stream.push(null)
				return [200, stream]
			})

			const generator = handler.createMessage(systemPrompt, messages)
			const results = []
			for await (const result of generator) {
				results.push(result)
			}

			expect(results).toEqual([
				{ type: "text", text: "Hello" },
				{ type: "text", text: " there" },
				{ type: "text", text: "!" },
				{ type: "usage", inputTokens: 10, outputTokens: 5 },
			])

			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "gpt-4o",
					temperature: 0,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello!" },
					],
					stream: true,
					stream_options: { include_usage: true },
				}),
			)
		})

		it("should handle empty delta content", async () => {
			await openaiTeardown()
			await openaiSetup()
			;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => {
				const stream = new Readable({ read() {} })
				const mockStream = [
					{ choices: [{ delta: {} }], usage: null },
					{ choices: [{ delta: { content: null } }], usage: null },
					{ choices: [{ delta: { content: "Hello" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
				]
				for (const chunk of mockStream) {
					stream.push(
						`data: ${JSON.stringify({ id: "chunk", created: 0, model: "gpt-4o", object: "chat.completion.chunk", ...chunk })}\n\n`,
					)
				}
				stream.push("data: [DONE]\n\n")
				stream.push(null)
				return [200, stream]
			})

			const generator = handler.createMessage(systemPrompt, messages)
			const results = []
			for await (const result of generator) {
				results.push(result)
			}

			expect(results).toEqual([
				{ type: "text", text: "Hello" },
				{ type: "usage", inputTokens: 10, outputTokens: 5 },
			])
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully with gpt-4o model", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "gpt-4o",
					messages: [{ role: "user", content: "Test prompt" }],
					temperature: 0,
				}),
			)
		})

		it("should complete prompt successfully with o1 model", async () => {
			handler = new OpenAiNativeHandler({
				apiModelId: "o1",
				openAiNativeApiKey: "test-api-key",
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "o1",
					messages: [{ role: "user", content: "Test prompt" }],
				}),
			)
		})

		it("should complete prompt successfully with o1-preview model", async () => {
			handler = new OpenAiNativeHandler({
				apiModelId: "o1-preview",
				openAiNativeApiKey: "test-api-key",
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "o1-preview",
					messages: [{ role: "user", content: "Test prompt" }],
				}),
			)
		})

		it("should complete prompt successfully with o1-mini model", async () => {
			handler = new OpenAiNativeHandler({
				apiModelId: "o1-mini",
				openAiNativeApiKey: "test-api-key",
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "o1-mini",
					messages: [{ role: "user", content: "Test prompt" }],
				}),
			)
		})

		it("should complete prompt successfully with o3-mini model", async () => {
			handler = new OpenAiNativeHandler({
				apiModelId: "o3-mini",
				openAiNativeApiKey: "test-api-key",
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(requestBody).toEqual(
				expect.objectContaining({
					model: "o3-mini",
					messages: [{ role: "user", content: "Test prompt" }],
					reasoning_effort: "medium",
				}),
			)
		})

		it("should handle API errors", async () => {
			await openaiTeardown()
			await openaiSetup()
			;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => [
				500,
				{ error: { message: "API Error" } },
			])
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"OpenAI Native completion error: API Error",
			)
		})

		it("should handle empty response", async () => {
			await openaiTeardown()
			await openaiSetup()
			;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => [
				200,
				{ choices: [{ message: { content: "" } }] },
			])
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return model info", () => {
			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe(mockOptions.apiModelId)
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.maxTokens).toBe(16384)
			expect(modelInfo.info.contextWindow).toBe(128_000)
		})

		it("should handle undefined model ID", () => {
			const handlerWithoutModel = new OpenAiNativeHandler({
				openAiNativeApiKey: "test-api-key",
			})
			const modelInfo = handlerWithoutModel.getModel()
			expect(modelInfo.id).toBe("gpt-4o") // Default model
			expect(modelInfo.info).toBeDefined()
		})
	})
})
