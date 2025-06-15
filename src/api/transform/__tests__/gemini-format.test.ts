// npx jest src/api/transform/__tests__/gemini-format.test.ts

import type { NeutralImageContentBlock, NeutralTextContentBlock, NeutralConversationHistory } from "../../../shared/neutral-history"
import { convertToGeminiHistory } from "../gemini-format"

describe("convertToGeminiHistory", () => {
	it("should convert a simple text message", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: "Hello, world!",
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [{ text: "Hello, world!" }],
			},
		])
	})

	it("should convert assistant role to model role", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "assistant",
				content: "I'm an assistant",
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "model",
				parts: [{ text: "I'm an assistant" }],
			},
		])
	})

	it("should convert a message with text blocks", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "First paragraph" },
					{ type: "text", text: "Second paragraph" },
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [{ text: "First paragraph" }, { text: "Second paragraph" }],
			},
		])
	})

	it("should convert a message with an image", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Check out this image:" },
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64encodeddata",
						},
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [
					{ text: "Check out this image:" },
					{
						inlineData: {
							data: "base64encodeddata",
							mimeType: "image/jpeg",
						},
					},
				],
			},
		])
	})

	it("should handle unsupported image source type gracefully", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "image_url",
							url: "https://example.com/image.jpg",
						},
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [{ text: "[Image could not be processed]" }],
			},
		])
	})

	it("should convert a message with tool use", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Let me calculate that for you." },
					{
						type: "tool_use",
						id: "calc-123",
						name: "calculator",
						input: { operation: "add", numbers: [2, 3] },
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "model",
				parts: [
					{ text: "Let me calculate that for you." },
					{
						functionCall: {
							name: "calculator",
							args: { operation: "add", numbers: [2, 3] },
						},
					},
				],
			},
		])
	})

	it("should convert a message with tool result as string", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Here's the result:" },
					{
						type: "tool_result",
						tool_use_id: "calculator-123",
						content: [{ type: "text", text: "The result is 5" }],
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [
					{ text: "Here's the result:" },
					{
						functionResponse: {
							name: "calculator",
							response: {
								name: "calculator",
								content: "The result is 5",
							},
						},
					},
				],
			},
		])
	})

	it("should handle empty tool result content with function response", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "calculator-123",
						content: [] as (NeutralTextContentBlock | NeutralImageContentBlock)[], // Empty content
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		// Should create a function response with empty content
		expect(result).toEqual([
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "calculator",
							response: {
								name: "calculator",
								content: "",
							},
						},
					},
				],
			},
		])
	})

	it("should convert a message with tool result as array with text only", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "search-123",
						content: [
							{ type: "text", text: "First result" },
							{ type: "text", text: "Second result" },
						],
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "search",
							response: {
								name: "search",
								content: "First result\n\nSecond result",
							},
						},
					},
				],
			},
		])
	})

	it("should convert a message with tool result as array with text and images", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "search-123",
						content: [
							{ type: "text", text: "Search results:" },
							{
								type: "image",
								source: {
									type: "base64",
									media_type: "image/png",
									data: "image1data",
								},
							},
							{
								type: "image",
								source: {
									type: "base64",
									media_type: "image/jpeg",
									data: "image2data",
								},
							},
						],
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "search",
							response: {
								name: "search",
								content: "Search results:\n\n(See next part for image)",
							},
						},
					},
					{
						inlineData: {
							data: "image1data",
							mimeType: "image/png",
						},
					},
					{
						inlineData: {
							data: "image2data",
							mimeType: "image/jpeg",
						},
					},
				],
			},
		])
	})

	it("should convert a message with tool result containing only images", () => {
		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "imagesearch-123",
						content: [
							{
								type: "image",
								source: {
									type: "base64",
									media_type: "image/png",
									data: "onlyimagedata",
								},
							},
						],
					},
				],
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "imagesearch",
							response: {
								name: "imagesearch",
								content: "\n\n(See next part for image)",
							},
						},
					},
					{
						inlineData: {
							data: "onlyimagedata",
							mimeType: "image/png",
						},
					},
				],
			},
		])
	})

	it("should handle unsupported content block type gracefully", () => {
		// Spy on console.warn to capture the warning
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {})

		// Create a valid text block and then modify its type to test the error handling
		const validBlock: NeutralTextContentBlock = {
			type: "text",
			text: "some data",
		}
		
		// Modify the type to an invalid one for testing
		const invalidBlock = { ...validBlock, type: "unknown_type" as const }

		const neutralHistory: NeutralConversationHistory = [
			{
				role: "user",
				content: [invalidBlock as unknown as NeutralTextContentBlock], // Cast through unknown for type safety
			},
		]

		const result = convertToGeminiHistory(neutralHistory)

		expect(result).toEqual([
			{
				role: "user",
				parts: [{ text: "[Unsupported Neutral block type: unknown_type]" }],
			},
		])

		// Verify the warning was logged
		expect(consoleSpy).toHaveBeenCalledWith("convertToGeminiHistory: Unsupported Neutral block type: unknown_type")

		// Restore console.warn
		consoleSpy.mockRestore()
	})
})

