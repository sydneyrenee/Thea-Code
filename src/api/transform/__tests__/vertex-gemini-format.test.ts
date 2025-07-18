// npx jest src/api/transform/__tests__/vertex-gemini-format.test.ts

import type { NeutralMessage } from "../../../shared/neutral-history"

import { convertAnthropicMessageToVertexGemini } from "../vertex-gemini-format"

describe("convertAnthropicMessageToVertexGemini", () => {
	it("should convert a simple text message", () => {
		const anthropicMessage: NeutralMessage = {
			role: "user",
			content: "Hello, world!",
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
			role: "user",
			parts: [{ text: "Hello, world!" }],
		})
	})

	it("should convert assistant role to model role", () => {
		const anthropicMessage: NeutralMessage = {
			role: "assistant",
			content: "I'm an assistant",
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
			role: "model",
			parts: [{ text: "I'm an assistant" }],
		})
	})

	it("should convert a message with text blocks", () => {
		const anthropicMessage: NeutralMessage = {
			role: "user",
			content: [
				{ type: "text", text: "First paragraph" },
				{ type: "text", text: "Second paragraph" },
			],
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
			role: "user",
			parts: [{ text: "First paragraph" }, { text: "Second paragraph" }],
		})
	})

	it("should convert a message with an image", () => {
		const anthropicMessage: NeutralMessage = {
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
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
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
		})
	})

	it("should handle unsupported image source type gracefully", () => {
		const anthropicMessage: NeutralMessage = {
			role: "user",
			content: [
				{
					type: "image",
					source: {
						type: "image_url", // This is supported
						url: "https://example.com/image.jpg",
					},
				},
			],
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)
		expect(result.parts).toHaveLength(1)
		expect(result.parts[0]).toHaveProperty("text", "[Unsupported Neutral block type: image]")
	})

	it("should convert a message with tool use", () => {
		const anthropicMessage: NeutralMessage = {
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
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
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
		})
	})

	it("should convert a message with tool result as string", () => {
		const anthropicMessage: NeutralMessage = {
			role: "user",
			content: [
				{ type: "text", text: "Here's the result:" },
				{
					type: "tool_result",
					tool_use_id: "calculator-123",
					content: [{ type: "text", text: "The result is 5" }],
				},
			],
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
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
		})
	})

	it("should handle empty tool result content", () => {
		const anthropicMessage: NeutralMessage = {
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "calculator-123",
					// @ts-expect-error Testing edge case with null content
					content: null, // Empty content
				},
			],
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		// Should skip the empty tool result
		expect(result).toEqual({
			role: "user",
			parts: [],
		})
	})

	it("should convert a message with tool result as array with text only", () => {
		const anthropicMessage: NeutralMessage = {
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
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
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
		})
	})

	it("should convert a message with tool result as array with text and images", () => {
		const anthropicMessage: NeutralMessage = {
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
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
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
		})
	})

	it("should convert a message with tool result containing only images", () => {
		const anthropicMessage: NeutralMessage = {
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
		}

		const result = convertAnthropicMessageToVertexGemini(anthropicMessage)

		expect(result).toEqual({
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
		})
	})

	it("should throw an error for unsupported content block type", () => {
		const anthropicMessage: NeutralMessage = {
			role: "user",
			content: [
				{
					// @ts-expect-error Testing unsupported content block type
					type: "unknown_type", // Unsupported type
					data: "some data",
				},
			],
		}

		expect(() => convertAnthropicMessageToVertexGemini(anthropicMessage)).toThrow(
			"Unsupported content block type: unknown_type",
		)
	})
})
