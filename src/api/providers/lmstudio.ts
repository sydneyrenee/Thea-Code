import axios from "axios"

import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
import { NeutralConversationHistory } from "../../shared/neutral-history"
import { ApiStream } from "../transform/stream"
import { OpenAiCompatibleHandler } from "./openai-compatible-base"
import { OpenAiHandler } from "./openai"

const LMSTUDIO_DEFAULT_TEMPERATURE = 0

export class LmStudioHandler extends OpenAiCompatibleHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super(options, {
			apiKey: "noop", // LMStudio doesn't require a real API key
			baseUrl: (options.lmStudioBaseUrl || "http://localhost:1234") + "/v1",
			modelId: options.lmStudioModelId || "",
			includeMaxTokens: false,
			streamingEnabled: true,
		})
	}

	override createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// Apply LMStudio-specific temperature override if needed
		if (this.options.modelTemperature === undefined) {
			// Create a new options object with LMStudio temperature
			const lmStudioOptions = { ...this.options, modelTemperature: LMSTUDIO_DEFAULT_TEMPERATURE }
			// Create a new handler with the updated options
			const lmStudioHandler = new OpenAiHandler({
				...lmStudioOptions,
				openAiApiKey: "noop",
				openAiModelId: this.options.lmStudioModelId || "",
				openAiBaseUrl: (this.options.lmStudioBaseUrl || "http://localhost:1234") + "/v1",
				openAiStreamingEnabled: true,
			})
			return lmStudioHandler.createMessage(systemPrompt, messages)
		}
		
		// TODO: Handle LMStudio-specific speculative decoding parameters
		// This requires extending the OpenAI handler to support custom params
		// For now, delegate to OpenAI handler for consistent tool use handling
		return this.openAiHandler.createMessage(systemPrompt, messages)
	}

	override getModel(): { id: string; info: ModelInfo } {
		return this.getProviderModelInfo()
	}

	protected getProviderModelInfo(): { id: string; info: ModelInfo } {
		return {
			id: this.options.lmStudioModelId || "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		// For non-streaming completion, we can delegate to the OpenAI handler's client
		// or implement this method using the unified approach
		try {
			// This is a simplified implementation - could be enhanced
			let result = ""
			for await (const chunk of this.createMessage("", [{ role: "user", content: [{ type: "text", text: prompt }] }])) {
				if (chunk.type === "text") {
					result += chunk.text
				}
			}
			return result
		} catch {
			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Thea Code's prompts.",
			)
		}
	}
}

export async function getLmStudioModels(baseUrl = "http://localhost:1234") {
	try {
		if (!URL.canParse(baseUrl)) {
			return []
		}

		const response = await axios.get(`${baseUrl}/v1/models`)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const modelsArray = response.data?.data?.map((model: { id: string }) => model.id) || [] // Type 'model'
		return [...new Set<string>(modelsArray as string[])] // Assert modelsArray is string[]
	} catch {
		// const error = _e as Error; // Unused
		return []
	}
}
