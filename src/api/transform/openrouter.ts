import OpenAI from "openai"
import type { NeutralConversationHistory } from "../../shared/neutral-history"

/**
 * OpenRouter-specific chat completion parameters
 */
export interface OpenRouterChatCompletionParams {
	/** Base OpenAI parameters */
	model: string
	messages: OpenAI.Chat.ChatCompletionMessageParam[]
	stream?: boolean
	stream_options?: { include_usage: boolean }
	max_tokens?: number
	temperature?: number
	top_p?: number
	
	/** OpenRouter-specific parameters */
	transforms?: string[]
	include_reasoning?: boolean
	thinking?: boolean | "auto"
	provider?: {
		order: string[]
	}
}

/**
 * OpenRouter transform options
 */
export interface OpenRouterTransformOptions {
	/** Enable middle-out transform */
	useMiddleOutTransform?: boolean
	/** Specific provider to use */
	specificProvider?: string
	/** Enable thinking mode */
	enableThinking?: boolean
	/** Include reasoning in response */
	includeReasoning?: boolean
}

/**
 * Converts messages for OpenRouter API with specific transformations
 */
export function convertToOpenRouterFormat(
	messages: OpenAI.Chat.ChatCompletionMessageParam[],
	options: OpenRouterTransformOptions = {}
): OpenRouterChatCompletionParams {
	// Build OpenRouter-specific parameters
	const openRouterParams: OpenRouterChatCompletionParams = {
		model: "gpt-3.5-turbo", // Default model, will be overridden by caller
		messages,
		stream: true,
		stream_options: { include_usage: true },
	}

	// Add transforms if enabled
	if (options.useMiddleOutTransform) {
		openRouterParams.transforms = ["middle-out"]
	}

	// Add provider preference if specified
	if (options.specificProvider && options.specificProvider !== "[default]") {
		openRouterParams.provider = {
			order: [options.specificProvider]
		}
	}

	// Add thinking mode if enabled
	if (options.enableThinking) {
		openRouterParams.thinking = true
	}

	// Add reasoning if enabled
	if (options.includeReasoning) {
		openRouterParams.include_reasoning = true
	}

	return openRouterParams
}

/**
 * Processes OpenRouter-specific cache control for Anthropic models
 */
export function applyAnthropicCacheControl(
	messages: OpenAI.Chat.ChatCompletionMessageParam[],
	systemPrompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const modifiedMessages = [...messages]

	// Set cache control on system message
	if (modifiedMessages.length > 0 && modifiedMessages[0].role === "system") {
		modifiedMessages[0] = {
			role: "system",
			content: [
				{
					type: "text",
					text: systemPrompt,
					// Anthropic-specific cache control - use unknown to bypass type checking
					cache_control: { type: "ephemeral" } as unknown as undefined,
				} as OpenAI.Chat.ChatCompletionContentPart,
			],
		}
	}

	// Add cache control to last two user messages
	const userMessages = modifiedMessages.filter((msg) => msg.role === "user")
	const lastTwoUserMessages = userMessages.slice(-2)

	lastTwoUserMessages.forEach((msg) => {
		if (typeof msg.content === "string") {
			msg.content = [{ type: "text", text: msg.content }]
		}

		if (Array.isArray(msg.content)) {
			// Find the last text part
			const textParts = msg.content.filter((part) => part.type === "text")
			let lastTextPart = textParts[textParts.length - 1]

			if (!lastTextPart) {
				lastTextPart = { type: "text", text: "..." }
				msg.content.push(lastTextPart)
			}

			// Add cache control to the last text part - use unknown to bypass type checking
			const textPartWithCache = lastTextPart as unknown as Record<string, unknown>
			textPartWithCache.cache_control = { type: "ephemeral" }
		}
	})

	return modifiedMessages
}

/**
 * Validates OpenRouter parameters
 */
export function validateOpenRouterParams(
	params: OpenRouterChatCompletionParams
): { valid: boolean; errors: string[] } {
	const errors: string[] = []

	// Validate transforms
	if (params.transforms && !Array.isArray(params.transforms)) {
		errors.push("transforms must be an array")
	}

	// Validate provider
	if (params.provider && (!params.provider.order || !Array.isArray(params.provider.order))) {
		errors.push("provider.order must be an array")
	}

	// Validate thinking mode
	if (params.thinking !== undefined && 
		typeof params.thinking !== "boolean" && 
		params.thinking !== "auto") {
		errors.push("thinking must be boolean or 'auto'")
	}

	// Validate include_reasoning
	if (params.include_reasoning !== undefined && typeof params.include_reasoning !== "boolean") {
		errors.push("include_reasoning must be boolean")
	}

	return {
		valid: errors.length === 0,
		errors
	}
}

/**
 * Creates a complete OpenRouter completion request
 */
export function createOpenRouterRequest(
	systemPrompt: string,
	history: NeutralConversationHistory,
	modelId: string,
	options: OpenRouterTransformOptions & {
		maxTokens?: number
		temperature?: number
		topP?: number
	} = {}
): OpenRouterChatCompletionParams {
	// Convert neutral history to OpenAI format first
	// This would typically import from openai-format.ts
	const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: "system", content: systemPrompt },
		// For now, simplified conversion - in real implementation would use convertToOpenAiMessages
		...history.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: typeof msg.content === "string" ? msg.content : "[Complex content]"
		}))
	]

	// Apply Anthropic cache control if needed
	const processedMessages = modelId.startsWith("anthropic/") 
		? applyAnthropicCacheControl(openAiMessages, systemPrompt)
		: openAiMessages

	// Create base OpenRouter parameters
	const openRouterParams = convertToOpenRouterFormat(processedMessages, options)

	// Override with specific parameters
	openRouterParams.model = modelId
	
	if (options.maxTokens !== undefined) {
		openRouterParams.max_tokens = options.maxTokens
	}
	
	if (options.temperature !== undefined) {
		openRouterParams.temperature = options.temperature
	}
	
	if (options.topP !== undefined) {
		openRouterParams.top_p = options.topP
	}

	// Validate the final parameters
	const validation = validateOpenRouterParams(openRouterParams)
	if (!validation.valid) {
		throw new Error(`Invalid OpenRouter parameters: ${validation.errors.join(", ")}`)
	}

	return openRouterParams
}