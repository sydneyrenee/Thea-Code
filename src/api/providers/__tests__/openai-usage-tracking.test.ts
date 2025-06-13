/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"
import { NeutralMessage } from "../../../shared/neutral-history"
import { Readable } from "stream"
import openaiSetup, { openAIMock } from "../../../../test/openai-mock/setup.ts"
import { openaiTeardown } from "../../../../test/openai-mock/teardown.ts"

let requestBody: any

beforeEach(async () => {
	await openaiTeardown()
	await openaiSetup()
	requestBody = undefined
	;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", function (_uri, body) {
		requestBody = body
		if (!body.stream) {
			return [
				200,
				{
					id: "test-completion",
					choices: [
						{ message: { role: "assistant", content: "Test response" }, finish_reason: "stop", index: 0 },
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
			choices: [{ delta: { content: "Test " }, index: 0, finish_reason: null }],
			usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
		}
		const chunk2 = {
			id: "chatcmpl-test-2",
			created: 1678886401,
			model: "gpt-4",
			object: "chat.completion.chunk",
			choices: [{ delta: { content: "response" }, index: 0, finish_reason: null }],
			usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
		}
		const chunk3 = {
			id: "chatcmpl-test-3",
			created: 1678886402,
			model: "gpt-4",
			object: "chat.completion.chunk",
			choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		}
		stream.push(`data: ${JSON.stringify(chunk1)}\n\n`)
		stream.push(`data: ${JSON.stringify(chunk2)}\n\n`)
		stream.push(`data: ${JSON.stringify(chunk3)}\n\n`)
		stream.push("data: [DONE]\n\n")
		stream.push(null)
		return [200, stream]
	})
})

afterEach(async () => {
	await openaiTeardown()
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
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Check we have text chunks
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(2)
			expect(textChunks[0].text).toBe("Test ")
			expect(textChunks[1].text).toBe("response")

			// Check we only have one usage chunk and it's the last one
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(1)
			expect(usageChunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
			})

			// Check the usage chunk is the last one reported from the API
			const lastChunk = chunks[chunks.length - 1]
			expect(lastChunk.type).toBe("usage")
			expect(lastChunk.inputTokens).toBe(10)
			expect(lastChunk.outputTokens).toBe(5)

			expect(requestBody).toEqual(
				expect.objectContaining({
					model: mockOptions.openAiModelId,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello!" },
					],
					stream: true,
				}),
			)
		})

		it("should handle case where usage is only in the final chunk", async () => {
			await openaiTeardown()
			await openaiSetup()
			;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => {
				const stream = new Readable({ read() {} })
				const chunk1 = {
					id: "chatcmpl-test-4",
					created: 1678886403,
					model: "gpt-4",
					object: "chat.completion.chunk",
					choices: [{ delta: { content: "Test " }, index: 0, finish_reason: null }],
					usage: null,
				}
				const chunk2 = {
					id: "chatcmpl-test-5",
					created: 1678886404,
					model: "gpt-4",
					object: "chat.completion.chunk",
					choices: [{ delta: { content: "response" }, index: 0, finish_reason: null }],
					usage: null,
				}
				const chunk3 = {
					id: "chatcmpl-test-6",
					created: 1678886405,
					model: "gpt-4",
					object: "chat.completion.chunk",
					choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
					usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
				}
				stream.push(`data: ${JSON.stringify(chunk1)}\n\n`)
				stream.push(`data: ${JSON.stringify(chunk2)}\n\n`)
				stream.push(`data: ${JSON.stringify(chunk3)}\n\n`)
				stream.push("data: [DONE]\n\n")
				stream.push(null)
				return [200, stream]
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Check usage metrics
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(1)
			expect(usageChunks[0]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
			})
		})

		it("should handle case where no usage is provided", async () => {
			await openaiTeardown()
			await openaiSetup()
			;(openAIMock as any)!.addCustomEndpoint("POST", "/v1/chat/completions", () => {
				const stream = new Readable({ read() {} })
				const chunk1 = {
					id: "chatcmpl-test-7",
					created: 1678886406,
					model: "gpt-4",
					object: "chat.completion.chunk",
					choices: [{ delta: { content: "Test response" }, index: 0, finish_reason: null }],
					usage: null,
				}
				const chunk2 = {
					id: "chatcmpl-test-8",
					created: 1678886407,
					model: "gpt-4",
					object: "chat.completion.chunk",
					choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
					usage: null,
				}
				stream.push(`data: ${JSON.stringify(chunk1)}\n\n`)
				stream.push(`data: ${JSON.stringify(chunk2)}\n\n`)
				stream.push("data: [DONE]\n\n")
				stream.push(null)
				return [200, stream]
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Check we don't have any usage chunks
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(0)
		})
	})
})
