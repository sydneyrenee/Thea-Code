import { Anthropic } from "@anthropic-ai/sdk"
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"

import { VertexAI } from "@google-cloud/vertexai"

import { ApiHandlerOptions, ModelInfo, vertexDefaultModelId, VertexModelId, vertexModels } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import { ApiStream } from "../transform/stream"
import {
    convertToVertexGeminiMessage,
    convertToVertexGeminiHistory,
    convertToVertexClaudeHistory,
    convertToVertexClaudeMessage,
    formatMessageForCache,
    convertToVertexClaudeContentBlocks
} from "../transform/neutral-vertex-format"
import { BaseProvider } from "./base-provider"

import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants"
import { getModelParams, SingleCompletionHandler } from "../"
import { GoogleAuth } from "google-auth-library"

// Types for Vertex SDK

/**
 * Vertex API has specific limitations for prompt caching:
 * 1. Maximum of 4 blocks can have cache_control
 * 2. Only text blocks can be cached (images and other content types cannot)
 * 3. Cache control can only be applied to user messages, not assistant messages
 *
 * Our caching strategy:
 * - Cache the system prompt (1 block)
 * - Cache the last text block of the second-to-last user message (1 block)
 * - Cache the last text block of the last user message (1 block)
 * This ensures we stay under the 4-block limit while maintaining effective caching
 * for the most relevant context.
 */

interface VertexTextBlock {
	type: "text"
	text: string
	cache_control?: { type: "ephemeral" }
}

interface VertexImageBlock {
	type: "image"
	source: {
		type: "base64"
		media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
		data: string
	}
}

type VertexContentBlock = VertexTextBlock | VertexImageBlock

interface VertexUsage {
	input_tokens?: number
	output_tokens?: number
	cache_creation_input_tokens?: number
	cache_read_input_tokens?: number
}

interface VertexMessage {
	role: "user" | "assistant" | "system" | "tool";
	content: string | VertexContentBlock[];
	ts?: number;
}

interface VertexMessageCreateParams {
	model: string
	max_tokens: number
	temperature: number
	system: string | VertexTextBlock[]
	messages: VertexMessage[]
	stream: boolean
}

interface VertexMessageResponse {
	content: Array<{ type: "text"; text: string }>
}

interface VertexMessageStreamEvent {
	type: "message_start" | "message_delta" | "content_block_start" | "content_block_delta"
	message?: {
		usage: VertexUsage
	}
	usage?: {
		output_tokens: number
	}
	content_block?:
		| {
				type: "text"
				text: string
		  }
		| {
				type: "thinking"
				thinking: string
		  }
	index?: number
	delta?:
		| {
				type: "text_delta"
				text: string
		  }
		| {
				type: "thinking_delta"
				thinking: string
		  }
}

// https://docs.anthropic.com/en/api/claude-on-vertex-ai
export class VertexHandler extends BaseProvider implements SingleCompletionHandler {
	MODEL_CLAUDE = "claude"
	MODEL_GEMINI = "gemini"

	protected options: ApiHandlerOptions
	private anthropicClient: AnthropicVertex
	private geminiClient: VertexAI
	private modelType: string

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		if (this.options.apiModelId?.startsWith(this.MODEL_CLAUDE)) {
			this.modelType = this.MODEL_CLAUDE
		} else if (this.options.apiModelId?.startsWith(this.MODEL_GEMINI)) {
			this.modelType = this.MODEL_GEMINI
		} else {
			throw new Error(`Unknown model ID: ${this.options.apiModelId}`)
		}

		if (this.options.vertexJsonCredentials) {
			this.anthropicClient = new AnthropicVertex({
				projectId: this.options.vertexProjectId ?? "not-provided",
				// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#regions
				region: this.options.vertexRegion ?? "us-east5",
				googleAuth: new GoogleAuth({
					scopes: ["https://www.googleapis.com/auth/cloud-platform"],
					credentials: JSON.parse(this.options.vertexJsonCredentials),
				}),
			})
		} else if (this.options.vertexKeyFile) {
			this.anthropicClient = new AnthropicVertex({
				projectId: this.options.vertexProjectId ?? "not-provided",
				// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#regions
				region: this.options.vertexRegion ?? "us-east5",
				googleAuth: new GoogleAuth({
					scopes: ["https://www.googleapis.com/auth/cloud-platform"],
					keyFile: this.options.vertexKeyFile,
				}),
			})
		} else {
			this.anthropicClient = new AnthropicVertex({
				projectId: this.options.vertexProjectId ?? "not-provided",
				// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#regions
				region: this.options.vertexRegion ?? "us-east5",
			})
		}

		if (this.options.vertexJsonCredentials) {
			this.geminiClient = new VertexAI({
				project: this.options.vertexProjectId ?? "not-provided",
				location: this.options.vertexRegion ?? "us-east5",
				googleAuthOptions: {
					credentials: JSON.parse(this.options.vertexJsonCredentials),
				},
			})
		} else if (this.options.vertexKeyFile) {
			this.geminiClient = new VertexAI({
				project: this.options.vertexProjectId ?? "not-provided",
				location: this.options.vertexRegion ?? "us-east5",
				googleAuthOptions: {
					keyFile: this.options.vertexKeyFile,
				},
			})
		} else {
			this.geminiClient = new VertexAI({
				project: this.options.vertexProjectId ?? "not-provided",
				location: this.options.vertexRegion ?? "us-east5",
			})
		}
	}

	// This method is no longer needed as we're using the function from neutral-vertex-format.ts
	// Keeping it for reference but it's not used anymore
	private formatMessageForCacheOld(message: VertexMessage, shouldCache: boolean): VertexMessage {
		// Assistant messages are kept as-is since they can't be cached
		if (message.role === "assistant") {
			return message as VertexMessage
		}

		// For string content, we convert to array format with optional cache control
		if (typeof message.content === "string") {
			return {
				...message,
				content: [
					{
						type: "text" as const,
						text: message.content,
						// For string content, we only have one block so it's always the last
						...(shouldCache && { cache_control: { type: "ephemeral" } }),
					},
				],
			}
		}

		// For array content, find the last text block index once before mapping
		const lastTextBlockIndex = Array.isArray(message.content) ? message.content.reduce(
			(lastIndex: number, content: any, index: number) => (content.type === "text" ? index : lastIndex),
			-1,
		) : -1;

		// Then use this pre-calculated index in the map function
		return {
			...message,
			content: Array.isArray(message.content) ? message.content.map((content: any, contentIndex: number) => {
				// Images and other non-text content are passed through unchanged
				if (content.type === "image") {
					return content as VertexImageBlock;
				}

				// Check if this is the last text block using our pre-calculated index
				const isLastTextBlock = contentIndex === lastTextBlockIndex;

				return {
					type: "text" as const,
					text: (content as { text: string }).text,
					...(shouldCache && isLastTextBlock && { cache_control: { type: "ephemeral" } }),
				};
			}) : message.content,
		};
	}

	private async *createGeminiMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const model = this.geminiClient.getGenerativeModel({
			model: this.getModel().id,
			systemInstruction: systemPrompt,
		})

		const result = await model.generateContentStream({
			contents: convertToVertexGeminiHistory(messages),
			generationConfig: {
				maxOutputTokens: this.getModel().info.maxTokens ?? undefined,
				temperature: this.options.modelTemperature ?? 0,
			},
		})

		for await (const chunk of result.stream) {
			if (chunk.candidates?.[0]?.content?.parts) {
				for (const part of chunk.candidates[0].content.parts) {
					if (part.text) {
						yield {
							type: "text",
							text: part.text,
						}
					}
				}
			}
		}

		const response = await result.response

		yield {
			type: "usage",
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		}
	}

	private async *createClaudeMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const model = this.getModel()
		let { id, info, temperature, maxTokens, thinking } = model
		const useCache = model.info.supportsPromptCache

		// Find indices of user messages that we want to cache
		// We only cache the last two user messages to stay within the 4-block limit
		// (1 block for system + 1 block each for last two user messages = 3 total)
		const userMsgIndices = useCache
			? messages.reduce((acc, msg, i) => (msg.role === "user" ? [...acc, i] : acc), [] as number[])
			: []
		const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
		const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

		// Create the stream with appropriate caching configuration
		const params = {
			model: id,
			max_tokens: maxTokens,
			temperature,
			thinking,
			// Cache the system prompt if caching is enabled
			system: useCache
				? [
						{
							text: systemPrompt,
							type: "text" as const,
							cache_control: { type: "ephemeral" },
						},
					]
				: systemPrompt,
			messages: convertToVertexClaudeHistory(messages).map((message, index) => {
				// Only cache the last two user messages
				const shouldCache = useCache && (index === lastUserMsgIndex || index === secondLastMsgUserIndex)
				return formatMessageForCache(message, shouldCache)
			}),
			stream: true,
		}

		const stream = (await this.anthropicClient.messages.create(
			params as any, // Cast to any to avoid type errors
		)) as unknown as AnthropicStream<VertexMessageStreamEvent>

		// Process the stream chunks
		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start": {
					const usage = chunk.message!.usage
					yield {
						type: "usage",
						inputTokens: usage.input_tokens || 0,
						outputTokens: usage.output_tokens || 0,
						cacheWriteTokens: usage.cache_creation_input_tokens,
						cacheReadTokens: usage.cache_read_input_tokens,
					}
					break
				}
				case "message_delta": {
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage!.output_tokens || 0,
					}
					break
				}
				case "content_block_start": {
					switch (chunk.content_block!.type) {
						case "text": {
							if (chunk.index! > 0) {
								yield {
									type: "text",
									text: "\n",
								}
							}
							yield {
								type: "text",
								text: chunk.content_block!.text,
							}
							break
						}
						case "thinking": {
							if (chunk.index! > 0) {
								yield {
									type: "reasoning",
									text: "\n",
								}
							}
							yield {
								type: "reasoning",
								text: (chunk.content_block as any).thinking,
							}
							break
						}
					}
					break
				}
				case "content_block_delta": {
					switch (chunk.delta!.type) {
						case "text_delta": {
							yield {
								type: "text",
								text: chunk.delta!.text,
							}
							break
						}
						case "thinking_delta": {
							yield {
								type: "reasoning",
								text: (chunk.delta as any).thinking,
							}
							break
						}
					}
					break
				}
			}
		}
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		switch (this.modelType) {
			case this.MODEL_CLAUDE: {
				yield* this.createClaudeMessage(systemPrompt, messages)
				break
			}
			case this.MODEL_GEMINI: {
				yield* this.createGeminiMessage(systemPrompt, messages)
				break
			}
			default: {
				throw new Error(`Invalid model type: ${this.modelType}`)
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		let id = modelId && modelId in vertexModels ? (modelId as VertexModelId) : vertexDefaultModelId
		const info: ModelInfo = vertexModels[id]

		// The `:thinking` variant is a virtual identifier for thinking-enabled
		// models (similar to how it's handled in the Anthropic provider.)
		if (id.endsWith(":thinking")) {
			id = id.replace(":thinking", "") as VertexModelId
		}

		return {
			id,
			info,
			...getModelParams({ options: this.options, model: info, defaultMaxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS }),
		}
	}

	private async completePromptGemini(prompt: string) {
		try {
			const model = this.geminiClient.getGenerativeModel({
				model: this.getModel().id,
			})

			// Create a neutral history with a single message
			const neutralHistory = [{
				role: "user" as const,
				content: prompt
			}];

			// Convert the neutral history to Vertex Gemini format
			const geminiMessages = convertToVertexGeminiHistory(neutralHistory);

			const result = await model.generateContent({
				contents: geminiMessages,
				generationConfig: {
					temperature: this.options.modelTemperature ?? 0,
				},
			})

			let text = ""
			result.response.candidates?.forEach((candidate) => {
				candidate.content.parts.forEach((part) => {
					text += part.text
				})
			})

			return text
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Vertex completion error: ${error.message}`)
			}
			throw error
		}
	}

	private async completePromptClaude(prompt: string) {
		try {
			let { id, info, temperature, maxTokens, thinking } = this.getModel()
			const useCache = info.supportsPromptCache

			// Create a neutral history with a single message
			const neutralHistory = [{
				role: "user" as const,
				content: prompt
			}];

			// Convert the neutral history to Vertex Claude format
			const claudeMessages = convertToVertexClaudeHistory(neutralHistory);

			// Apply cache control if needed
			const messagesWithCache = claudeMessages.map(message =>
				useCache ? formatMessageForCache(message, true) : message
			);

			const params: any = { // Use any type to avoid dependency on Anthropic types
				model: id,
				max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
				temperature,
				thinking,
				system: "", // No system prompt needed for single completions
				messages: messagesWithCache,
				stream: false,
			}

			const response = (await this.anthropicClient.messages.create(params)) as unknown as VertexMessageResponse
			const content = response.content[0]

			if (content.type === "text") {
				return content.text
			}

			return ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Vertex completion error: ${error.message}`)
			}

			throw error
		}
	}

	/**
	 * Counts tokens for the given content
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// For Claude models, convert to Vertex Claude content blocks
			if (this.modelType === this.MODEL_CLAUDE) {
				// Convert neutral content to Vertex Claude content blocks
				const vertexContentBlocks = convertToVertexClaudeContentBlocks(content);
				
				// Create a mock message to simulate token counting
				const mockMessage = {
					role: "user" as const,
					content: vertexContentBlocks
				};
				
				// Use the base provider's implementation with the converted content
				// Vertex doesn't have a native token counting API
				return super.countTokens(content);
			} else {
				// For Gemini models, use the base provider's implementation directly
				return super.countTokens(content);
			}
		} catch (error) {
			console.warn("Vertex token counting error, using fallback", error);
			return super.countTokens(content);
		}
	}

	async completePrompt(prompt: string) {
		switch (this.modelType) {
			case this.MODEL_CLAUDE: {
				return this.completePromptClaude(prompt)
			}
			case this.MODEL_GEMINI: {
				return this.completePromptGemini(prompt)
			}
			default: {
				throw new Error(`Invalid model type: ${this.modelType}`)
			}
		}
	}
}
