import axios from "axios"

import { ApiHandlerOptions, ModelInfo, glamaDefaultModelId, glamaDefaultModelInfo } from "../../shared/api"
import { parseApiPrice } from "../../utils/cost"
import { ApiStream } from "../transform/stream"
import { SingleCompletionHandler } from "../"
import { OpenAiCompatibleHandler } from "./openai-compatible-base"
import { NeutralConversationHistory } from "../../shared/neutral-history"
import { supportsTemperature } from "../../utils/model-capabilities"

export class GlamaHandler extends OpenAiCompatibleHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super(options, {
			apiKey: options.glamaApiKey ?? "not-provided",
			baseUrl: "https://glama.ai/api/gateway/openai/v1",
			modelId: options.glamaModelId ?? glamaDefaultModelId,
			modelInfo: options.glamaModelInfo ?? glamaDefaultModelInfo,
			includeMaxTokens: false,
			streamingEnabled: true,
		})
	}

	private supportsTemperature(): boolean {
		// Use the capability detection function from model-capabilities.ts
		return supportsTemperature(this.getModel().info)
	}

	override getModel(): { id: string; info: ModelInfo } {
		return this.getProviderModelInfo()
	}

	protected getProviderModelInfo(): { id: string; info: ModelInfo } {
		const modelId = this.options.glamaModelId
		const modelInfo = this.options.glamaModelInfo

		if (modelId && modelInfo) {
			return { id: modelId, info: modelInfo }
		}

		return { id: glamaDefaultModelId, info: glamaDefaultModelInfo }
	}

	override createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// TODO: For now, delegate to OpenAI handler for tool use consistency
		// In the future, we should extend the OpenAI handler to support:
		// 1. Custom headers (X-Glama-Metadata)
		// 2. Cache control for Anthropic models
		// 3. Custom completion request tracking
		// 
		// This eliminates the direct tool_calls parsing that was causing architectural issues

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
			throw new Error(`Glama completion error: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

export async function getGlamaModels() {
	const models: Record<string, ModelInfo> = {}

	try {
		const response = await axios.get("https://glama.ai/api/gateway/v1/models")
		const rawModels = response.data as {
			id: string
			maxTokensOutput?: number
			maxTokensInput?: number
			capabilities?: string[]
			pricePerToken?: {
				input?: string | number
				output?: string | number
				cacheWrite?: string | number
				cacheRead?: string | number
			}
		}[]

		for (const rawModel of rawModels) {
			const modelInfo: ModelInfo = {
				maxTokens: rawModel.maxTokensOutput, // maxTokens can be undefined in ModelInfo, so this is fine
				contextWindow: rawModel.maxTokensInput ?? 0,
				supportsImages: rawModel.capabilities?.includes("input:image"), // supportsImages can be undefined in ModelInfo
				supportsComputerUse: rawModel.capabilities?.includes("computer_use"), // supportsComputerUse can be undefined
				supportsPromptCache: rawModel.capabilities?.includes("caching") ?? false,
				supportsTemperature: !rawModel.capabilities?.includes("low_reasoning"), // Set temperature support based on capabilities
				inputPrice: parseApiPrice(rawModel.pricePerToken?.input),
				outputPrice: parseApiPrice(rawModel.pricePerToken?.output),
				description: undefined, // Ensure description is explicitly undefined if not present
				cacheWritesPrice: parseApiPrice(rawModel.pricePerToken?.cacheWrite),
				cacheReadsPrice: parseApiPrice(rawModel.pricePerToken?.cacheRead),
			}

			// Set default maxTokens for models that don't specify it
			// but are known to support at least 8192 tokens
			if (!modelInfo.maxTokens && (rawModel.capabilities?.includes("tool_use") || 
			    rawModel.capabilities?.includes("caching"))) {
				modelInfo.maxTokens = 8192
			}

			models[rawModel.id] = modelInfo
		}
	} catch (error) {
		console.error(`Error fetching Glama models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
	}

	return models
}
