import { Mistral } from "@mistralai/mistralai"
import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, mistralDefaultModelId, MistralModelId, mistralModels, ModelInfo } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import { convertToMistralMessages } from "../transform/neutral-mistral-format"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"

const MISTRAL_DEFAULT_TEMPERATURE = 0

export class MistralHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: Mistral

	constructor(options: ApiHandlerOptions) {
		super()
		if (!options.mistralApiKey) {
			throw new Error("Mistral API key is required")
		}

		// Set default model ID if not provided
		this.options = {
			...options,
			apiModelId: options.apiModelId || mistralDefaultModelId,
		}

		const baseUrl = this.getBaseUrl()
		console.debug(`[Thea Code] MistralHandler using baseUrl: ${baseUrl}`)
		this.client = new Mistral({
			serverURL: baseUrl,
			apiKey: this.options.mistralApiKey,
		})
	}

	private getBaseUrl(): string {
		const modelId = this.options.apiModelId ?? mistralDefaultModelId
		console.debug(`[Thea Code] MistralHandler using modelId: ${modelId}`)
		if (modelId?.startsWith("codestral-")) {
			return this.options.mistralCodestralUrl || "https://codestral.mistral.ai"
		}
		return "https://api.mistral.ai"
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const response = await this.client.chat.stream({
			model: this.options.apiModelId || mistralDefaultModelId,
			messages: [{ role: "system", content: systemPrompt }, ...convertToMistralMessages(messages)],
			maxTokens: this.options.includeMaxTokens ? this.getModel().info.maxTokens : undefined,
			temperature: this.options.modelTemperature ?? MISTRAL_DEFAULT_TEMPERATURE,
		})

		for await (const chunk of response) {
			const delta = chunk.data.choices[0]?.delta
			if (delta?.content) {
				let content: string = ""
				if (typeof delta.content === "string") {
					content = delta.content
				} else if (Array.isArray(delta.content)) {
					content = delta.content.map((c) => (c.type === "text" ? c.text : "")).join("")
				}
				yield {
					type: "text",
					text: content,
				}
			}

			// Handle tool calls with MCP integration
			if (delta?.toolCalls) {
				for (const toolCall of delta.toolCalls) {
					if (toolCall.function?.name && toolCall.function?.arguments) {
						try {
							const args =
								typeof toolCall.function.arguments === "string"
									? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
									: (toolCall.function.arguments as Record<string, unknown>)

							const toolUseInput = {
								name: toolCall.function.name,
								arguments: args,
							}

							const toolResult = await this.processToolUse(toolUseInput)
							const toolResultString =
								typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

							yield {
								type: "tool_result",
								id: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
								content: toolResultString,
							}
						} catch (error) {
							console.warn("Mistral tool use error:", error)
							yield {
								type: "tool_result",
								id: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
								content: `Error: ${error instanceof Error ? error.message : String(error)}`,
							}
						}
					}
				}
			}

			if (chunk.data.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.data.usage.promptTokens || 0,
					outputTokens: chunk.data.usage.completionTokens || 0,
				}
			}
		}
	}

	override getModel(): { id: MistralModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in mistralModels) {
			const id = modelId as MistralModelId
			return { id, info: mistralModels[id] }
		}
		return {
			id: mistralDefaultModelId,
			info: mistralModels[mistralDefaultModelId],
		}
	}

	/**
	 * Counts tokens for the given content
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// For now, use the base provider's implementation
			// Mistral doesn't have a native token counting API
			return super.countTokens(content)
		} catch (error) {
			console.warn("Mistral token counting error, using fallback", error)
			return super.countTokens(content)
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const response = await this.client.chat.complete({
				model: this.options.apiModelId || mistralDefaultModelId,
				messages: [{ role: "user", content: prompt }],
				temperature: this.options.modelTemperature ?? MISTRAL_DEFAULT_TEMPERATURE,
			})

			const content = response.choices?.[0]?.message.content
			if (Array.isArray(content)) {
				return content.map((c) => (c.type === "text" ? c.text : "")).join("")
			}
			return content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Mistral completion error: ${error.message}`)
			}
			throw error
		}
	}
}
