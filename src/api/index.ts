import { BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta/messages/index.mjs"

import { ApiConfiguration, ModelInfo, ApiHandlerOptions } from "../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../shared/neutral-history"; // Import neutral history types
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./providers/constants"
// import { GlamaHandler } from "./providers/glama" // Temporarily commented out until updated to use neutral format
import { AnthropicHandler } from "./providers/anthropic"
import { AwsBedrockHandler } from "./providers/bedrock"
import { OpenRouterHandler } from "./providers/openrouter"
import { VertexHandler } from "./providers/vertex"
// import { OpenAiHandler } from "./providers/openai" // Temporarily commented out until updated to use neutral format
// import { OllamaHandler } from "./providers/ollama" // Temporarily commented out until updated to use neutral format
// import { LmStudioHandler } from "./providers/lmstudio" // Temporarily commented out until updated to use neutral format
import { GeminiHandler } from "./providers/gemini"
// import { OpenAiNativeHandler } from "./providers/openai-native" // Temporarily commented out until updated to use neutral format
// import { DeepSeekHandler } from "./providers/deepseek" // Temporarily commented out until updated to use neutral format
// import { MistralHandler } from "./providers/mistral" // Temporarily commented out until updated to use neutral format
// import { VsCodeLmHandler } from "./providers/vscode-lm" // Temporarily commented out until updated to use neutral format
import { ApiStream } from "./transform/stream"
// import { UnboundHandler } from "./providers/unbound" // Temporarily commented out until updated to use neutral format
// import { RequestyHandler } from "./providers/requesty" // Temporarily commented out until updated to use neutral format
// import { HumanRelayHandler } from "./providers/human-relay" // Temporarily commented out until updated to use neutral format
// import { FakeAIHandler } from "./providers/fake-ai" // Temporarily commented out until updated to use neutral format

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

export interface ApiHandler {
	// Updated to use NeutralConversationHistory
	createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream
	getModel(): { id: string; info: ModelInfo }

	/**
	 * Counts tokens for content blocks
	 * All providers extend BaseProvider which provides a default tiktoken implementation,
	 * but they can override this to use their native token counting endpoints
	 *
	 * @param content The content to count tokens for (using NeutralMessageContent)
	 * @returns A promise resolving to the token count
	 */
	// Updated to use NeutralMessageContent
	countTokens(content: NeutralMessageContent): Promise<number>
}

export function buildApiHandler(configuration: ApiConfiguration): ApiHandler {
	const { apiProvider, ...options } = configuration
	switch (apiProvider) {
		case "anthropic":
			return new AnthropicHandler(options)
		case "glama":
			// return new GlamaHandler(options) // Temporarily commented out
			throw new Error("GlamaHandler is temporarily disabled.")
		case "openrouter":
			return new OpenRouterHandler(options)
		case "bedrock":
			return new AwsBedrockHandler(options)
		case "vertex":
			return new VertexHandler(options)
		case "openai":
			// return new OpenAiHandler(options) // Temporarily commented out
			throw new Error("OpenAiHandler is temporarily disabled.")
		case "ollama":
			// return new OllamaHandler(options) // Temporarily commented out
			throw new Error("OllamaHandler is temporarily disabled.")
		case "lmstudio":
			// return new LmStudioHandler(options) // Temporarily commented out
			throw new Error("LmStudioHandler is temporarily disabled.")
		case "gemini":
			return new GeminiHandler(options)
		case "openai-native":
			// return new OpenAiNativeHandler(options) // Temporarily commented out
			throw new Error("OpenAiNativeHandler is temporarily disabled.")
		case "deepseek":
			// return new DeepSeekHandler(options) // Temporarily commented out
			throw new Error("DeepSeekHandler is temporarily disabled.")
		case "vscode-lm":
			// return new VsCodeLmHandler(options) // Temporarily commented out
			throw new Error("VsCodeLmHandler is temporarily disabled.")
		case "mistral":
			// return new MistralHandler(options) // Temporarily commented out
			throw new Error("MistralHandler is temporarily disabled.")
		case "unbound":
			// return new UnboundHandler(options) // Temporarily commented out
			throw new Error("UnboundHandler is temporarily disabled.")
		case "requesty":
			// return new RequestyHandler(options) // Temporarily commented out
			throw new Error("RequestyHandler is temporarily disabled.")
		case "human-relay":
			// return new HumanRelayHandler(options) // Temporarily commented out
			throw new Error("HumanRelayHandler is temporarily disabled.")
		case "fake-ai":
			// return new FakeAIHandler(options) // Temporarily commented out
			throw new Error("FakeAIHandler is temporarily disabled.")
		default:
			// Default to AnthropicHandler, but it will now expect NeutralHistory
			return new AnthropicHandler(options)
	}
}

export function getModelParams({
	options,
	model,
	defaultMaxTokens,
	defaultTemperature = 0,
}: {
	options: ApiHandlerOptions
	model: ModelInfo
	defaultMaxTokens?: number
	defaultTemperature?: number
}) {
	const {
		modelMaxTokens: customMaxTokens,
		modelMaxThinkingTokens: customMaxThinkingTokens,
		modelTemperature: customTemperature,
	} = options

	let maxTokens = model.maxTokens ?? defaultMaxTokens
	let thinking: BetaThinkingConfigParam | undefined = undefined
	let temperature = customTemperature ?? defaultTemperature

	if (model.thinking) {
		// Only honor `customMaxTokens` for thinking models.
		maxTokens = customMaxTokens ?? maxTokens

		// Clamp the thinking budget to be at most 80% of max tokens and at
		// least 1024 tokens.
		const maxBudgetTokens = Math.floor((maxTokens || ANTHROPIC_DEFAULT_MAX_TOKENS) * 0.8)
		const budgetTokens = Math.max(Math.min(customMaxThinkingTokens ?? maxBudgetTokens, maxBudgetTokens), 1024)
		thinking = { type: "enabled", budget_tokens: budgetTokens }

		// Anthropic "Thinking" models require a temperature of 1.0.
		temperature = 1.0
	}

	return { maxTokens, thinking, temperature }
}
