import { MistralHandler } from "../mistral"
import { ApiHandlerOptions } from "../../../shared/api"
import { NeutralConversationHistory, NeutralMessageContent } from "../../../shared/neutral-history"
import * as neutralMistralFormat from "../../transform/neutral-mistral-format"

// Mock the Mistral client
jest.mock("@mistralai/mistralai", () => {
	return {
		Mistral: jest.fn().mockImplementation(() => ({
			chat: {
				stream: jest.fn().mockImplementation(() => {
					return {
						[Symbol.asyncIterator]: function* () {
							yield {
								data: {
									choices: [
										{
											delta: {
												content: "Test response",
											},
										},
									],
									usage: {
										promptTokens: 10,
										completionTokens: 5,
									},
								},
							}
						},
					}
				}),
				complete: jest.fn().mockResolvedValue({
					choices: [
						{
							message: {
								content: "Test completion",
							},
						},
					],
				}),
			},
		})),
	}
})

// Mock the neutral-mistral-format module
jest.mock("../../transform/neutral-mistral-format", () => ({
	convertToMistralMessages: jest.fn().mockReturnValue([{ role: "user", content: "Test message" }]),
	convertToMistralContent: jest.fn().mockReturnValue("Test content"),
}))

describe("MistralHandler", () => {
	const options: ApiHandlerOptions = {
		mistralApiKey: "test-key",
		apiModelId: "mistral-medium",
	}

	let handler: MistralHandler

	beforeEach(() => {
		jest.clearAllMocks()
		handler = new MistralHandler(options)
	})

	describe("createMessage", () => {
		it("should convert neutral history to Mistral format and stream response", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "Hello" }],
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(neutralMistralFormat.convertToMistralMessages).toHaveBeenCalledWith(messages)
			expect(chunks).toHaveLength(2)
			expect(chunks[0]).toEqual({ type: "text", text: "Test response" })
			expect(chunks[1]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
			})
		})
	})

	describe("countTokens", () => {
		it("should use the base provider's implementation", async () => {
			// Mock the base provider's countTokens method
			const baseCountTokens = jest
				.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "countTokens")
				.mockResolvedValue(15)

			const content: NeutralMessageContent = [{ type: "text", text: "Hello" }]
			const result = await handler.countTokens(content)

			expect(baseCountTokens).toHaveBeenCalledWith(content)
			expect(result).toBe(15)
		})
	})

	describe("completePrompt", () => {
		it("should complete a prompt and return the response", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test completion")
		})
	})
})
