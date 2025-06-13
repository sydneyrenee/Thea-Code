import OpenAI from "openai"
import type {
	NeutralConversationHistory,
	NeutralMessage,
	NeutralContentBlock,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
} from "../../shared/neutral-history"

/**
 * Azure OpenAI API request parameters interface
 */
interface AzureOpenAIRequestParams {
	model: string
	messages: OpenAI.Chat.ChatCompletionMessageParam[]
	temperature?: number
	max_tokens?: number
	stream?: boolean
	stream_options?: {
		include_usage: boolean
	}
}

/**
 * Azure OpenAI API response interface for streaming
 */
interface AzureOpenAIStreamChunk {
	id: string
	object: string
	created: number
	model: string
	choices: Array<{
		index: number
		delta: {
			role?: string
			content?: string
			tool_calls?: Array<{
				index: number
				id: string
				type: string
				function: {
					name: string
					arguments: string
				}
			}>
		}
		finish_reason?: string
	}>
	usage?: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}

/**
 * Converts a message from the Neutral format to Azure OpenAI format.
 * Azure OpenAI uses the same message format as regular OpenAI.
 */
export function convertToAzureOpenAIMessage(neutralMessage: NeutralMessage): OpenAI.Chat.ChatCompletionMessageParam {
	// Handle simple string content
	if (typeof neutralMessage.content === "string") {
		if (neutralMessage.role === "tool") {
			console.warn("Tool messages require tool_call_id and structured content")
			return {
				role: "tool",
				content: neutralMessage.content,
				tool_call_id: "unknown", // This should be provided in proper tool result blocks
			}
		}
		
		if (neutralMessage.role === "user" || neutralMessage.role === "assistant" || neutralMessage.role === "system") {
			return {
				role: neutralMessage.role,
				content: neutralMessage.content,
			}
		}

		// Fallback for unknown roles
		console.warn("Unknown message role:", neutralMessage.role)
		return {
			role: "user",
			content: neutralMessage.content,
		}
	}

	// Handle array content
	if (Array.isArray(neutralMessage.content)) {
		return convertComplexMessageToAzureOpenAI(neutralMessage)
	}

	// Fallback for unexpected content types
	console.warn("Unexpected message content type:", typeof neutralMessage.content)
	return {
		role: neutralMessage.role as "user" | "assistant" | "system",
		content: "[Invalid content type]",
	}
}

/**
 * Converts complex messages with multiple content blocks to Azure OpenAI format
 */
function convertComplexMessageToAzureOpenAI(neutralMessage: NeutralMessage): OpenAI.Chat.ChatCompletionMessageParam {
	const content = neutralMessage.content as NeutralContentBlock[]
	
	if (neutralMessage.role === "assistant") {
		return convertAssistantMessageToAzureOpenAI(neutralMessage, content)
	} else if (neutralMessage.role === "user") {
		return convertUserMessageToAzureOpenAI(content)
	} else if (neutralMessage.role === "tool") {
		return convertToolMessageToAzureOpenAI(content)
	} else if (neutralMessage.role === "system") {
		return convertSystemMessageToAzureOpenAI(content)
	}

	// Fallback for unknown roles
	console.warn("Unknown message role:", neutralMessage.role)
	return {
		role: "user",
		content: "[Unknown role]",
	}
}

/**
 * Converts assistant messages with potential tool calls
 */
function convertAssistantMessageToAzureOpenAI(
	neutralMessage: NeutralMessage,
	content: NeutralContentBlock[]
): OpenAI.Chat.ChatCompletionAssistantMessageParam {
	const textBlocks = content.filter((block): block is NeutralTextContentBlock => block.type === "text")
	const toolBlocks = content.filter((block): block is NeutralToolUseContentBlock => block.type === "tool_use")

	const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
		role: "assistant",
		content: textBlocks.length > 0 ? textBlocks.map(block => block.text).join("\n") : null,
	}

	if (toolBlocks.length > 0) {
		assistantMessage.tool_calls = toolBlocks.map((block): OpenAI.Chat.ChatCompletionMessageToolCall => ({
			id: block.id,
			type: "function",
			function: {
				name: block.name,
				arguments: JSON.stringify(block.input),
			},
		}))
	}

	return assistantMessage
}

/**
 * Converts user messages with potential images and tool results
 */
function convertUserMessageToAzureOpenAI(content: NeutralContentBlock[]): OpenAI.Chat.ChatCompletionUserMessageParam {
	const toolResultBlocks = content.filter((block): block is NeutralToolResultContentBlock => block.type === "tool_result")
	
	// Handle tool results separately as they become tool messages
	if (toolResultBlocks.length > 0) {
		// For now, we'll handle this case by returning the first tool result as a user message
		// In practice, tool results should be handled by convertToolMessageToAzureOpenAI
		const firstResult = toolResultBlocks[0]
		const resultText = firstResult.content
			.filter((block): block is NeutralTextContentBlock => block.type === "text")
			.map(block => block.text)
			.join("\n")
		
		return {
			role: "user",
			content: resultText || "[Empty tool result]",
		}
	}

	// Convert content blocks to OpenAI format
	const openAIContent: Array<OpenAI.Chat.ChatCompletionContentPart> = []
	
	for (const block of content) {
		if (block.type === "text") {
			const textBlock = block as NeutralTextContentBlock
			openAIContent.push({
				type: "text",
				text: textBlock.text,
			})
		} else if (block.type === "image" || block.type === "image_base64") {
			const imageBlock = block as NeutralImageContentBlock
			if (imageBlock.source.type === "base64") {
				openAIContent.push({
					type: "image_url",
					image_url: {
						url: `data:${imageBlock.source.media_type};base64,${imageBlock.source.data}`,
					},
				})
			} else if (imageBlock.source.type === "image_url") {
				openAIContent.push({
					type: "image_url",
					image_url: {
						url: imageBlock.source.url,
					},
				})
			}
		}
	}

	// If only one text block, return as string for simplicity
	if (openAIContent.length === 1 && openAIContent[0].type === "text") {
		return {
			role: "user",
			content: openAIContent[0].text,
		}
	}

	return {
		role: "user",
		content: openAIContent.length > 0 ? openAIContent : "[Empty content]",
	}
}

/**
 * Converts tool result messages
 */
function convertToolMessageToAzureOpenAI(content: NeutralContentBlock[]): OpenAI.Chat.ChatCompletionToolMessageParam {
	const toolResultBlock = content.find((block): block is NeutralToolResultContentBlock => block.type === "tool_result")
	
	if (!toolResultBlock) {
		console.warn("Tool message without tool_result block")
		return {
			role: "tool",
			content: "[No tool result found]",
			tool_call_id: "unknown",
		}
	}

	const resultText = toolResultBlock.content
		.filter((block): block is NeutralTextContentBlock => block.type === "text")
		.map(block => block.text)
		.join("\n")

	return {
		role: "tool",
		content: resultText || "[Empty tool result]",
		tool_call_id: toolResultBlock.tool_use_id,
	}
}

/**
 * Converts system messages
 */
function convertSystemMessageToAzureOpenAI(content: NeutralContentBlock[]): OpenAI.Chat.ChatCompletionSystemMessageParam {
	const textBlocks = content.filter((block): block is NeutralTextContentBlock => block.type === "text")
	
	return {
		role: "system",
		content: textBlocks.length > 0 ? textBlocks.map(block => block.text).join("\n") : "[Empty system message]",
	}
}

/**
 * Converts a history from the Neutral format to Azure OpenAI format.
 */
export function convertToAzureOpenAIHistory(neutralHistory: NeutralConversationHistory): OpenAI.Chat.ChatCompletionMessageParam[] {
	const result: OpenAI.Chat.ChatCompletionMessageParam[] = []
	
	for (const neutralMessage of neutralHistory) {
		// Handle tool result messages specially - they need to become tool messages
		if (Array.isArray(neutralMessage.content)) {
			const toolResultBlocks = neutralMessage.content.filter((block): block is NeutralToolResultContentBlock => block.type === "tool_result")
			
			if (toolResultBlocks.length > 0 && neutralMessage.role === "user") {
				// Convert tool results to separate tool messages
				for (const toolResult of toolResultBlocks) {
					const resultText = toolResult.content
						.filter((block): block is NeutralTextContentBlock => block.type === "text")
						.map(block => block.text)
						.join("\n")
					
					result.push({
						role: "tool",
						content: resultText || "[Empty tool result]",
						tool_call_id: toolResult.tool_use_id,
					})
				}
				
				// If there are other blocks besides tool results, create a user message
				const nonToolBlocks = neutralMessage.content.filter(block => block.type !== "tool_result")
				if (nonToolBlocks.length > 0) {
					const userMessage = convertUserMessageToAzureOpenAI(nonToolBlocks)
					result.push(userMessage)
				}
				continue
			}
		}
		
		const converted = convertToAzureOpenAIMessage(neutralMessage)
		result.push(converted)
	}
	
	return result
}

/**
 * Creates Azure OpenAI API request parameters from neutral history
 */
export function createAzureOpenAIRequest(
	model: string,
	neutralHistory: NeutralConversationHistory,
	systemPrompt?: string,
	options: {
		temperature?: number
		maxTokens?: number
		streaming?: boolean
	} = {}
): AzureOpenAIRequestParams {
	let messages = convertToAzureOpenAIHistory(neutralHistory)
	
	// Add system prompt if provided and not already present
	const hasSystemMessage = messages.some(msg => msg.role === "system")
	if (systemPrompt && !hasSystemMessage) {
		messages = [
			{
				role: "system",
				content: systemPrompt,
			},
			...messages,
		]
	}
	
	const request: AzureOpenAIRequestParams = {
		model,
		messages,
	}
	
	if (options.temperature !== undefined) {
		request.temperature = options.temperature
	}
	
	if (options.maxTokens !== undefined) {
		request.max_tokens = options.maxTokens
	}
	
	if (options.streaming) {
		request.stream = true
		request.stream_options = { include_usage: true }
	}
	
	return request
}

/**
 * Type guard to check if a chunk is an Azure OpenAI stream chunk
 */
export function isAzureOpenAIStreamChunk(chunk: unknown): chunk is AzureOpenAIStreamChunk {
	return (
		typeof chunk === "object" &&
		chunk !== null &&
		"choices" in chunk &&
		Array.isArray((chunk as Record<string, unknown>).choices)
	)
}

/**
 * Extracts content from Azure OpenAI stream chunk
 */
export function extractContentFromAzureChunk(chunk: AzureOpenAIStreamChunk): {
	content?: string
	toolCalls?: Array<{
		index: number
		id: string
		type: string
		function: {
			name: string
			arguments: string
		}
	}>
	finishReason?: string
} {
	const choice = chunk.choices[0]
	if (!choice) {
		return {}
	}
	
	return {
		content: choice.delta.content,
		toolCalls: choice.delta.tool_calls,
		finishReason: choice.finish_reason,
	}
}