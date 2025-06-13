import {
	transformResponseData,
	processStreamChunk,
	transformToolData,
	transformToolResult,
	transformImageData,
	processMessageContent,
	transformConversationHistory,
} from "../bedrock"

describe("bedrock.ts", () => {
	describe("transformResponseData", () => {
		it("should transform valid response data correctly", () => {
			const responseData = {
				content: [{ text: "Hello world" }],
				role: "assistant" as const,
				stopReason: "end_turn",
				usage: { inputTokens: 10, outputTokens: 20 },
				metrics: { latencyMs: 500 },
			}

			const result = transformResponseData(responseData)

			expect(result).toEqual({
				content: [{ text: "Hello world" }],
				role: "assistant",
				stopReason: "end_turn",
				usage: { inputTokens: 10, outputTokens: 20 },
				metrics: { latencyMs: 500 },
			})
		})

		it("should handle null input", () => {
			const result = transformResponseData(null)
			expect(result).toBeNull()
		})

		it("should use defaults for missing properties", () => {
			const responseData = {}
			const result = transformResponseData(responseData)

			expect(result).toEqual({
				content: [],
				role: "assistant",
				stopReason: undefined,
				usage: undefined,
				metrics: undefined,
			})
		})
	})

	describe("processStreamChunk", () => {
		it("should process messageStart chunk", () => {
			const chunk = {
				messageStart: {
					role: "assistant" as const,
				},
			}

			const result = processStreamChunk(chunk)

			expect(result).toEqual({
				type: "messageStart",
				role: "assistant",
			})
		})

		it("should process contentBlockDelta chunk", () => {
			const chunk = {
				contentBlockDelta: {
					delta: { text: "Hello" },
					contentBlockIndex: 0,
				},
			}

			const result = processStreamChunk(chunk)

			expect(result).toEqual({
				type: "contentBlockDelta",
				delta: { text: "Hello" },
				index: 0,
			})
		})

		it("should handle empty chunk", () => {
			const result = processStreamChunk({})

			expect(result).toEqual({
				type: "messageStart",
				metadata: undefined,
			})
		})
	})

	describe("transformToolData", () => {
		it("should transform tool data correctly", () => {
			const toolData = {
				id: "tool-123",
				name: "read_file",
				input: { path: "test.txt" },
			}

			const result = transformToolData(toolData)

			expect(result).toEqual({
				toolUse: {
					toolUseId: "tool-123",
					name: "read_file",
					input: { path: "test.txt" },
				},
			})
		})

		it("should handle null input", () => {
			const result = transformToolData(null)
			expect(result).toBeNull()
		})
	})

	describe("transformToolResult", () => {
		it("should transform tool result correctly", () => {
			const resultData = {
				tool_use_id: "tool-123",
				content: "File contents here",
				status: "success",
			}

			const result = transformToolResult(resultData)

			expect(result).toEqual({
				toolResult: {
					toolUseId: "tool-123",
					content: "File contents here",
					status: "success",
				},
			})
		})

		it("should handle null input", () => {
			const result = transformToolResult(null)
			expect(result).toBeNull()
		})
	})

	describe("transformImageData", () => {
		it("should transform image data correctly", () => {
			const imageData = {
				source: {
					media_type: "image/jpeg",
					data: new Uint8Array([1, 2, 3]),
				},
			}

			const result = transformImageData(imageData)

			expect(result).toEqual({
				image: {
					format: "jpeg",
					source: {
						bytes: new Uint8Array([1, 2, 3]),
					},
				},
			})
		})

		it("should handle missing media_type", () => {
			const imageData = {
				source: {
					data: new Uint8Array([1, 2, 3]),
				},
			}

			const result = transformImageData(imageData)

			expect(result).toEqual({
				image: {
					format: "jpeg",
					source: {
						bytes: new Uint8Array([1, 2, 3]),
					},
				},
			})
		})

		it("should handle null input", () => {
			const result = transformImageData(null)
			expect(result).toBeNull()
		})
	})

	describe("processMessageContent", () => {
		it("should process string content", () => {
			const result = processMessageContent("Hello world")
			expect(result).toEqual([{ text: "Hello world" }])
		})

		it("should process array of text blocks", () => {
			const content = [
				{ type: "text", text: "Hello" },
				{ type: "text", text: "World" },
			]

			const result = processMessageContent(content)

			expect(result).toEqual([{ text: "Hello" }, { text: "World" }])
		})

		it("should handle null input", () => {
			const result = processMessageContent(null)
			expect(result).toEqual([])
		})

		it("should handle unknown block types", () => {
			const content = [{ type: "unknown", data: "test" }]
			const result = processMessageContent(content)

			expect(result).toEqual([{ text: "[Unknown: unknown]" }])
		})
	})

	describe("transformConversationHistory", () => {
		it("should transform conversation history", () => {
			const messages = [
				{
					role: "user" as const,
					content: "Hello",
				},
				{
					role: "assistant" as const,
					content: "Hi there",
				},
			]

			const result = transformConversationHistory(messages)

			expect(result).toEqual([
				{
					role: "user",
					content: [{ text: "Hello" }],
				},
				{
					role: "assistant",
					content: [{ text: "Hi there" }],
				},
			])
		})

		it("should handle empty array", () => {
			const result = transformConversationHistory([])
			expect(result).toEqual([])
		})

		it("should handle non-array input", () => {
			const result = transformConversationHistory("not an array" as unknown as ConversationMessage[])
			expect(result).toEqual([])
		})
	})
})