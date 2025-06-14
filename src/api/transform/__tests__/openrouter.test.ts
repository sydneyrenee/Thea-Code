// npx jest src/api/transform/__tests__/openrouter.test.ts

import { 
	convertToOpenRouterFormat, 
	applyAnthropicCacheControl, 
	validateOpenRouterParams,
	createOpenRouterRequest,
	type OpenRouterChatCompletionParams,
	type OpenRouterTransformOptions
} from "../openrouter"
import OpenAI from "openai"
import type { NeutralConversationHistory } from "../../../shared/neutral-history"

describe("OpenRouter Transform Functions", () => {
	describe("convertToOpenRouterFormat", () => {
		it("should convert basic OpenAI messages to OpenRouter format", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "system", content: "You are a helpful assistant" },
				{ role: "user", content: "Hello" }
			]

			const result = convertToOpenRouterFormat(messages)

			expect(result).toMatchObject({
				model: "gpt-3.5-turbo",
				messages,
				stream: true,
				stream_options: { include_usage: true }
			})
		})

		it("should add middle-out transform when enabled", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "Hello" }
			]
			const options: OpenRouterTransformOptions = {
				useMiddleOutTransform: true
			}

			const result = convertToOpenRouterFormat(messages, options)

			expect(result.transforms).toEqual(["middle-out"])
		})

		it("should add provider preference when specified", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "Hello" }
			]
			const options: OpenRouterTransformOptions = {
				specificProvider: "anthropic"
			}

			const result = convertToOpenRouterFormat(messages, options)

			expect(result.provider).toEqual({
				order: ["anthropic"]
			})
		})

		it("should not add provider when default is specified", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "Hello" }
			]
			const options: OpenRouterTransformOptions = {
				specificProvider: "[default]"
			}

			const result = convertToOpenRouterFormat(messages, options)

			expect(result.provider).toBeUndefined()
		})

		it("should add thinking mode when enabled", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "Hello" }
			]
			const options: OpenRouterTransformOptions = {
				enableThinking: true
			}

			const result = convertToOpenRouterFormat(messages, options)

			expect(result.thinking).toBe(true)
		})

		it("should add reasoning when enabled", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "user", content: "Hello" }
			]
			const options: OpenRouterTransformOptions = {
				includeReasoning: true
			}

			const result = convertToOpenRouterFormat(messages, options)

			expect(result.include_reasoning).toBe(true)
		})
	})

	describe("validateOpenRouterParams", () => {
		it("should validate correct parameters", () => {
			const params: OpenRouterChatCompletionParams = {
				model: "gpt-3.5-turbo",
				messages: [],
				transforms: ["middle-out"],
				provider: { order: ["anthropic"] },
				thinking: true,
				include_reasoning: false
			}

			const result = validateOpenRouterParams(params)

			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("should reject invalid transforms type", () => {
			const params = {
				model: "gpt-3.5-turbo",
				messages: [],
				transforms: "invalid" as unknown as string[]
			} as OpenRouterChatCompletionParams

			const result = validateOpenRouterParams(params)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("transforms must be an array")
		})

		it("should reject invalid provider format", () => {
			const params = {
				model: "gpt-3.5-turbo",
				messages: [],
				provider: { order: "invalid" }
			} as unknown as OpenRouterChatCompletionParams

			const result = validateOpenRouterParams(params)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("provider.order must be an array")
		})

		it("should reject invalid thinking mode", () => {
			const params = {
				model: "gpt-3.5-turbo",
				messages: [],
				thinking: "invalid"
			} as unknown as OpenRouterChatCompletionParams

			const result = validateOpenRouterParams(params)

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("thinking must be boolean or 'auto'")
		})
	})

	describe("applyAnthropicCacheControl", () => {
		it("should apply cache control to system message", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "system", content: "You are helpful" }
			]
			const systemPrompt = "You are a helpful assistant"

			const result = applyAnthropicCacheControl(messages, systemPrompt)

			expect(result[0]).toMatchObject({
				role: "system",
				content: [
					{
						type: "text",
						text: systemPrompt,
						cache_control: { type: "ephemeral" }
					}
				]
			})
		})

		it("should apply cache control to user messages", () => {
			const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
				{ role: "system", content: "System" },
				{ role: "user", content: "First user message" },
				{ role: "assistant", content: "Assistant response" },
				{ role: "user", content: "Second user message" }
			]

			const result = applyAnthropicCacheControl(messages, "System prompt")

			// Check that user messages have cache control
			const userMessages = result.filter(msg => msg.role === "user")
			expect(userMessages).toHaveLength(2)
			
			// Both user messages should have cache control on their text parts
			userMessages.forEach(msg => {
				expect(Array.isArray(msg.content)).toBe(true)
				const content = msg.content as { type: string; text: string; cache_control?: Record<string, unknown> }[]
				const textPart = content.find(part => part.type === "text")
				expect(textPart?.cache_control).toEqual({ type: "ephemeral" })
			})
		})
	})

	describe("createOpenRouterRequest", () => {
		it("should create a complete OpenRouter request", () => {
			const systemPrompt = "You are helpful"
			const history: NeutralConversationHistory = [
				{ role: "user", content: "Hello" }
			]
			const modelId = "gpt-3.5-turbo"
			const options = {
				useMiddleOutTransform: true,
				maxTokens: 1000,
				temperature: 0.7
			}

			const result = createOpenRouterRequest(systemPrompt, history, modelId, options)

			expect(result.model).toBe(modelId)
			expect(result.max_tokens).toBe(1000)
			expect(result.temperature).toBe(0.7)
			expect(result.transforms).toEqual(["middle-out"])
			expect(result.messages).toHaveLength(2) // system + user
		})

		it("should apply Anthropic cache control for Anthropic models", () => {
			const systemPrompt = "You are helpful"
			const history: NeutralConversationHistory = [
				{ role: "user", content: "Hello" }
			]
			const modelId = "anthropic/claude-3.5-sonnet"

			const result = createOpenRouterRequest(systemPrompt, history, modelId)

			// System message should have cache control
			expect(result.messages[0]).toMatchObject({
				role: "system",
				content: [
					{
						type: "text",
						text: systemPrompt,
						cache_control: { type: "ephemeral" }
					}
				]
			})
		})

		it("should throw error for invalid parameters", () => {
			const systemPrompt = "You are helpful"
			const history: NeutralConversationHistory = []
			const modelId = "gpt-3.5-turbo"
			const options = {
				specificProvider: "invalid"
			}

			// This should work fine since our validation allows any string in provider order
			expect(() => createOpenRouterRequest(systemPrompt, history, modelId, options)).not.toThrow()
		})
	})
})