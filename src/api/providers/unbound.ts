import { ApiHandlerOptions, ModelInfo, unboundDefaultModelId, unboundDefaultModelInfo } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { SingleCompletionHandler } from "../"
import { OpenAiCompatibleHandler } from "./openai-compatible-base"
import type { NeutralConversationHistory } from "../../shared/neutral-history"
import { supportsTemperature } from "../../utils/model-capabilities"

/**
 * Get available Unbound models
 */
export function getUnboundModels(): Record<string, ModelInfo> {
	// For now, return a static list of known models
	// This can be enhanced later to fetch dynamic model list if Unbound provides an API
	const models: ModelInfo[] = [
		{
			...unboundDefaultModelInfo,
			supportsTemperature: true,
		},
		{
			contextWindow: 128000,
			supportsImages: false,
			supportsPromptCache: false,
			supportsTemperature: false, // o3-mini doesn't support temperature
			inputPrice: 0.0006, // per 1K tokens
			outputPrice: 0.0024, // per 1K tokens
			description: "Fast and efficient reasoning model",
		},
	]
	
	// Convert array to Record using model names as keys
	const result: Record<string, ModelInfo> = {}
	models.forEach((model, index) => {
		// Use a key based on the model info or index
		const key = index === 0 ? unboundDefaultModelId : "openai/o3-mini"
		result[key] = model
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
