import { ApiHandlerOptions, ModelInfo } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import { OpenAiHandler } from "./openai"
import { ApiStream } from "../transform/stream"

/**
 * Unified base class for OpenAI-compatible providers.
 * Eliminates SDK duplication and ensures consistent tool use delegation.
 */
export abstract class OpenAiCompatibleHandler {
	protected openAiHandler: OpenAiHandler
	protected options: ApiHandlerOptions

	constructor(
		options: ApiHandlerOptions,
		config: {
			apiKey: string
			baseUrl: string
			modelId: string
			modelInfo?: ModelInfo
			includeMaxTokens?: boolean
			streamingEnabled?: boolean
		}
	) {
		this.options = options
		// Delegate everything to the OpenAI handler - single source of truth
		this.openAiHandler = new OpenAiHandler({
			...options,
			openAiApiKey: config.apiKey,
			openAiModelId: config.modelId,
			openAiBaseUrl: config.baseUrl,
			openAiCustomModelInfo: config.modelInfo,
			openAiStreamingEnabled: config.streamingEnabled ?? true,
			includeMaxTokens: config.includeMaxTokens ?? false,
		})
	}

	// Delegate all methods to the OpenAI handler
	createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		return this.openAiHandler.createMessage(systemPrompt, messages)
	}

	getModel() {
		return this.openAiHandler.getModel()
	}

	// Delegate token counting to OpenAI handler
	async countTokens(content: NeutralMessageContent): Promise<number> {
		return this.openAiHandler.countTokens(content)
	}

	// Allow subclasses to override model info if needed
	protected abstract getProviderModelInfo(): { id: string; info: ModelInfo }
}

/**
 * Configuration interface for OpenAI-compatible providers
 */
export interface OpenAiCompatibleConfig {
	apiKey: string
	baseUrl: string
	defaultModelId: string
	modelInfo?: ModelInfo
	includeMaxTokens?: boolean
	streamingEnabled?: boolean
}
