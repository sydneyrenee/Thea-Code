import { extractToolCalls, handleStreamingResponse, processToolResult } from "../openai"
import OpenAI from "openai"

describe("openai transform utilities", () => {
	describe("extractToolCalls", () => {
		it("should return empty array when no tool calls", () => {
			const delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta = {}
			const result = extractToolCalls(delta)
			expect(result).toEqual([])
		})

		it("should extract valid tool calls", () => {
			const delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta = {
				tool_calls: [
					{
						id: "call_123",
						function: {
							name: "test_function",
							arguments: '{"param": "value"}',
						},
					},
				],
			}
			const result = extractToolCalls(delta)
			expect(result).toEqual([
				{
					id: "call_123",
					type: "function",
					function: {
						name: "test_function",
						arguments: '{"param": "value"}',
					},
				},
			])
		})
	})

	describe("handleStreamingResponse", () => {
		it("should extract content from chunk", () => {
			const chunk: OpenAI.Chat.ChatCompletionChunk = {
				id: "test",
				object: "chat.completion.chunk",
				created: Date.now(),
				model: "gpt-4",
				choices: [
					{
						delta: { content: "Hello world" },
						index: 0,
					},
				],
			}
			const result = handleStreamingResponse(chunk)
			expect(result).toBe("Hello world")
		})

		it("should return empty string when no content", () => {
			const chunk: OpenAI.Chat.ChatCompletionChunk = {
				id: "test",
				object: "chat.completion.chunk",
				created: Date.now(),
				model: "gpt-4",
				choices: [
					{
						delta: {},
						index: 0,
					},
				],
			}
			const result = handleStreamingResponse(chunk)
			expect(result).toBe("")
		})
	})

	describe("processToolResult", () => {
		it("should convert tool result to neutral format", () => {
			const result = processToolResult({ id: "tool_123", content: "Result content" })
			expect(result).toEqual({
				type: "tool_result",
				tool_use_id: "tool_123",
				content: [
					{
						type: "text",
						text: "Result content",
					},
				],
			})
		})
	})
})