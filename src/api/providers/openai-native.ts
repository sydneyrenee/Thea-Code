import { SingleCompletionHandler } from "../"
import {
	ApiHandlerOptions,
	ModelInfo,
	openAiNativeDefaultModelId,
	OpenAiNativeModelId,
	openAiNativeModels,
} from "../../shared/api"
import type { NeutralConversationHistory } from "../../shared/neutral-history"
import { ApiStream } from "../transform/stream"
import { OpenAiCompatibleHandler } from "./openai-compatible-base"

export class OpenAiNativeHandler extends OpenAiCompatibleHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super(options, {
			apiKey: options.openAiNativeApiKey ?? "not-provided",
			baseUrl: "https://api.openai.com/v1", // Official OpenAI endpoint
			modelId: options.apiModelId ?? openAiNativeDefaultModelId,
			includeMaxTokens: false,
			streamingEnabled: true,
		})
	}

	override getModel(): { id: string; info: ModelInfo } {
		return this.getProviderModelInfo()
	}

	protected getProviderModelInfo(): { id: string; info: ModelInfo } {
		const modelId = (this.options.apiModelId ?? openAiNativeDefaultModelId) as OpenAiNativeModelId
		const modelInfo = openAiNativeModels[modelId] || openAiNativeModels[openAiNativeDefaultModelId]

		return {
			id: modelId,
			info: modelInfo,
		}
	}

	override createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// TODO: For now, delegate to OpenAI handler for tool use consistency
		// In the future, we should extend the OpenAI handler to support:
		// 1. o1 family special handling (developer role, no system messages)
		// 2. o3 family special handling
		// 3. Different streaming options
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
			throw new Error(`OpenAI Native completion error: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}
