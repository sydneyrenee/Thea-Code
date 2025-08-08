import { getBaseModelId, isThinkingModel } from "../../utils/model-pattern-detection" // Import pattern detection functions
import { NeutralVertexClient } from "../../services/vertex" // Import the NeutralVertexClient

import { ApiHandlerOptions, ModelInfo, vertexDefaultModelId, VertexModelId, vertexModels } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"

import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants"
import { getModelParams, SingleCompletionHandler } from "../"
// Types for Vertex SDK

/**
 * Vertex API has specific limitations for prompt caching:
 * 1. Maximum of 4 blocks can have cache_control
 * 2. Only text blocks can be cached (images and other content types cannot)
 * 3. Cache control can only be applied to user messages, not assistant messages
 *
 * Our caching strategy:
 * - Cache the system prompt (1 block)
 * - Cache the last text block of the second-to-last user message (1 block)
 * - Cache the last text block of the last user message (1 block)
 * This ensures we stay under the 4-block limit while maintaining effective caching
 * for the most relevant context.
 */

// https://docs.anthropic.com/en/api/claude-on-vertex-ai
/**
 * Vertex AI Handler implementing the unified, neutral format approach.
 *
 * This handler supports both Claude and Gemini models on Vertex AI using:
 * - Neutral conversation history format for provider-agnostic message handling
 * - MCP (Model Context Protocol) integration for unified tool use across all models
 * - Format conversion utilities for model-specific API calls
 * - Consistent streaming and token counting interfaces
 *
 * The handler automatically detects the model type (Claude vs Gemini) and uses
 * the appropriate conversion functions and API clients while maintaining the
 * same neutral interface for all consumer code.
 */
export class VertexHandler extends BaseProvider implements SingleCompletionHandler {
	// Model family identifiers
	MODEL_CLAUDE = "claude"
	MODEL_GEMINI = "gemini"

	protected options: ApiHandlerOptions
	private neutralVertexClient: NeutralVertexClient
	private modelType: string

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		// Determine model type based on model ID prefix
		// This is still needed for initial client setup, but we'll use capabilities for behavior
		const modelId = this.options.apiModelId || ""
		if (modelId.startsWith(this.MODEL_CLAUDE)) {
			this.modelType = this.MODEL_CLAUDE
		} else if (modelId.startsWith(this.MODEL_GEMINI)) {
			this.modelType = this.MODEL_GEMINI
		} else {
			throw new Error(`Unknown model ID: ${modelId}`)
		}

		// Initialize the NeutralVertexClient with the appropriate options
		const clientOptions = {
			projectId: this.options.vertexProjectId ?? "not-provided",
			region: this.options.vertexRegion ?? "us-east5",
			credentials: this.options.vertexJsonCredentials 
				? JSON.parse(this.options.vertexJsonCredentials) as Record<string, unknown>
				: undefined,
			keyFile: this.options.vertexKeyFile,
		}
		
		this.neutralVertexClient = new NeutralVertexClient(clientOptions)
	}

	private async *createGeminiMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const modelInfo = this.getModel()
		const { id, temperature, maxTokens } = modelInfo
		
		// Use the NeutralVertexClient to create a Gemini message
		const stream = this.neutralVertexClient.createGeminiMessage({
			model: id,
			systemPrompt,
			messages,
			maxTokens: maxTokens ?? undefined,
			temperature,
		})
		
		for await (const chunk of stream) {
			// Handle tool use responses
			if (chunk.type === "tool_use") {
				const toolResult = await this.processToolUse({
					name: chunk.name,
					input: chunk.input,
					id: chunk.id,
				})

				const toolResultString =
					typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

				yield {
					type: "tool_result",
					id: chunk.id,
					content: toolResultString,
				}
			} else {
				// Pass through other chunk types (text, usage, etc.)
				yield chunk
			}
		}
	}

	private async *createClaudeMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const modelInfo = this.getModel()
		const { id, temperature, maxTokens } = modelInfo
		
		// Use the NeutralVertexClient to create a Claude message
		yield* this.neutralVertexClient.createClaudeMessage({
			model: id,
			systemPrompt,
			messages,
			maxTokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
			temperature,
			stream: true,
		})
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// We need to use different clients based on model type due to API differences
		switch (this.modelType) {
			case this.MODEL_CLAUDE: {
				// Claude models use the NeutralVertexClient
				yield* this.createClaudeMessage(systemPrompt, messages)
				break
			}
			case this.MODEL_GEMINI: {
				// Gemini models use the NeutralVertexClient
				yield* this.createGeminiMessage(systemPrompt, messages)
				break
			}
			default: {
				throw new Error(`Invalid model type: ${this.modelType}`)
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		let id = modelId && modelId in vertexModels ? (modelId as VertexModelId) : vertexDefaultModelId
		const info: ModelInfo = vertexModels[id]

		// Track the original model ID for special variant handling
		const virtualId = id

		// Handle thinking variants by extracting the base model ID
		// but preserving the thinking capability in the model info
		if (isThinkingModel(id)) {
			id = getBaseModelId(id) as VertexModelId
		}

		return {
			id,
			info,
			virtualId, // Include the original ID for reference
			...getModelParams({ options: this.options, model: info, defaultMaxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS }),
		}
	}

	private async completePromptGemini(prompt: string) {
		try {
			const { id, temperature, maxTokens } = this.getModel()
			
			// Use the NeutralVertexClient to complete a Gemini prompt
			return await this.neutralVertexClient.completeGeminiPrompt(
				prompt,
				id,
				maxTokens ?? undefined,
				temperature
			)
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Vertex completion error: ${error.message}`)
			}
			throw error
		}
	}

	private async completePromptClaude(prompt: string) {
		try {
			const { id, temperature, maxTokens } = this.getModel()
			
			// Use the NeutralVertexClient to complete a Claude prompt
			return await this.neutralVertexClient.completeClaudePrompt(
				prompt,
				id,
				maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
				temperature
			)
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Vertex completion error: ${error.message}`)
			}

			throw error
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
			// Use the base provider's token counting for all model types
			// Vertex AI doesn't have a native token counting API that works consistently
			// across different model families (Claude, Gemini, etc.)
			return super.countTokens(content)
		} catch (error) {
			console.warn("Vertex token counting error, using fallback", error)
			return super.countTokens(content)
		}
	}

	async completePrompt(prompt: string) {
		// We need to use different clients based on model type due to API differences
		// This is similar to createMessage but for non-streaming completions
		switch (this.modelType) {
			case this.MODEL_CLAUDE: {
				return this.completePromptClaude(prompt)
			}
			case this.MODEL_GEMINI: {
				return this.completePromptGemini(prompt)
			}
			default: {
				throw new Error(`Invalid model type: ${this.modelType}`)
			}
		}
	}
}