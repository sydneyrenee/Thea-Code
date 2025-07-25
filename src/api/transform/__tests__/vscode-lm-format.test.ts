// npx jest src/api/transform/__tests__/vscode-lm-format.test.ts

import type { NeutralConversationHistory } from "../../../shared/neutral-history"
import * as vscode from "vscode"

import { convertToVsCodeLmMessages, convertToAnthropicRole } from "../vscode-lm-format"

// Define types for our mocked classes
interface MockLanguageModelTextPart {
	type: "text"
	value: string
}

interface MockLanguageModelToolCallPart {
	type: "tool_call"
	callId: string
	name: string
	input: Record<string, unknown>
}

interface MockLanguageModelToolResultPart {
	type: "tool_result"
	toolUseId: string
	parts: MockLanguageModelTextPart[]
}

// Mock vscode namespace
jest.mock("vscode", () => {
	const LanguageModelChatMessageRole = {
		Assistant: "assistant",
		User: "user",
	}

	class MockLanguageModelTextPart {
		type = "text"
		constructor(public value: string) {}
	}

	class MockLanguageModelToolCallPart {
		type = "tool_call"
		constructor(
			public callId: string,
			public name: string,
			public input: Record<string, unknown>,
		) {}
	}

	class MockLanguageModelToolResultPart {
		type = "tool_result"
		constructor(
			public toolUseId: string,
			public parts: MockLanguageModelTextPart[],
		) {}
	}

	return {
		LanguageModelChatMessage: {
			Assistant: jest.fn((content: string | MockLanguageModelTextPart[]) => ({
				role: LanguageModelChatMessageRole.Assistant,
				name: "assistant",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content)],
			})),
			User: jest.fn((content: string | MockLanguageModelTextPart[]) => ({
				role: LanguageModelChatMessageRole.User,
				name: "user",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content)],
			})),
		},
		LanguageModelChatMessageRole,
		LanguageModelTextPart: MockLanguageModelTextPart,
		LanguageModelToolCallPart: MockLanguageModelToolCallPart,
		LanguageModelToolResultPart: MockLanguageModelToolResultPart,
	}
})

describe("convertToVsCodeLmMessages", () => {
	it("should convert simple string messages", () => {
		const messages: NeutralConversationHistory = [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there" },
		]

		const result = convertToVsCodeLmMessages(messages)

		expect(result).toHaveLength(2)
		expect(result[0].role).toBe("user")
		expect((result[0].content[0] as MockLanguageModelTextPart).value).toBe("Hello")
		expect(result[1].role).toBe("assistant")
		expect((result[1].content[0] as MockLanguageModelTextPart).value).toBe("Hi there")
	})

	it("should handle complex user messages with tool results", () => {
		const messages: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Here is the result:" },
					{
						type: "tool_result",
						tool_use_id: "tool-1",
						content: [{ type: "text", text: "Tool output" }],
					},
				],
			},
		]

		const result = convertToVsCodeLmMessages(messages)

		expect(result).toHaveLength(1)
		expect(result[0].role).toBe("user")
		expect(result[0].content).toHaveLength(2)
		const [toolResult, textContent] = result[0].content as [
			MockLanguageModelToolResultPart,
			MockLanguageModelTextPart,
		]
		expect(toolResult.type).toBe("tool_result")
		expect(textContent.type).toBe("text")
	})

	it("should handle complex assistant messages with tool calls", () => {
		const messages: NeutralConversationHistory = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Let me help you with that." },
					{
						type: "tool_use",
						id: "tool-1",
						name: "calculator",
						input: { operation: "add", numbers: [2, 2] },
					},
				],
			},
		]

		const result = convertToVsCodeLmMessages(messages)

		expect(result).toHaveLength(1)
		expect(result[0].role).toBe("assistant")
		expect(result[0].content).toHaveLength(2)
		const [toolCall, textContent] = result[0].content as [MockLanguageModelToolCallPart, MockLanguageModelTextPart]
		expect(toolCall.type).toBe("tool_call")
		expect(textContent.type).toBe("text")
	})

	it("should handle image blocks with appropriate placeholders", () => {
		const messages: NeutralConversationHistory = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Look at this:" },
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

		const result = convertToVsCodeLmMessages(messages)

		expect(result).toHaveLength(1)
		const imagePlaceholder = result[0].content[1] as MockLanguageModelTextPart
		expect(imagePlaceholder.value).toContain("[Image (base64): image/png not supported by VSCode LM API]")
	})
})

describe("convertToAnthropicRole", () => {
	it("should convert assistant role correctly", () => {
		const result = convertToAnthropicRole(vscode.LanguageModelChatMessageRole.Assistant)
		expect(result).toBe("assistant")
	})

	it("should convert user role correctly", () => {
		const result = convertToAnthropicRole(vscode.LanguageModelChatMessageRole.User)
		expect(result).toBe("user")
	})

	it("should return null for unknown roles", () => {
		// @ts-expect-error Testing with an invalid role value
		const result = convertToAnthropicRole("unknown")
		expect(result).toBeNull()
	})
})

describe("asObjectSafe via convertToVsCodeLmMessages", () => {
	it("parses JSON strings in tool_use input", () => {
		const messages: NeutralConversationHistory = [
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "1",
						name: "test",
						input: { jsonString: '{"foo": "bar"}' },
					},
				],
			},
		]
		const result = convertToVsCodeLmMessages(messages)
		const toolCall = result[0].content[0] as MockLanguageModelToolCallPart
		expect(toolCall.input).toEqual({ jsonString: '{"foo": "bar"}' })
	})

	it("handles invalid JSON by returning empty object", () => {
		const messages: NeutralConversationHistory = [
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "2",
						name: "test",
						input: { invalidJson: "{invalid}" },
					},
				],
			},
		]
		const result = convertToVsCodeLmMessages(messages)
		const toolCall = result[0].content[0] as MockLanguageModelToolCallPart
		expect(toolCall.input).toEqual({ invalidJson: "{invalid}" })
	})

	it("clones object inputs", () => {
		const obj = { a: 1 }
		const messages: NeutralConversationHistory = [
			{
				role: "assistant",
				content: [{ type: "tool_use", id: "3", name: "test", input: obj }],
			},
		]
		const result = convertToVsCodeLmMessages(messages)
		const toolCall = result[0].content[0] as MockLanguageModelToolCallPart
		expect(toolCall.input).toEqual(obj)
		expect(toolCall.input).not.toBe(obj)
	})
})
