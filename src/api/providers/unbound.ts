import { ApiHandlerOptions, ModelInfo, unboundDefaultModelId, unboundDefaultModelInfo } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { SingleCompletionHandler } from "../"
import { OpenAiCompatibleHandler } from "./openai-compatible-base"
import type { NeutralConversationHistory } from "../../shared/neutral-history"
import { supportsTemperature } from "../../utils/model-capabilities"

/**
 * Get available Unbound models
 * 
 * This function returns a static list of known Unbound models with their capabilities.
 * Each model has specific capabilities defined based on its features:
 * - Default model: Supports temperature adjustment
 * - o3-mini: Optimized for speed but doesn't support temperature adjustment
 * 
 * In the future, this could be enhanced to fetch the model list dynamically
 * from the Unbound API if they provide such functionality.
 */
export function getUnboundModels(): Record<string, ModelInfo> {
	// Define models with their capabilities
	const models: ModelInfo[] = [
		// Default model (Claude-based)
		{
			...unboundDefaultModelInfo,
			supportsTemperature: true, // Supports temperature adjustment
		},
		// o3-mini model
		{
			contextWindow: 128000,
			supportsImages: false,
			supportsPromptCache: false,
			supportsTemperature: false, // o3-mini is optimized for speed and doesn't support temperature
			inputPrice: 0.0006, // per 1K tokens
			outputPrice: 0.0024, // per 1K tokens
			description: "Fast and efficient reasoning model",
		},
	]
	
	// Convert array to Record using model IDs as keys
	const result: Record<string, ModelInfo> = {}
	const modelIds = [unboundDefaultModelId, "openai/o3-mini"]
	
	models.forEach((model, index) => {
		result[modelIds[index]] = model
	})
	
	return result
}

export class UnboundHandler extends OpenAiCompatibleHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super(options, {
			apiKey: options.unboundApiKey ?? "not-provided",
			baseUrl: "https://api.getunbound.ai/v1",
			modelId: options.unboundModelId ?? unboundDefaultModelId,
			modelInfo: options.unboundModelInfo ?? unboundDefaultModelInfo,
			includeMaxTokens: false,
			streamingEnabled: true,
		})
	}

	private supportsTemperature(): boolean {
		// Use the capability detection function instead of hardcoded model check
		return supportsTemperature(this.getModel().info)
	}

	override getModel(): { id: string; info: ModelInfo } {
		return this.getProviderModelInfo()
	}

	protected getProviderModelInfo(): { id: string; info: ModelInfo } {
		const modelId = this.options.unboundModelId
		const modelInfo = this.options.unboundModelInfo

		if (modelId && modelInfo) {
			return { id: modelId, info: modelInfo }
		}

		return { id: unboundDefaultModelId, info: unboundDefaultModelInfo }
	}

	override createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// TODO: For now, delegate to OpenAI handler for tool use consistency
		// In the future, we should extend the OpenAI handler to support:
		// 1. Cache control for Anthropic models
		// 2. Temperature handling for specific models
		// 3. Custom usage tracking
		// 
		// This eliminates the direct tool_calls parsing that was causing architectural issues
		
		// Apply temperature logic specific to Unbound
		if (!this.supportsTemperature()) {
			// For models that don't support temperature, would need special handling
		}

		// Delegate to OpenAI handler - this ensures consistent tool use handling
		// The tool_calls will be properly extracted by the OpenAI handler
		// and routed through MCP integration
		return this.openAiHandler.createMessage(systemPrompt, messages)
	}

	async completePrompt(prompt: string): Promise<string> {
		// For non-streaming completion, use the unified approach
		try {
			let result = ""
			for await (const chunk of this.createMessage("", [{ role: "user", content: [{ type: "text", text: prompt }] }])) {
				if (chunk.type === "text") {
					result += chunk.text
				}
			}
			return result
		} catch (error) {
			throw new Error(`Unbound completion error: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}
