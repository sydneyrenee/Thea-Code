// import type { Anthropic } from "@anthropic-ai/sdk" // Unused
import type { NeutralConversationHistory } from "../../../shared/neutral-history" // NeutralMessageContent was unused
import type { ApiStreamChunk } from "../../transform/stream"
import OpenAI from "openai"
import { ApiHandlerOptions } from "../../../shared/api" // ModelInfo, requestyDefaultModelInfo were unused
import { RequestyHandler } from "../requesty"
import { convertToOpenAiHistory } from "../../transform/neutral-openai-format"
import { convertToR1Format } from "../../transform/r1-format"
import { API_REFERENCES } from "../../../../dist/thea-config" // Import branded constants
// Mock OpenAI and transform functions
jest.mock("openai")
jest.mock("../../transform/neutral-openai-format")
jest.mock("../../transform/r1-format")

describe("RequestyHandler", () => {
	let handler: RequestyHandler
	let mockCreate: jest.Mock

	const defaultOptions: ApiHandlerOptions = {
		requestyApiKey: "test-key",
		requestyModelId: "test-model",
		requestyModelInfo: {
			maxTokens: 8192,
			contextWindow: 200_000,
			supportsImages: true,
			supportsComputerUse: true,
			supportsPromptCache: true,
			inputPrice: 3.0,
			outputPrice: 15.0,
			cacheWritesPrice: 3.75,
			cacheReadsPrice: 0.3,
			description:
				"Claude 3.7 Sonnet is an advanced large language model with improved reasoning, coding, and problem-solving capabilities. It introduces a hybrid reasoning approach, allowing users to choose between rapid responses and extended, step-by-step processing for complex tasks. The model demonstrates notable improvements in coding, particularly in front-end development and full-stack updates, and excels in agentic workflows, where it can autonomously navigate multi-step processes. Claude 3.7 Sonnet maintains performance parity with its predecessor in standard mode while offering an extended reasoning mode for enhanced accuracy in math, coding, and instruction-following tasks. Read more at the [blog post here](https://www.anthropic.com/news/claude-3-7-sonnet)",
		},
		openAiStreamingEnabled: true,
		includeMaxTokens: true, // Add this to match the implementation
	}

	beforeEach(() => {
		// Clear mocks
		jest.clearAllMocks()

		// Setup mock create function
		mockCreate = jest.fn()

		// Mock OpenAI constructor
		;(OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
			() =>
				({
					chat: {
						completions: {
							create: mockCreate,
						},
					},
				}) as unknown as OpenAI,
		)

		// Mock transform functions
		;(convertToOpenAiHistory as jest.Mock).mockImplementation((messages: any) => messages) // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
		;(convertToR1Format as jest.Mock).mockImplementation((messages: any) => messages) // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return

		// Create handler instance
		handler = new RequestyHandler(defaultOptions)
	})

	describe("constructor", () => {
		it("should initialize with correct options", () => {
			expect(OpenAI).toHaveBeenCalledWith({
				baseURL: "https://router.requesty.ai/v1",
				apiKey: defaultOptions.requestyApiKey,
				defaultHeaders: {
					"HTTP-Referer": API_REFERENCES.HOMEPAGE,
					"X-Title": API_REFERENCES.APP_TITLE,
				},
			})
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant"
		const messages: NeutralConversationHistory = [{ role: "user", content: [{ type: "text", text: "Hello" }] }]

		describe("with streaming enabled", () => {
			beforeEach(() => {
				const stream = {
					[Symbol.asyncIterator]: function* () {
						yield {
							choices: [{ delta: { content: "Hello" } }],
						}
						yield {
							choices: [{ delta: { content: " world" } }],
							usage: {
								prompt_tokens: 30,
								completion_tokens: 10,
								prompt_tokens_details: {
									cached_tokens: 15,
									caching_tokens: 5,
								},
							},
						}
					},
				}
				mockCreate.mockResolvedValue(stream)
			})

			it("should handle streaming response correctly", async () => {
				const stream = handler.createMessage(systemPrompt, messages)
				const results: ApiStreamChunk[] = []

				for await (const chunk of stream) {
					results.push(chunk)
				}

				expect(results).toEqual([
					{ type: "text", text: "Hello" },
					{ type: "text", text: " world" },
					{
						type: "usage",
						inputTokens: 30,
						outputTokens: 10,
						cacheWriteTokens: 5,
						cacheReadTokens: 15,
						totalCost: 0.00020325000000000003, // (10 * 3 / 1,000,000) + (5 * 3.75 / 1,000,000) + (15 * 0.3 / 1,000,000) + (10 * 15 / 1,000,000) (the ...0 is a fp skew)
					},
				])

				expect(mockCreate).toHaveBeenCalledWith({
					model: defaultOptions.requestyModelId,
					temperature: 0,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello" },
					],
					stream: true,
					stream_options: { include_usage: true },
					max_tokens: defaultOptions.requestyModelInfo?.maxTokens,
				})
			})

			it("should not include max_tokens when includeMaxTokens is false", async () => {
				handler = new RequestyHandler({
					...defaultOptions,
					includeMaxTokens: false,
				})

				await handler.createMessage(systemPrompt, messages).next()

				expect(mockCreate).toHaveBeenCalledWith(
					expect.not.objectContaining({
						max_tokens: expect.any(Number), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
					}),
				)
			})
		})

		describe("with streaming disabled", () => {
			beforeEach(() => {
				handler = new RequestyHandler({
					...defaultOptions,
					openAiStreamingEnabled: false,
				})

				mockCreate.mockResolvedValue({
					choices: [{ message: { content: "Hello world" } }],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 5,
					},
				})
			})

			it("should handle non-streaming response correctly", async () => {
				const stream = handler.createMessage(systemPrompt, messages)
				const results: ApiStreamChunk[] = []

				for await (const chunk of stream) {
					results.push(chunk)
				}

				expect(results).toEqual([
					{ type: "text", text: "Hello world" },
					{
						type: "usage",
						inputTokens: 10,
						outputTokens: 5,
						cacheWriteTokens: 0,
						cacheReadTokens: 0,
						totalCost: 0.000105, // (10 * 3 / 1,000,000) + (5 * 15 / 1,000,000)
					},
				])

				expect(mockCreate).toHaveBeenCalledWith({
					model: defaultOptions.requestyModelId,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello" },
					],
				})
			})
		})
	})

	describe("getModel", () => {
		it("should return correct model information", () => {
			const result = handler.getModel()
			expect(result).toEqual({
				id: defaultOptions.requestyModelId,
				info: defaultOptions.requestyModelInfo,
			})
		})

		it("should use sane defaults when no model info provided", () => {
			handler = new RequestyHandler({
				...defaultOptions,
				requestyModelInfo: undefined,
			})

			const result = handler.getModel()
			expect(result).toEqual({
				id: defaultOptions.requestyModelId,
				info: defaultOptions.requestyModelInfo,
			})
		})
	})

	describe("completePrompt", () => {
		beforeEach(() => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "Completed response" } }],
			})
		})

		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Completed response")

			expect(mockCreate).toHaveBeenCalledWith({
				model: defaultOptions.requestyModelId,
				messages: [{ role: "user", content: "Test prompt" }],
				max_tokens: expect.any(Number), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
				temperature: expect.any(Number), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
				stream: false, // Expect stream to be false
			})
		})

		it("should handle errors correctly", async () => {
			const errorMessage = "API error"
			mockCreate.mockRejectedValue(new Error(errorMessage))

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				errorMessage, // OpenAiHandler.completePrompt throws the original error message
			)
		})
	})
})
