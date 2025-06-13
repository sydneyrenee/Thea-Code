import * as vscode from "vscode"
import { VsCodeLmHandler } from "../vscode-lm"
import { ApiHandlerOptions } from "../../../shared/api"
import { NeutralConversationHistory } from "../../../shared/neutral-history"

// Mock vscode namespace
jest.mock("vscode", () => {
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

	type MockLanguageModelPart = MockLanguageModelTextPart | MockLanguageModelToolCallPart

	return {
		workspace: {
			onDidChangeConfiguration: jest.fn((() => ({
				dispose: jest.fn(),
			})) as (callback: (e: vscode.ConfigurationChangeEvent) => void) => { dispose: jest.Mock }),
		},
		CancellationTokenSource: jest.fn(() => ({
			token: {
				isCancellationRequested: false,
				onCancellationRequested: jest.fn(),
			},
			cancel: jest.fn(),
			dispose: jest.fn(),
		})),
		CancellationError: class CancellationError extends Error {
			constructor() {
				super("Operation cancelled")
				this.name = "CancellationError"
			}
		},
		LanguageModelChatMessage: {
			Assistant: jest.fn((content: string | MockLanguageModelPart[]) => ({
				role: "assistant",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content as string)], // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
			})),
			User: jest.fn((content: string | MockLanguageModelPart[]) => ({
				role: "user",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content as string)], // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
			})),
		},
		LanguageModelTextPart: MockLanguageModelTextPart,
		LanguageModelToolCallPart: MockLanguageModelToolCallPart,
		lm: {
			selectChatModels: jest.fn(),
		},
	}
})

const mockLanguageModelChat = {
	id: "test-model",
	name: "Test Model",
	vendor: "test-vendor",
	family: "test-family",
	version: "1.0",
	maxInputTokens: 4096,
	sendRequest: jest.fn(),
	countTokens: jest.fn(),
}

describe("VsCodeLmHandler", () => {
	let handler: VsCodeLmHandler
	const defaultOptions: ApiHandlerOptions = {
		vsCodeLmModelSelector: {
			vendor: "test-vendor",
			family: "test-family",
		},
	}

	beforeEach(() => {
		jest.clearAllMocks()
		handler = new VsCodeLmHandler(defaultOptions)
	})

	afterEach(() => {
		handler.dispose()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeDefined()
			expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled()
		})

		it("should handle configuration changes", () => {
			const mockOnDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration as jest.Mock
			// Verify the mock was called and get the callback
			expect(mockOnDidChangeConfiguration).toHaveBeenCalled()
			const callArgs = mockOnDidChangeConfiguration.mock.calls[0] as [(e: vscode.ConfigurationChangeEvent) => void]
			const callback = callArgs[0]
			callback({ affectsConfiguration: () => true })
			// Should reset client when config changes
			expect(handler["client"]).toBeNull()
		})
	})

	describe("createClient", () => {
		it("should create client with selector", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as jest.Mock).mockResolvedValueOnce([mockModel])

			const client = await handler["createClient"]({
				vendor: "test-vendor",
				family: "test-family",
			})

			expect(client).toBeDefined()
			expect(client.id).toBe("test-model")
			expect(vscode.lm.selectChatModels).toHaveBeenCalledWith({
				vendor: "test-vendor",
				family: "test-family",
			})
		})

		it("should return default client when no models available", async () => {
			;(vscode.lm.selectChatModels as jest.Mock).mockResolvedValueOnce([])

			const client = await handler["createClient"]({})

			expect(client).toBeDefined()
			expect(client.id).toBe("default-lm")
			expect(client.vendor).toBe("vscode")
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as jest.Mock).mockResolvedValueOnce([mockModel])
			mockLanguageModelChat.countTokens.mockResolvedValue(10)
		})

		it("should stream text responses", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Hello",
						},
					],
				},
			]

			const responseText = "Hello! How can I help you?"
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (function* () {
					yield new vscode.LanguageModelTextPart(responseText)
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Text chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "text",
				text: responseText,
			})
			expect(chunks[1]).toMatchObject({
				type: "usage",
				inputTokens: expect.any(Number), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
				outputTokens: expect.any(Number), // eslint-disable-line @typescript-eslint/no-unsafe-assignment
			})
		})

		it("should handle tool calls", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Calculate 2+2",
						},
					],
				},
			]

			const toolCallData = {
				name: "calculator",
				arguments: { operation: "add", numbers: [2, 2] },
				callId: "call-1",
			}

			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (function* () {
					yield new vscode.LanguageModelToolCallPart(
						toolCallData.callId,
						toolCallData.name,
						toolCallData.arguments,
					)
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Tool call chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "tool_use",
				id: toolCallData.callId,
				name: toolCallData.name,
				input: toolCallData.arguments,
			})
		})

		it("should handle errors", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: NeutralConversationHistory = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Hello",
						},
					],
				},
			]

			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("API Error"))

			await expect(async () => {
				const stream = handler.createMessage(systemPrompt, messages)
				for await (const chunk of stream) {
					// consume stream
					void chunk
				}
			}).rejects.toThrow("API Error")
		})
	})

	describe("getModel", () => {
		it("should return model info when client exists", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as jest.Mock).mockResolvedValueOnce([mockModel])

			// Initialize client
			await handler["getClient"]()

			const model = handler.getModel()
			expect(model.id).toBe("test-model")
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(4096)
		})

		it("should return fallback model info when no client exists", () => {
			const model = handler.getModel()
			expect(model.id).toBe("test-vendor/test-family")
			expect(model.info).toBeDefined()
		})
	})

	describe("completePrompt", () => {
		it("should complete single prompt", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as jest.Mock).mockResolvedValueOnce([mockModel])

			const responseText = "Completed text"
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (function* () {
					yield new vscode.LanguageModelTextPart(responseText)
				})(),
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe(responseText)
			expect(mockLanguageModelChat.sendRequest).toHaveBeenCalled()
		})

		it("should handle errors during completion", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as jest.Mock).mockResolvedValueOnce([mockModel])

			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("Completion failed"))

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"VSCode LM completion error: Completion failed",
			)
		})
	})
})
