import { NeutralAnthropicClient } from "../../services/anthropic"
import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history" // Import neutral history types
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants"
import { SingleCompletionHandler, getModelParams } from "../index"

export class AnthropicHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private client: NeutralAnthropicClient

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new NeutralAnthropicClient(this.options.apiKey, this.options.anthropicBaseUrl || undefined)
	}

	// Updated to accept NeutralConversationHistory
	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const { id: modelId, maxTokens, temperature, thinking } = this.getModel()

		const stream = this.client.createMessage({
			model: modelId,
			systemPrompt,
			messages,
			maxTokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
			temperature,
			thinking,
		})

		for await (const chunk of stream) {
			if (chunk.type === "tool_use") {
				const toolResult = await this.processToolUse({
					id: chunk.id,
					name: chunk.name,
					input: chunk.input,
				})

				const toolResultString = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

				yield {
					type: "tool_result",
					id: chunk.id,
					content: toolResultString,
				}
			} else {
				yield chunk
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		let id = modelId && modelId in anthropicModels ? (modelId as AnthropicModelId) : anthropicDefaultModelId
		const info: ModelInfo = anthropicModels[id]

		// Track the original model ID for special variant handling
		const virtualId = id

		// Special handling for thinking variants
		// The `:thinking` variant is a virtual identifier for the
		// `claude-3-7-sonnet-20250219` model with a thinking budget.
		if (id === "claude-3-7-sonnet-20250219:thinking") {
			id = "claude-3-7-sonnet-20250219"
		}

		// Get base model parameters
		const baseParams = getModelParams({
			options: this.options,
			model: info,
			defaultMaxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
		})

		// Model-specific thinking adjustments
		if (info.thinking) {
			// For models that support thinking, ensure proper configuration
			const customMaxTokens = this.options.modelMaxTokens
			const customMaxThinkingTokens = this.options.modelMaxThinkingTokens

			// Set thinking parameter for model variants that use it
			if (virtualId.includes(":thinking")) {
				// Clamp the thinking budget to be at most 80% of max tokens and at least 1024 tokens
				const effectiveMaxTokens = customMaxTokens ?? baseParams.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS
				const maxBudgetTokens = Math.floor(effectiveMaxTokens * 0.8)
				const budgetTokens = Math.max(
					Math.min(customMaxThinkingTokens ?? maxBudgetTokens, maxBudgetTokens),
					1024,
				)

				// Override thinking with specific budget
				baseParams.thinking = {
					type: "enabled",
					budget_tokens: budgetTokens,
				}
			}
		}

		return {
			id,
			info,
			virtualId, // Include the original ID to use for header selection
			...baseParams,
		}
	}

	async completePrompt(prompt: string) {
		let { id: modelId, temperature } = this.getModel()

		let text = ""
		const stream = this.client.createMessage({
			model: modelId,
			systemPrompt: "",
			messages: [{ role: "user", content: prompt }],
			maxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
			temperature,
		})

		for await (const chunk of stream) {
			if (chunk.type === "text") {
				text += chunk.text
			}
		}

		return text
	}

	/**
	 * Counts tokens for the given content using Anthropic's API
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			const actualModelId = this.getModel().id
			return await this.client.countTokens(actualModelId, content)
		} catch (error) {
			// Log error but fallback to tiktoken estimation
			console.warn("Anthropic token counting failed, using fallback", error)

			// Use the base provider's implementation as fallback (which now expects NeutralMessageContent)
			return super.countTokens(content) // Pass the original neutral content
		}
	}
}
