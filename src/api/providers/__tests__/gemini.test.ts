import { GeminiHandler } from "../gemini"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../../shared/neutral-history"

// Mock the Google Generative AI SDK
jest.mock("@google/generative-ai", () => ({
	GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
		getGenerativeModel: jest.fn().mockReturnValue({
			generateContentStream: jest.fn(),
			generateContent: jest.fn().mockResolvedValue({
				response: {
					text: () => "Test response",
				},
			}),
		}),
	})),
}))

describe("GeminiHandler", () => {
	let handler: GeminiHandler

	beforeEach(() => {
		handler = new GeminiHandler({
			apiKey: "test-key",
			apiModelId: "gemini-2.0-flash-thinking-exp-1219",
			geminiApiKey: "test-key",
		})
	})

	describe("constructor", () => {
		it("should initialize with provided config", () => {
			expect(handler["options"].geminiApiKey).toBe("test-key")
			expect(handler["options"].apiModelId).toBe("gemini-2.0-flash-thinking-exp-1219")
		})

		it.skip("should throw if API key is missing", () => {
			expect(() => {
				new GeminiHandler({
					apiModelId: "gemini-2.0-flash-thinking-exp-1219",
					geminiApiKey: "",
				})
			}).toThrow("API key is required for Google Gemini")
		})
	})

	describe("createMessage", () => {
		const mockMessages: NeutralConversationHistory = [
			{
				role: "user",
				content: [{ type: "text", text: "Hello" }],
			},
			{
				role: "assistant",
				content: [{ type: "text", text: "Hi there!" }],
			},
		]

		const systemPrompt = "You are a helpful assistant"

		it("should handle text messages correctly", async () => {
			// Mock the stream response
			const mockStream = {
				stream: [{ text: () => "Hello" }, { text: () => " world!" }],
				response: {
					usageMetadata: {
						promptTokenCount: 10,
						candidatesTokenCount: 5,
					},
				},
			}

			// Setup the mock implementation
			const mockGenerateContentStream = jest.fn().mockResolvedValue(mockStream)

			;(handler["client"] as unknown as { type: string }).getGenerativeModel = jest.fn().mockReturnValue({
				generateContentStream: mockGenerateContentStream,
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have 3 chunks: 'Hello', ' world!', and usage info
			expect(chunks.length).toBe(3)
			expect(chunks[0]).toEqual({
				type: "text",
				text: "Hello",
			})
			expect(chunks[1]).toEqual({
				type: "text",
				text: " world!",
			})
			expect(chunks[2]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
			})

			// Verify the model configuration

			expect((handler["client"] as unknown as { type: string }).getGenerativeModel).toHaveBeenCalledWith(
				{
					model: "gemini-2.0-flash-thinking-exp-1219",
					systemInstruction: systemPrompt,
				},
				{
					baseUrl: undefined,
				},
			)

			// Verify generation config
			expect(mockGenerateContentStream).toHaveBeenCalledWith(
				expect.objectContaining({
					generationConfig: {
						temperature: 0,
					},
				}),
			)
		})

		it("should handle API errors", async () => {
			const mockError = new Error("Gemini API error")
			const mockGenerateContentStream = jest.fn().mockRejectedValue(mockError)

			;(handler["client"] as unknown as { type: string }).getGenerativeModel = jest.fn().mockReturnValue({
				generateContentStream: mockGenerateContentStream,
			})

			const stream = handler.createMessage(systemPrompt, mockMessages)

			await expect(async () => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				for await (const _chunk of stream) {
					// Should throw before yielding any chunks
				}
			}).rejects.toThrow("Gemini API error")
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const mockGenerateContent = jest.fn().mockResolvedValue({
				response: {
					text: () => "Test response",
				},
			})

			;(handler["client"] as unknown as { type: string }).getGenerativeModel = jest.fn().mockReturnValue({
				generateContent: mockGenerateContent,
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")

			expect((handler["client"] as unknown as { type: string }).getGenerativeModel).toHaveBeenCalledWith(
				{
					model: "gemini-2.0-flash-thinking-exp-1219",
				},
				{
					baseUrl: undefined,
				},
			)
			expect(mockGenerateContent).toHaveBeenCalledWith({
				contents: [{ role: "user", parts: [{ text: "Test prompt" }] }],
				generationConfig: {
					temperature: 0,
				},
			})
		})

		it("should handle API errors", async () => {
			const mockError = new Error("Gemini API error")
			const mockGenerateContent = jest.fn().mockRejectedValue(mockError)

			;(handler["client"] as unknown as { type: string }).getGenerativeModel = jest.fn().mockReturnValue({
				generateContent: mockGenerateContent,
			})

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"Gemini completion error: Gemini API error",
			)
		})

		it("should handle empty response", async () => {
			const mockGenerateContent = jest.fn().mockResolvedValue({
				response: {
					text: () => "",
				},
			})

			;(handler["client"] as unknown as { type: string }).getGenerativeModel = jest.fn().mockReturnValue({
				generateContent: mockGenerateContent,
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return correct model info", () => {
			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe("gemini-2.0-flash-thinking-exp-1219")
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.maxTokens).toBe(8192)
			expect(modelInfo.info.contextWindow).toBe(32_767)
		})

		it("should return default model if invalid model specified", () => {
			const invalidHandler = new GeminiHandler({
				apiModelId: "invalid-model",
				geminiApiKey: "test-key",
			})
			const modelInfo = invalidHandler.getModel()
			expect(modelInfo.id).toBe("gemini-2.0-flash-001") // Default model
		})
	})

	describe("countTokens", () => {
		it("should count tokens for text content", async () => {
			// Mock the base provider's countTokens method
			const mockBaseCountTokens = jest
				.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "countTokens")
				.mockResolvedValue(10)

			// Create neutral content for testing
			const neutralContent = [{ type: "text" as const, text: "Test message" }]

			// Call the method
			const result = await handler.countTokens(neutralContent)

			// Verify the result
			expect(result).toBe(10)

			// Verify the base method was called with the original neutral content
			expect(mockBaseCountTokens).toHaveBeenCalledWith(neutralContent)

			// Restore the original implementation
			mockBaseCountTokens.mockRestore()
		})

		it("should handle mixed content including images", async () => {
			// Mock the base provider's countTokens method
			const mockBaseCountTokens = jest
				.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "countTokens")
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				.mockImplementation(((content: NeutralMessageContent) => {
					// Return 5 tokens for text content
					if (Array.isArray(content) && content.length === 1 && content[0].type === "text") {
						return 5
					}
					return 0
				}) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

			// Create mixed content with text and image
			const mixedContent: NeutralMessageContent = [
				// Explicitly type as NeutralMessageContent
				{ type: "text" as const, text: "Test message" },
				{
					type: "image_base64" as const, // Changed from "image" to "image_base64"
					source: {
						type: "base64" as const,
						media_type: "image/png",
						data: "base64data",
					},
				},
			]

			// Call the method
			const result = await handler.countTokens(mixedContent)

			// Verify the result (5 for text + 258 for image)
			expect(result).toBe(263)

			// Restore the original implementation
			mockBaseCountTokens.mockRestore()
		})

		it("should handle tool use content", async () => {
			// Mock the base provider's countTokens method
			const mockBaseCountTokens = jest
				.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "countTokens")
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				.mockImplementation(((content: NeutralMessageContent) => {
					// Return 15 tokens for the JSON string representation
					if (Array.isArray(content) && content.length === 1 && content[0].type === "text") {
						return 15
					}
					return 0
				}) as any) // eslint-disable-line @typescript-eslint/no-explicit-any

			// Create tool use content
			const toolUseContent = [
				{
					type: "tool_use" as const,
					id: "calculator-123",
					name: "calculator",
					input: { a: 5, b: 10, operation: "add" },
				},
			]

			// Call the method
			const result = await handler.countTokens(toolUseContent)

			// Verify the result
			expect(result).toBe(15)

			// Restore the original implementation
			mockBaseCountTokens.mockRestore()
		})

		it("should handle errors by falling back to base implementation", async () => {
			// Mock the implementation to throw an error first time, then succeed second time
			const mockBaseCountTokens = jest
				.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "countTokens")
				.mockResolvedValue(8)

			// Create a spy on console.warn
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()

			// Create content that will cause an error in our custom logic
			const content = [{ type: "text" as const, text: "Test content" }]

			// Force an error in the try block
			const mockError = new Error("Test error")
			mockBaseCountTokens.mockImplementationOnce(() => {
				throw mockError
			})

			// Call the method (this will throw and then call the original)
			const result = await handler.countTokens(content)

			// Verify the warning was logged
			expect(consoleWarnSpy).toHaveBeenCalledWith("Gemini token counting error, using fallback", mockError)

			// Verify the result from the fallback
			expect(result).toBe(8)

			// Restore the original implementations
			mockBaseCountTokens.mockRestore()
			consoleWarnSpy.mockRestore()
		})
	})
})
