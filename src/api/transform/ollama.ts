import OpenAI from "openai"
import type {
	NeutralConversationHistory,
	NeutralMessage,
	NeutralMessageContent,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
	NeutralContentBlock,
} from "../../shared/neutral-history"

/**
 * Ollama-specific message format 
 */
export interface OllamaMessage {
	role: "user" | "assistant" | "system" | "tool"
	content: string | OpenAI.Chat.ChatCompletionContentPart[]
	tool_call_id?: string
	tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
}

/**
 * Ollama API response structure
 */
export interface OllamaResponse {
	choices: Array<{
		message: OllamaMessage
		finish_reason: string
		index: number
	}>
	usage: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
	model: string
	created: number
	id: string
	object: string
}

/**
 * Ollama streaming chunk structure
 */
export interface OllamaStreamChunk {
	choices: Array<{
		delta: Partial<OllamaMessage>
		finish_reason?: string
		index: number
	}>
	usage?: {
		prompt_tokens?: number
		completion_tokens?: number
		total_tokens?: number
	}
	model: string
	created: number
	id: string
	object: string
}

/**
 * Transform content block to Ollama format with proper typing
 */
function transformContentBlock(block: NeutralContentBlock): OpenAI.Chat.ChatCompletionContentPart | string {
	switch (block.type) {
		case "text":
			return {
				type: "text",
				text: (block as NeutralTextContentBlock).text,
			}
		case "image":
		case "image_url":
		case "image_base64":
			const imageBlock = block as NeutralImageContentBlock
			if (imageBlock.source.type === "base64") {
				return {
					type: "image_url",
					image_url: {
						url: `data:${imageBlock.source.media_type};base64,${imageBlock.source.data}`,
					},
				}
			} else {
				return {
					type: "image_url",
					image_url: {
						url: imageBlock.source.url,
					},
				}
			}
		case "tool_use":
			const toolUseBlock = block as NeutralToolUseContentBlock
			return `[Tool Use: ${toolUseBlock.name}]`
		case "tool_result":
			const toolResultBlock = block as NeutralToolResultContentBlock
			if (typeof toolResultBlock.content === "string") {
				return toolResultBlock.content
			}
			return toolResultBlock.content
				.map(transformContentBlock)
				.map(result => typeof result === "string" ? result : JSON.stringify(result))
				.join("\n")
		default:
			return `[Unknown content type: ${(block as { type: string }).type}]`
	}
}

/**
 * Transform message content to Ollama format with proper typing
 */
function transformMessageContent(content: (NeutralTextContentBlock | NeutralImageContentBlock | NeutralToolResultContentBlock)[]): string {
	// Ollama prefers simple string content, so we'll flatten complex content
	return content
		.map(block => {
			switch (block.type) {
				case "text":
					return block.text
				case "image":
				case "image_url": 
				case "image_base64":
					return "[Image]" // Ollama doesn't support images in this transform
				case "tool_result":
					if (typeof block.content === "string") {
						return block.content
					}
					return block.content
						.map(transformContentBlock)
						.map(result => typeof result === "string" ? result : JSON.stringify(result))
						.join("\n")
				default:
					return `[Unknown content type: ${(block as { type: string }).type}]`
			}
		})
		.filter(Boolean)
		.join("\n")
}

/**
 * Transform tool calls with proper typing
 */
function transformToolCalls(blocks: NeutralToolUseContentBlock[]): OpenAI.Chat.ChatCompletionMessageToolCall[] {
	return blocks.map(block => ({
		id: block.id || `tool_${Date.now()}`,
		type: "function" as const,
		function: {
			name: block.name,
			arguments: JSON.stringify(block.input || {}),
		},
	}))
}

/**
 * Convert Neutral history to Ollama format with proper typing
 */
export function convertToOllamaMessages(neutralHistory: NeutralConversationHistory): OllamaMessage[] {
	return neutralHistory.map((message: NeutralMessage): OllamaMessage => {
		const baseMessage: Partial<OllamaMessage> = {
			role: message.role,
		}

		if (typeof message.content === "string") {
			return {
				...baseMessage,
				content: message.content,
			} as OllamaMessage
		}

		// Separate tool use blocks from other content
		const toolUseBlocks: NeutralToolUseContentBlock[] = []
		const otherBlocks: (NeutralTextContentBlock | NeutralImageContentBlock | NeutralToolResultContentBlock)[] = []

		message.content.forEach((block: NeutralContentBlock) => {
			if (block.type === "tool_use") {
				toolUseBlocks.push(block as NeutralToolUseContentBlock)
			} else if (block.type === "text" || block.type === "image" || block.type === "image_url" || block.type === "image_base64" || block.type === "tool_result") {
				otherBlocks.push(block as NeutralTextContentBlock | NeutralImageContentBlock | NeutralToolResultContentBlock)
			}
		})

		const transformedContent = transformMessageContent(otherBlocks)
		const result: OllamaMessage = {
			...baseMessage,
			content: transformedContent,
		} as OllamaMessage

		// Add tool calls if present
		if (toolUseBlocks.length > 0) {
			result.tool_calls = transformToolCalls(toolUseBlocks)
		}

		return result
	})
}

/**
 * Convert Ollama response to Neutral format with proper typing
 */
export function convertFromOllamaResponse(response: OllamaResponse): NeutralConversationHistory {
	return response.choices.map((choice): NeutralMessage => ({
		role: choice.message.role,
		content: convertFromOllamaContent(choice.message.content, choice.message.tool_calls),
	}))
}

/**
 * Convert Ollama content back to Neutral format with proper typing
 */
function convertFromOllamaContent(
	content: string | OpenAI.Chat.ChatCompletionContentPart[],
	toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
): string | NeutralMessageContent {
	const blocks: NeutralContentBlock[] = []

	// Handle content
	if (typeof content === "string") {
		if (content.trim()) {
			blocks.push({
				type: "text",
				text: content,
			} as NeutralTextContentBlock)
		}
	} else {
		content.forEach((part: OpenAI.Chat.ChatCompletionContentPart) => {
			if (part.type === "text") {
				blocks.push({
					type: "text",
					text: part.text,
				} as NeutralTextContentBlock)
			} else if (part.type === "image_url") {
				const url = part.image_url.url
				if (url.startsWith("data:")) {
					const [metadata, data] = url.split(",")
					const mediaTypeMatch = metadata.match(/data:([^;]+)/)
					const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/jpeg"
					blocks.push({
						type: "image_base64",
						source: {
							type: "base64",
							media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
							data,
						},
					} as NeutralImageContentBlock)
				} else {
					blocks.push({
						type: "image_url",
						source: {
							type: "image_url",
							url,
						},
					} as NeutralImageContentBlock)
				}
			}
		})
	}

	// Handle tool calls
	if (toolCalls && toolCalls.length > 0) {
		toolCalls.forEach((toolCall: OpenAI.Chat.ChatCompletionMessageToolCall) => {
			let parsedInput: Record<string, unknown>
			try {
				parsedInput = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>
			} catch {
				parsedInput = {}
			}
			
			blocks.push({
				type: "tool_use",
				id: toolCall.id,
				name: toolCall.function.name,
				input: parsedInput,
			} as NeutralToolUseContentBlock)
		})
	}

	return blocks.length === 1 && blocks[0].type === "text" 
		? (blocks[0] as NeutralTextContentBlock).text
		: (blocks as (NeutralTextContentBlock | NeutralImageContentBlock | NeutralToolUseContentBlock | NeutralToolResultContentBlock)[])
}