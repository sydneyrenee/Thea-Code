import { convertToOllamaMessages, convertFromOllamaResponse } from "../ollama"
import type { NeutralConversationHistory } from "../../../shared/neutral-history"
import type { OllamaResponse } from "../ollama"

describe("ollama transform", () => {
	describe("convertToOllamaMessages", () => {
		it("should convert simple text messages", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: "Hello, how are you?",
				},
				{
					role: "assistant", 
					content: "I'm doing well, thank you!",
				},
			]

			const result = convertToOllamaMessages(neutralHistory)

			expect(result).toEqual([
				{
					role: "user",
					content: "Hello, how are you?",
				},
				{
					role: "assistant",
					content: "I'm doing well, thank you!",
				},
			])
		})

		it("should convert messages with content blocks", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Hello",
						},
						{
							type: "text", 
							text: "World",
						},
					],
				},
			]

			const result = convertToOllamaMessages(neutralHistory)

			expect(result).toEqual([
				{
					role: "user",
					content: "Hello\nWorld",
				},
			])
		})

		it("should handle tool use blocks", () => {
			const neutralHistory: NeutralConversationHistory = [
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "I'll help you with that.",
						},
						{
							type: "tool_use",
							id: "tool_123",
							name: "get_weather",
							input: { location: "New York" },
						},
					],
				},
			]

			const result = convertToOllamaMessages(neutralHistory)

			expect(result[0]).toMatchObject({
				role: "assistant",
				content: "I'll help you with that.",
				tool_calls: [
					{
						id: "tool_123",
						type: "function",
						function: {
							name: "get_weather",
							arguments: '{"location":"New York"}',
						},
					},
				],
			})
		})
	})

	describe("convertFromOllamaResponse", () => {
		it("should convert Ollama response to neutral format", () => {
			const ollamaResponse: OllamaResponse = {
				choices: [
					{
						message: {
							role: "assistant",
							content: "Hello there!",
						},
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
				model: "llama2",
				created: 1234567890,
				id: "chat_123",
				object: "chat.completion",
			}

			const result = convertFromOllamaResponse(ollamaResponse)

			expect(result).toEqual([
				{
					role: "assistant",
					content: "Hello there!",
				},
			])
		})

		it("should handle tool calls in response", () => {
			const ollamaResponse: OllamaResponse = {
				choices: [
					{
						message: {
							role: "assistant",
							content: "I'll check the weather for you.",
							tool_calls: [
								{
									id: "tool_123",
									type: "function",
									function: {
										name: "get_weather",
										arguments: '{"location":"New York"}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 20,
					completion_tokens: 0,
					total_tokens: 20,
				},
				model: "llama2",
				created: 1234567890,
				id: "chat_123",
				object: "chat.completion",
			}

			const result = convertFromOllamaResponse(ollamaResponse)

			expect(result[0].content).toEqual([
				{
					type: "text",
					text: "I'll check the weather for you.",
				},
				{
					type: "tool_use",
					id: "tool_123",
					name: "get_weather",
					input: { location: "New York" },
				},
			])
		})
	})
})