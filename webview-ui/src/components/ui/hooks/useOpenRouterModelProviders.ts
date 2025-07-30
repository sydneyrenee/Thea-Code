import axios from "axios"
import { z } from "zod"
import { useQuery, UseQueryOptions } from "@tanstack/react-query"

import { ModelInfo } from "../../../../../src/schemas"
import { parseApiPrice } from "../../../../../src/utils/cost"

export const OPENROUTER_DEFAULT_PROVIDER_NAME = "[default]"

const openRouterEndpointsSchema = z.object({
	data: z.object({
		id: z.string(),
		name: z.string(),
		description: z.string().optional(),
		architecture: z
			.object({
				modality: z.string().nullish(),
				tokenizer: z.string().nullish(),
			})
			.nullish(),
		endpoints: z.array(
			z.object({
				name: z.string(),
				context_length: z.number(),
				max_completion_tokens: z.number().nullish(),
				pricing: z
					.object({
						prompt: z.union([z.string(), z.number()]).optional(),
						completion: z.union([z.string(), z.number()]).optional(),
					})
					.optional(),
			}),
		),
	}),
})

type OpenRouterModelProvider = ModelInfo & {
	label: string
}

async function getOpenRouterProvidersForModel(modelId: string) {
	const models: Record<string, OpenRouterModelProvider> = {}

	try {
		const response = await axios.get(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`)
		const result = openRouterEndpointsSchema.safeParse(response.data)

		if (!result.success) {
			console.error("OpenRouter API response validation failed:", result.error)
			return models
		}

		const { description, architecture, endpoints } = result.data.data

		for (const endpoint of endpoints) {
			const providerName = endpoint.name.split("|")[0].trim()
			const inputPrice = parseApiPrice(endpoint.pricing?.prompt)
			const outputPrice = parseApiPrice(endpoint.pricing?.completion)

			// Initialize model info with properties from the API response
			const modelInfo: OpenRouterModelProvider = {
				maxTokens: endpoint.max_completion_tokens || endpoint.context_length,
				contextWindow: endpoint.context_length,
				// Detect image support based on model architecture
				supportsImages: architecture?.modality?.includes("image"),
				// Default capability values
				supportsPromptCache: true, // Enable prompt caching by default
				supportsTemperature: true, // Most models support temperature adjustment
				inputPrice,
				outputPrice,
				description,
				label: providerName,
			}
			
			// Set default cache pricing
			modelInfo.cacheWritesPrice = 0.3
			modelInfo.cacheReadsPrice = 0.03
			
			// Detect model capabilities based on model properties and patterns
			
			// Detect thinking capability based on model ID pattern
			const hasThinkingCapability = modelId.includes(":thinking") || modelId.endsWith("-thinking")
			modelInfo.thinking = hasThinkingCapability
			
			// Detect computer use capability based on model family
			// Currently only Claude 3.7+ models support computer use
			const isAdvancedModel = modelId.includes("claude-3.7") || 
			                        modelId.includes("claude-3-opus") || 
			                        modelId.includes("claude-3-sonnet") ||
			                        modelId.includes("gpt-4") ||
			                        modelId.includes("gpt4")
			
			if (isAdvancedModel) {
				modelInfo.supportsComputerUse = true
			}
			
			// Set pricing and token limits based on model family
			const isClaudeLatestGen = modelId.includes("claude-3.5") || modelId.includes("claude-3.7")
			
			if (isClaudeLatestGen) {
				// Higher cache prices for latest Claude models
				modelInfo.cacheWritesPrice = 3.75
				modelInfo.cacheReadsPrice = 0.3
				
				// Set max tokens based on model and thinking capability
				if (modelId.includes("claude-3.7") && hasThinkingCapability) {
					modelInfo.maxTokens = 64_000 // Higher token limit for thinking-enabled Claude 3.7
				} else {
					modelInfo.maxTokens = 8192 // Standard token limit for other Claude models
				}
			}

			models[providerName] = modelInfo
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error(`OpenRouter API response validation failed:`, error.errors)
		} else {
			console.error(`Error fetching OpenRouter providers:`, error)
		}
	}

	return models
}

type UseOpenRouterModelProvidersOptions = Omit<
	UseQueryOptions<Record<string, OpenRouterModelProvider>>,
	"queryKey" | "queryFn"
>

export const useOpenRouterModelProviders = (modelId?: string, options?: UseOpenRouterModelProvidersOptions) =>
	useQuery<Record<string, OpenRouterModelProvider>>({
		queryKey: ["openrouter-model-providers", modelId],
		queryFn: () => (modelId ? getOpenRouterProvidersForModel(modelId) : {}),
		...options,
	})
