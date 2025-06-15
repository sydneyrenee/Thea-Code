import axios from "axios"
import OpenAI from "openai"

import { ApiHandlerOptions, ModelInfo, openRouterDefaultModelId, openRouterDefaultModelInfo } from "../../shared/api"
import { parseApiPrice } from "../../utils/cost"
import { convertToOpenAiHistory } from "../transform/neutral-openai-format"
import { ApiStreamChunk, ApiStreamUsageChunk } from "../transform/stream"

import { convertToR1Format } from "../transform/r1-format"
import type { NeutralConversationHistory } from "../../shared/neutral-history"

import { DEEP_SEEK_DEFAULT_TEMPERATURE } from "./constants"
import { getModelParams, SingleCompletionHandler, ApiHandler } from ".."
import { BaseProvider } from "./base-provider"
import { OpenAiHandler } from "./openai"

import { API_REFERENCES } from "../../../dist/thea-config" // Import API_REFERENCES

const OPENROUTER_DEFAULT_PROVIDER_NAME = "[default]"

// Add custom interface for OpenRouter params.
type OpenRouterChatCompletionParams = OpenAI.Chat.ChatCompletionCreateParams & {
	transforms?: string[]
	include_reasoning?: boolean
	thinking?: unknown
}

export class OpenRouterHandler extends BaseProvider implements ApiHandler, SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI
	private openAiHandler: OpenAiHandler

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		const baseURL = this.options.openRouterBaseUrl || "https://openrouter.ai/api/v1"
		const apiKey = this.options.openRouterApiKey ?? "not-provided"

		// Define headers directly using API_REFERENCES
		this.client = new OpenAI({
			baseURL,
			apiKey,
			defaultHeaders: {
				"HTTP-Referer": API_REFERENCES.HOMEPAGE,
				"X-Title": API_REFERENCES.APP_TITLE,
			},
		})

		this.openAiHandler = new OpenAiHandler({
			...options,
			openAiApiKey: apiKey,
			openAiBaseUrl: baseURL,
			openAiModelId: this.options.openRouterModelId || "",
		})
	}

	override async *createMessage(
		systemPrompt: string,
		messages: NeutralConversationHistory,
	): AsyncGenerator<ApiStreamChunk> {
		let { id: modelId, maxTokens, thinking, temperature, topP } = this.getModel()

		const history: NeutralConversationHistory = [...messages]

		if (systemPrompt) {
			const firstUser = history.find((m) => m.role === "user")
			if (firstUser) {
				if (typeof firstUser.content === "string") {
					firstUser.content = `${systemPrompt}\n${firstUser.content}`
				} else if (Array.isArray(firstUser.content)) {
					firstUser.content.unshift({ type: "text", text: systemPrompt })
				}
			} else {
				history.unshift({ role: "user", content: systemPrompt })
			}
		}

		let openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = convertToOpenAiHistory(history)

		// DeepSeek highly recommends using user instead of system role.
		if (modelId.startsWith("deepseek/deepseek-r1") || modelId === "perplexity/sonar-reasoning") {
			openAiMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...history])
		}

		// prompt caching: https://openrouter.ai/docs/prompt-caching
		// this is specifically for claude models (some models may 'support prompt caching' automatically without this)
		switch (true) {
			case modelId.startsWith("anthropic/"): {
				openAiMessages[0] = {
					role: "system",
					content: [
						{
							type: "text",
							text: systemPrompt,
							// @ts-expect-error - Anthropic SDK doesn't expose cache_control in type definitions
							cache_control: { type: "ephemeral" },
						},
					],
				}
				// Add cache_control to the last two user messages
				// (note: this works because we only ever add one user message at a time, but if we added multiple we'd need to mark the user message before the last assistant message)
				const lastTwoUserMessages = openAiMessages.filter((msg) => msg.role === "user").slice(-2)
				lastTwoUserMessages.forEach((msg) => {
					if (typeof msg.content === "string") {
						msg.content = [{ type: "text", text: msg.content }]
					}
					if (Array.isArray(msg.content)) {
						// NOTE: this is fine since env details will always be added at the end. but if it weren't there, and the user added a image_url type message, it would pop a text part before it and then move it after to the end.
						let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

						if (!lastTextPart) {
							lastTextPart = { type: "text", text: "..." }
							msg.content.push(lastTextPart)
						}
						// @ts-expect-error - Adding cache_control property not defined in type
						lastTextPart["cache_control"] = { type: "ephemeral" }
					}
				})
				break
			}
			default:
				break
		}

		// https://openrouter.ai/docs/transforms
		const completionParams: OpenRouterChatCompletionParams = {
			model: modelId,
			max_tokens: maxTokens,
			temperature,
			thinking, // OpenRouter is temporarily supporting this.
			top_p: topP,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },
			// Only include provider if openRouterSpecificProvider is not "[default]".
			...(this.options.openRouterSpecificProvider &&
				this.options.openRouterSpecificProvider !== OPENROUTER_DEFAULT_PROVIDER_NAME && {
					provider: { order: [this.options.openRouterSpecificProvider] },
				}),
			// This way, the transforms field will only be included in the parameters when openRouterUseMiddleOutTransform is true.
			...((this.options.openRouterUseMiddleOutTransform ?? true) && { transforms: ["middle-out"] }),
		}

		const stream = await this.client.chat.completions.create(completionParams)

		let lastUsage

		for await (const chunk of stream as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
			// OpenRouter returns an error object instead of the OpenAI SDK throwing an error.
			if ("error" in chunk) {
				const error = chunk.error as { message?: string; code?: number }
				console.error(`OpenRouter API Error: ${error?.code} - ${error?.message}`)
				throw new Error(`OpenRouter API Error ${error?.code}: ${error?.message}`)
			}

			const delta = chunk.choices[0]?.delta

			if ("reasoning" in delta && delta.reasoning) {
				yield { type: "reasoning", text: delta.reasoning } as ApiStreamChunk
			}

			if (delta?.content) {
				// Check for tool calls using the OpenAI handler's method
				const toolCalls = this.openAiHandler.extractToolCalls(delta)

				if (toolCalls.length > 0) {
					// Process tool calls using the OpenAI handler's logic
					for (const toolCall of toolCalls) {
						if (toolCall.function) {
							// Process tool use using MCP integration
							const toolResult = await this.processToolUse({
								id: toolCall.id,
								name: toolCall.function.name,
								input: JSON.parse(toolCall.function.arguments || "{}"),
							})

							// Ensure the tool result content is a string
							const toolResultString =
								typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

							// Yield tool result
							yield {
								type: "tool_result",
								id: toolCall.id,
								content: toolResultString,
							}
						}
					}
				} else {
					// Regular content handling
					yield { type: "text", text: delta.content } as ApiStreamChunk
				}
			}

			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		if (lastUsage) {
			yield this.processUsageMetrics(lastUsage)
		}
	}

	processUsageMetrics(usage: {
		prompt_tokens?: number
		completion_tokens?: number
		cost?: number
	}): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			totalCost: usage?.cost || 0,
		}
	}

	override getModel() {
		const modelId = this.options.openRouterModelId
		const modelInfo = this.options.openRouterModelInfo

		let id = modelId ?? openRouterDefaultModelId
		const info = modelInfo ?? openRouterDefaultModelInfo

		const isDeepSeekR1 = id.startsWith("deepseek/deepseek-r1") || modelId === "perplexity/sonar-reasoning"
		const defaultTemperature = isDeepSeekR1 ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0
		const topP = isDeepSeekR1 ? 0.95 : undefined

		return {
			id,
			info,
			...getModelParams({ options: this.options, model: info, defaultTemperature }),
			topP,
		}
	}

	async completePrompt(prompt: string) {
		let { id: modelId, maxTokens, thinking, temperature } = this.getModel()

		const completionParams: OpenRouterChatCompletionParams = {
			model: modelId,
			max_tokens: maxTokens,
			thinking,
			temperature,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		}

		const response = await this.client.chat.completions.create(completionParams)

		if ("error" in response) {
			const error = response.error as { message?: string; code?: number }
			throw new Error(`OpenRouter API Error ${error?.code}: ${error?.message}`)
		}

		const completion = response as OpenAI.Chat.ChatCompletion
		return completion.choices[0]?.message?.content || ""
	}
}

interface OpenRouterRawModel {
	id: string
	top_provider?: {
		max_completion_tokens?: number | null
		[key: string]: unknown
	} | null
	context_length?: number | null
	architecture?: {
		modality?: string | null
		[key: string]: unknown
	} | null
	pricing?: {
		prompt?: string | null
		completion?: string | null
		[key: string]: unknown
	} | null
	description?: string | null
	[key: string]: unknown
}

interface OpenRouterModelsResponse {
	data: OpenRouterRawModel[]
}

export async function getOpenRouterModels(options?: ApiHandlerOptions) {
	const models: Record<string, ModelInfo> = {}

	const baseURL = options?.openRouterBaseUrl || "https://openrouter.ai/api/v1"

	try {
		const response = await axios.get(`${baseURL}/models`)
		const rawModels = (response.data as OpenRouterModelsResponse).data

		for (const rawModel of rawModels) {
			const modelInfo: ModelInfo = {
				maxTokens: rawModel.top_provider?.max_completion_tokens,
				contextWindow: rawModel.context_length ?? 0, // Default to 0 if null/undefined
				supportsImages: rawModel.architecture?.modality?.includes("image"),
				supportsPromptCache: false,
				inputPrice: parseApiPrice(rawModel.pricing?.prompt),
				outputPrice: parseApiPrice(rawModel.pricing?.completion),
				description: rawModel.description ?? undefined, // Default to undefined if null
				thinking: rawModel.id === "anthropic/claude-3.7-sonnet:thinking",
			}

			// NOTE: this needs to be synced with api.ts/openrouter default model info.
			switch (true) {
				case rawModel.id.startsWith("anthropic/claude-3.7-sonnet"):
					modelInfo.supportsComputerUse = true
					modelInfo.supportsPromptCache = true
					modelInfo.cacheWritesPrice = 3.75
					modelInfo.cacheReadsPrice = 0.3
					modelInfo.maxTokens = rawModel.id === "anthropic/claude-3.7-sonnet:thinking" ? 128_000 : 8192
					break
				case rawModel.id.startsWith("anthropic/claude-3.5-sonnet-20240620"):
					modelInfo.supportsPromptCache = true
					modelInfo.cacheWritesPrice = 3.75
					modelInfo.cacheReadsPrice = 0.3
					modelInfo.maxTokens = 8192
					break
				case rawModel.id.startsWith("anthropic/claude-3.5-sonnet"):
					modelInfo.supportsComputerUse = true
					modelInfo.supportsPromptCache = true
					modelInfo.cacheWritesPrice = 3.75
					modelInfo.cacheReadsPrice = 0.3
					modelInfo.maxTokens = 8192
					break
				case rawModel.id.startsWith("anthropic/claude-3-5-haiku"):
					modelInfo.supportsPromptCache = true
					modelInfo.cacheWritesPrice = 1.25
					modelInfo.cacheReadsPrice = 0.1
					modelInfo.maxTokens = 8192
					break
				case rawModel.id.startsWith("anthropic/claude-3-opus"):
					modelInfo.supportsPromptCache = true
					modelInfo.cacheWritesPrice = 18.75
					modelInfo.cacheReadsPrice = 1.5
					modelInfo.maxTokens = 8192
					break
				case rawModel.id.startsWith("anthropic/claude-3-haiku"):
					modelInfo.supportsPromptCache = true
					modelInfo.cacheWritesPrice = 0.3
					modelInfo.cacheReadsPrice = 0.03
					modelInfo.maxTokens = 8192
					break
				default:
					break
			}

			models[rawModel.id] = modelInfo
		}
	} catch (error) {
		console.error(
			`Error fetching OpenRouter models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}

	return models
}
