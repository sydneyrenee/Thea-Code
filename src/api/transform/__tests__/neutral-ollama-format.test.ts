import {
	convertToOllamaHistory,
	convertToOllamaContentBlocks,
	convertToNeutralHistoryFromOllama,
} from "../neutral-ollama-format"
import type {
	NeutralConversationHistory,
	NeutralMessageContent,
	NeutralTextContentBlock,
} from "../../../shared/neutral-history"
import OpenAI from "openai"

describe("neutral-ollama-format", () => {
	describe("convertToOllamaHistory", () => {
		// Test case 1: Simple user message
		it("should convert a simple user message", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "What is the capital of France?" },
			]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 2: System + User messages
		it("should convert system and user messages", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "system",
					content: [{ type: "text", text: "You are a helpful assistant." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "system", content: "You are a helpful assistant." },
				{ role: "user", content: "What is the capital of France?" },
			]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 3: User + Assistant + User messages
		it("should convert multi-turn conversations", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "The capital of France is Paris." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "What is its population?" }],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "What is the capital of France?" },
				{ role: "assistant", content: "The capital of France is Paris." },
				{ role: "user", content: "What is its population?" },
			]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 4: System + User + Assistant + User messages
		it("should convert system, user, assistant, and user messages", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "system",
					content: [{ type: "text", text: "You are a helpful assistant." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "The capital of France is Paris." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "What is its population?" }],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "system", content: "You are a helpful assistant." },
				{ role: "user", content: "What is the capital of France?" },
				{ role: "assistant", content: "The capital of France is Paris." },
				{ role: "user", content: "What is its population?" },
			]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 5: Multiple content blocks in a message
		it("should join multiple text blocks with newlines", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Hello" },
						{ type: "text", text: "World" },
					],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "user", content: "Hello\n\nWorld" }]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 6: String content instead of array
		it("should handle string content", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: "What is the capital of France?",
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "What is the capital of France?" },
			]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 7: Non-text content blocks (should be ignored with warning)
		it("should ignore non-text content blocks with a warning", () => {
			// Mock console.warn
			const originalWarn = console.warn
			console.warn = jest.fn()

			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Look at this image:" },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "base64data",
							},
						},
					],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "Look at this image:" },
			]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
			expect(console.warn).toHaveBeenCalled()

			// Restore console.warn
			console.warn = originalWarn
		})

		// Test case 8: Empty content array
		it("should handle empty content array", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [],
				},
			]

			const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "user", content: "" }]

			expect(convertToOllamaHistory(neutralHistory)).toEqual(expected)
		})

		// Test case 9: Unknown role
		it("should handle unknown roles", () => {
			// Mock console.warn
			const originalWarn = console.warn
			console.warn = jest.fn()

			const neutralHistory: NeutralConversationHistory = [
				{
					// @ts-expect-error Testing invalid role type
					role: "tool",
					content: [{ type: "text", text: "Tool result" }],
				},
			]

			const result = convertToOllamaHistory(neutralHistory)

			// Should default to user role
			expect(result[0].role).toBe("user")
			expect(result[0].content).toBe("Tool result")
			expect(console.warn).toHaveBeenCalled()

			// Restore console.warn
			console.warn = originalWarn
		})
	})

	describe("convertToOllamaContentBlocks", () => {
		// Test case 1: Array with a single text block
		it("should convert a single text block to string", () => {
			const content: NeutralMessageContent = [{ type: "text", text: "Hello, world!" }]
			expect(convertToOllamaContentBlocks(content)).toBe("Hello, world!")
		})

		// Test case 2: Multiple text blocks
		it("should join multiple text blocks with newlines", () => {
			const content: NeutralMessageContent = [
				{ type: "text", text: "Hello" },
				{ type: "text", text: "World" },
			]
			expect(convertToOllamaContentBlocks(content)).toBe("Hello\n\nWorld")
		})

		// Test case 3: Mixed content blocks (should ignore non-text)
		it("should extract only text from mixed content blocks", () => {
			const content: NeutralMessageContent = [
				{ type: "text", text: "Look at this image:" },
				{
					type: "image",
					source: {
						type: "base64",
						media_type: "image/png",
						data: "base64data",
					},
				},
				{ type: "text", text: "What do you think?" },
			]
			expect(convertToOllamaContentBlocks(content)).toBe("Look at this image:\n\nWhat do you think?")
		})

		// Test case 4: Empty array
		it("should handle empty array", () => {
			const content: NeutralMessageContent = []
			expect(convertToOllamaContentBlocks(content)).toBe("")
		})
	})

	describe("convertToNeutralHistoryFromOllama", () => {
		// Test case 1: Simple user message
		it("should convert a simple user message", () => {
			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "What is the capital of France?" },
			]

			const expected: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
			]

			expect(convertToNeutralHistoryFromOllama(ollamaHistory)).toEqual(expected)
		})

		// Test case 2: System + User messages
		it("should convert system and user messages", () => {
			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "system", content: "You are a helpful assistant." },
				{ role: "user", content: "What is the capital of France?" },
			]

			const expected: NeutralConversationHistory = [
				{
					role: "system",
					content: [{ type: "text", text: "You are a helpful assistant." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
			]

			expect(convertToNeutralHistoryFromOllama(ollamaHistory)).toEqual(expected)
		})

		// Test case 3: User + Assistant + User messages
		it("should convert multi-turn conversations", () => {
			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "What is the capital of France?" },
				{ role: "assistant", content: "The capital of France is Paris." },
				{ role: "user", content: "What is its population?" },
			]

			const expected: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "What is the capital of France?" }],
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "The capital of France is Paris." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "What is its population?" }],
				},
			]

			expect(convertToNeutralHistoryFromOllama(ollamaHistory)).toEqual(expected)
		})

		// Test case 4: Array content (unlikely but should be handled)
		it("should handle array content", () => {
			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{
					role: "user",
					// @ts-expect-error Testing invalid content format
					content: ["Hello", "World"], // This is not valid OpenAI format but we should handle it
				},
			]

			const result = convertToNeutralHistoryFromOllama(ollamaHistory)

			// Should convert each string to a text block
			expect(result[0].role).toBe("user")
			expect(Array.isArray(result[0].content)).toBe(true)

			const content = result[0].content as NeutralTextContentBlock[]
			expect(content.length).toBe(2)
			expect(content[0].type).toBe("text")
			expect(content[0].text).toBe("Hello")
			expect(content[1].type).toBe("text")
			expect(content[1].text).toBe("World")
		})

		// Test case 5: Unknown role
		it("should handle unknown roles", () => {
			// Mock console.warn
			const originalWarn = console.warn
			console.warn = jest.fn()

			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{
					// @ts-expect-error Testing invalid role type
					role: "function",
					content: "Function result",
				},
			]

			const result = convertToNeutralHistoryFromOllama(ollamaHistory)

			// Should default to user role
			expect(result[0].role).toBe("user")
			expect(console.warn).toHaveBeenCalled()

			// Restore console.warn
			console.warn = originalWarn
		})

		// Test case 6: Empty content
		it("should handle empty content", () => {
			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "user", content: "" }]

			const expected: NeutralConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "" }],
				},
			]

			expect(convertToNeutralHistoryFromOllama(ollamaHistory)).toEqual(expected)
		})

		// Test case 7: Non-string, non-array content (should be stringified)
		it("should handle non-string, non-array content by stringifying", () => {
			const ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{
					role: "user",
					// @ts-expect-error Testing invalid content format
					content: { foo: "bar" }, // This is not valid OpenAI format but we should handle it
				},
			]

			const result = convertToNeutralHistoryFromOllama(ollamaHistory)

			// Should stringify the object
			expect(result[0].role).toBe("user")
			expect(Array.isArray(result[0].content)).toBe(true)

			const content = result[0].content as NeutralTextContentBlock[]
			expect(content.length).toBe(1)
			expect(content[0].type).toBe("text")
			expect(content[0].text).toBe(JSON.stringify({ foo: "bar" }))
		})
	})
})
