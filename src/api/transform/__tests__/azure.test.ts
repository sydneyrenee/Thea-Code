import type { NeutralConversationHistory, NeutralMessage } from "../../../shared/neutral-history"
import {
	convertToAzureOpenAIMessage,
	convertToAzureOpenAIHistory,
	createAzureOpenAIRequest,
	isAzureOpenAIStreamChunk,
	extractContentFromAzureChunk,
} from "../azure"

describe("Azure OpenAI Transform", () => {
	describe("convertToAzureOpenAIMessage", () => {
		it("should convert simple text message", () => {
			const neutralMessage: NeutralMessage = {
				role: "user",
				content: "Hello, world!",
			}

			const result = convertToAzureOpenAIMessage(neutralMessage)

			expect(result).toEqual({
				role: "user",
				content: "Hello, world!",
			})
		})

		it("should handle assistant message with tool calls", () => {
			const neutralMessage: NeutralMessage = {
				role: "assistant",
				content: [
					{
						type: "text",
						text: "I'll help you with that.",
					},
					{
						type: "tool_use",
						id: "tool_1",
						name: "get_weather",
						input: { city: "New York" },
					},
				],
			}

			const result = convertToAzureOpenAIMessage(neutralMessage)

			expect(result).toEqual({
				role: "assistant",
				content: "I'll help you with that.",
				tool_calls: [
					{
						id: "tool_1",
						type: "function",
						function: {
							name: "get_weather",
							arguments: JSON.stringify({ city: "New York" }),
						},
					},
				],
			})
		})

		it("should handle user message with image", () => {
			const neutralMessage: NeutralMessage = {
				role: "user",
				content: [
					{
						type: "text",
						text: "What's in this image?",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64data",
						},
					},
				],
			}

			const result = convertToAzureOpenAIMessage(neutralMessage)

			expect(result).toEqual({
				role: "user",
				content: [
					{
						type: "text",
						text: "What's in this image?",
					},
					{
						type: "image_url",
						image_url: {
							url: "data:image/jpeg;base64,base64data",
						},
					},
				],
			})
		})
	})

	describe("convertToAzureOpenAIHistory", () => {
		it("should convert conversation history", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: "Hello",
				},
				{
					role: "assistant",
					content: "Hi there!",
				},
			]

			const result = convertToAzureOpenAIHistory(neutralHistory)

			expect(result).toEqual([
				{
					role: "user",
					content: "Hello",
				},
				{
					role: "assistant",
					content: "Hi there!",
				},
			])
		})

		it("should handle tool results correctly", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tool_1",
							content: [
								{
									type: "text",
									text: "Weather result: 72°F",
								},
							],
						},
					],
				},
			]

			const result = convertToAzureOpenAIHistory(neutralHistory)

			expect(result).toEqual([
				{
					role: "tool",
					content: "Weather result: 72°F",
					tool_call_id: "tool_1",
				},
			])
		})
	})

	describe("createAzureOpenAIRequest", () => {
		it("should create request with system prompt", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: "Hello",
				},
			]

			const result = createAzureOpenAIRequest(
				"gpt-4",
				neutralHistory,
				"You are a helpful assistant",
				{
					temperature: 0.7,
					maxTokens: 1000,
					streaming: true,
				}
			)

			expect(result).toEqual({
				model: "gpt-4",
				messages: [
					{
						role: "system",
						content: "You are a helpful assistant",
					},
					{
						role: "user",
						content: "Hello",
					},
				],
				temperature: 0.7,
				max_tokens: 1000,
				stream: true,
				stream_options: { include_usage: true },
			})
		})
	})

	describe("isAzureOpenAIStreamChunk", () => {
		it("should validate Azure OpenAI stream chunks", () => {
			const validChunk = {
				id: "chatcmpl-123",
				object: "chat.completion.chunk",
				created: 1234567890,
				model: "gpt-4",
				choices: [
					{
						index: 0,
						delta: {
							content: "Hello",
						},
					},
				],
			}

			expect(isAzureOpenAIStreamChunk(validChunk)).toBe(true)
			expect(isAzureOpenAIStreamChunk({})).toBe(false)
			expect(isAzureOpenAIStreamChunk(null)).toBe(false)
			expect(isAzureOpenAIStreamChunk("invalid")).toBe(false)
		})
	})

	describe("extractContentFromAzureChunk", () => {
		it("should extract content from stream chunk", () => {
			const chunk = {
				id: "chatcmpl-123",
				object: "chat.completion.chunk",
				created: 1234567890,
				model: "gpt-4",
				choices: [
					{
						index: 0,
						delta: {
							content: "Hello world",
						},
						finish_reason: null,
					},
				],
			}

			const result = extractContentFromAzureChunk(chunk)

			expect(result).toEqual({
				content: "Hello world",
				toolCalls: undefined,
				finishReason: null,
			})
		})

		it("should handle empty choices", () => {
			const chunk = {
				id: "chatcmpl-123",
				object: "chat.completion.chunk",
				created: 1234567890,
				model: "gpt-4",
				choices: [],
			}

			const result = extractContentFromAzureChunk(chunk)

			expect(result).toEqual({})
		})
	})
})