import { VertexHandler } from "../vertex"
import { ApiHandlerOptions } from "../../../shared/api"
import { NeutralConversationHistory, NeutralMessageContent } from "../../../shared/neutral-history"
import * as neutralVertexFormat from "../../transform/neutral-vertex-format"

// Mock the Vertex AI SDK
jest.mock("@google-cloud/vertexai", () => {
	return {
		VertexAI: jest.fn().mockImplementation(() => ({
			getGenerativeModel: jest.fn().mockImplementation(() => ({
				generateContentStream: jest.fn().mockImplementation(() => {
					return {
						stream: {
							[Symbol.asyncIterator]: function* () {
								yield {
									candidates: [
										{
											content: {
												parts: [{ text: "Test response" }],
											},
										},
									],
								}
							},
						},
						response: {
							usageMetadata: {
								promptTokenCount: 10,
								candidatesTokenCount: 5,
							},
						},
					}
				}),
				generateContent: jest.fn().mockResolvedValue({
					response: {
						candidates: [
							{
								content: {
									parts: [{ text: "Test completion" }],
								},
							},
						],
					},
				}),
			})),
		})),
	}
})

// Mock the neutral-vertex-format module
jest.mock("../../transform/neutral-vertex-format", () => ({
	convertToVertexClaudeHistory: jest
		.fn()
		.mockReturnValue([{ role: "user", content: [{ type: "text", text: "Test message" }] }]),
	convertToVertexGeminiHistory: jest.fn().mockReturnValue([{ role: "user", parts: [{ text: "Test message" }] }]),
	formatMessageForCache: jest.fn().mockImplementation((msg: any) => msg), // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
	convertToVertexClaudeContentBlocks: jest.fn().mockReturnValue([{ type: "text", text: "Test content" }]),
}))

describe("VertexHandler", () => {
	describe("Claude model", () => {
		const options: ApiHandlerOptions = {
			vertexProjectId: "test-project",
			vertexRegion: "us-central1",
			apiModelId: "claude-3-sonnet@20240229",
		}

		let handler: VertexHandler

		beforeEach(() => {
			jest.clearAllMocks()
			handler = new VertexHandler(options)
		})

		describe("createMessage", () => {
			it("should convert neutral history to Vertex Claude format and stream response", async () => {
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

				expect(neutralVertexFormat.convertToVertexClaudeHistory).toHaveBeenCalledWith(messages)
				expect(chunks.length).toBeGreaterThan(0)
				expect(chunks[0]).toEqual({
					type: "usage",
					inputTokens: 10,
					outputTokens: 0,
				})
				expect(chunks[1]).toEqual({ type: "text", text: "Test response" })
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
	})

	describe("Gemini model", () => {
		const options: ApiHandlerOptions = {
			vertexProjectId: "test-project",
			vertexRegion: "us-central1",
			apiModelId: "gemini-1.5-pro",
		}

		let handler: VertexHandler

		beforeEach(() => {
			jest.clearAllMocks()
			handler = new VertexHandler(options)
		})

		describe("createMessage", () => {
			it("should convert neutral history to Vertex Gemini format and stream response", async () => {
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

				expect(neutralVertexFormat.convertToVertexGeminiHistory).toHaveBeenCalledWith(messages)
				expect(chunks.length).toBeGreaterThan(0)
				expect(chunks[0]).toEqual({ type: "text", text: "Test response" })
				expect(chunks[1]).toEqual({
					type: "usage",
					inputTokens: 10,
					outputTokens: 5,
				})
			})
		})

		describe("completePrompt", () => {
			it("should complete a prompt and return the response", async () => {
				const result = await handler.completePrompt("Test prompt")
				expect(result).toBe("Test completion")
			})
		})
	})
})
