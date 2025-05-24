import axios from "axios"

import { ModelInfo, requestyDefaultModelInfo, requestyDefaultModelId } from "../../shared/api"
import { calculateApiCostOpenAI, parseApiPrice } from "../../utils/cost"
import { ApiStreamUsageChunk } from "../transform/stream"
import { OpenAiHandler, OpenAiHandlerOptions } from "./openai"
import OpenAI from "openai"

// Requesty usage includes an extra field for Anthropic use cases.
// Safely cast the prompt token details section to the appropriate structure.
interface RequestyUsage extends OpenAI.CompletionUsage {
	prompt_tokens_details?: {
		caching_tokens?: number
		cached_tokens?: number
	}
	total_cost?: number
}

export class RequestyHandler extends OpenAiHandler {
	constructor(options: OpenAiHandlerOptions) {
		if (!options.requestyApiKey) {
			throw new Error("Requesty API key is required. Please provide it in the settings.")
		}
		super({
			...options,
			openAiApiKey: options.requestyApiKey,
			openAiModelId: options.requestyModelId ?? requestyDefaultModelId,
			openAiBaseUrl: "https://router.requesty.ai/v1",
			openAiCustomModelInfo: options.requestyModelInfo ?? requestyDefaultModelInfo,
		})
	}

	override getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.requestyModelId ?? requestyDefaultModelId
		return {
			id: modelId,
			info: this.options.requestyModelInfo ?? requestyDefaultModelInfo,
		}
	}

	protected override processUsageMetrics(usage: RequestyUsage, modelInfo?: ModelInfo): ApiStreamUsageChunk {
		// const requestyUsage = usage as RequestyUsage; // No longer needed as usage is typed
		const inputTokens = usage?.prompt_tokens || 0
		const outputTokens = usage?.completion_tokens || 0
		const cacheWriteTokens = usage?.prompt_tokens_details?.caching_tokens || 0
		const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens || 0
		const totalCost = modelInfo
			? calculateApiCostOpenAI(modelInfo, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
			: 0
		return {
			type: "usage",
			inputTokens: inputTokens,
			outputTokens: outputTokens,
			cacheWriteTokens: cacheWriteTokens,
			cacheReadTokens: cacheReadTokens,
			totalCost: totalCost,
		}
	}
}

interface RequestyRawModel {
  id: string;
  max_output_tokens?: number | null;
  context_window?: number | null;
  supports_caching?: boolean | null;
  supports_vision?: boolean | null;
  supports_computer_use?: boolean | null;
  input_price?: string | number | null;
  output_price?: string | number | null;
  description?: string | null;
  caching_price?: string | number | null;
  cached_price?: string | number | null;
  [key: string]: unknown;
}

interface RequestyModelsResponse {
  data: RequestyRawModel[];
}

export async function getRequestyModels() {
	const models: Record<string, ModelInfo> = {}

	try {
		const response = await axios.get("https://router.requesty.ai/v1/models")
		const rawModels = (response.data as RequestyModelsResponse).data

		for (const rawModel of rawModels) {
			// {
			// 	id: "anthropic/claude-3-5-sonnet-20240620",
			// 	object: "model",
			// 	created: 1740552655,
			// 	owned_by: "system",
			// 	input_price: 0.0000028,
			// 	caching_price: 0.00000375,
			// 	cached_price: 3e-7,
			// 	output_price: 0.000015,
			// 	max_output_tokens: 8192,
			// 	context_window: 200000,
			// 	supports_caching: true,
			// 	description:
			// 		"Anthropic's previous most intelligent model. High level of intelligence and capability. Excells in coding.",
			// }

			const modelInfo: ModelInfo = {
				maxTokens: rawModel.max_output_tokens ?? undefined,
				contextWindow: rawModel.context_window ?? 0,
				supportsPromptCache: rawModel.supports_caching ?? false,
				supportsImages: rawModel.supports_vision ?? false,
				supportsComputerUse: rawModel.supports_computer_use ?? false,
				inputPrice: parseApiPrice(rawModel.input_price),
				outputPrice: parseApiPrice(rawModel.output_price),
				description: rawModel.description ?? undefined,
				cacheWritesPrice: parseApiPrice(rawModel.caching_price),
				cacheReadsPrice: parseApiPrice(rawModel.cached_price),
			}

			models[rawModel.id] = modelInfo
		}
	} catch (error) {
		console.error(`Error fetching Requesty models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
	}

	return models
}
