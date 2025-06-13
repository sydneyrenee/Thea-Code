import { ConversationRole, ContentBlock } from "@aws-sdk/client-bedrock-runtime"
import type {
	NeutralConversationHistory,
	NeutralMessage,
} from "../../shared/neutral-history"

/**
 * AWS Bedrock transformation utilities for handling direct API interactions
 * This file provides utilities for transforming data to/from AWS Bedrock format
 * with proper type safety and error handling.
 */

// Type definitions for AWS Bedrock API responses
interface BedrockResponseData {
	content?: ContentBlock[]
	role?: ConversationRole
	stopReason?: string
	usage?: {
		inputTokens: number
		outputTokens: number
		totalTokens?: number
	}
	metrics?: {
		latencyMs: number
	}
}

interface TransformedResponseData {
	content: ContentBlock[]
	role: ConversationRole
	stopReason?: string
	usage?: BedrockResponseData['usage']
	metrics?: BedrockResponseData['metrics']
}

interface StreamChunk {
	messageStart?: {
		role?: ConversationRole
	}
	contentBlockDelta?: {
		delta?: {
			text?: string
		}
		contentBlockIndex?: number
	}
	messageStop?: {
		stopReason?: string
		additionalModelResponseFields?: Record<string, unknown>
	}
	metadata?: BedrockResponseData['usage'] & BedrockResponseData['metrics']
}

interface ProcessedStreamChunk {
	type: 'messageStart' | 'contentBlockDelta' | 'messageStop'
	role?: ConversationRole
	delta?: {
		text?: string
	}
	index?: number
	stopReason?: string
	additionalFields?: Record<string, unknown>
	metadata?: StreamChunk['metadata']
}

interface ToolData {
	id: string
	name: string
	input: Record<string, unknown>
}

interface TransformedToolData {
	toolUse: {
		toolUseId: string
		name: string
		input: Record<string, unknown>
	}
}

interface ToolResultData {
	tool_use_id: string
	content: unknown
	status?: string
}

interface TransformedToolResult {
	toolResult: {
		toolUseId: string
		content: unknown
		status?: string
	}
}

interface ImageData {
	source: {
		media_type?: string
		data: Uint8Array | string
	}
}

interface TransformedImageData {
	image: {
		format: string
		source: {
			bytes: Uint8Array | string
		}
	}
}

interface MessageContent {
	type: string
	text?: string
	source?: ImageData['source']
	id?: string
	name?: string
	input?: Record<string, unknown>
	tool_use_id?: string
	content?: unknown
	status?: string
}

interface ConversationMessage {
	role: ConversationRole
	content: string | MessageContent[]
}

/**
 * Transform raw AWS response data to structured format
 * @param responseData - Raw response from AWS Bedrock API
 * @returns Structured response data
 */
export function transformResponseData(responseData: BedrockResponseData | null): TransformedResponseData | null {
	if (!responseData) {
		return null
	}
	
	const result: TransformedResponseData = {
		content: responseData.content || [],
		role: responseData.role || "assistant",
		stopReason: responseData.stopReason,
		usage: responseData.usage,
		metrics: responseData.metrics,
	}
	
	return result
}

/**
 * Process streaming response chunks from Bedrock
 * @param chunk - Raw chunk data from stream
 * @returns Processed chunk data
 */
export function processStreamChunk(chunk: StreamChunk): ProcessedStreamChunk | null {
	if (!chunk) {
		return null
	}
	
	if (chunk.messageStart) {
		return {
			type: "messageStart",
			role: chunk.messageStart.role,
		}
	}
	
	if (chunk.contentBlockDelta) {
		return {
			type: "contentBlockDelta",
			delta: chunk.contentBlockDelta.delta,
			index: chunk.contentBlockDelta.contentBlockIndex,
		}
	}
	
	if (chunk.messageStop) {
		return {
			type: "messageStop",
			stopReason: chunk.messageStop.stopReason,
			additionalFields: chunk.messageStop.additionalModelResponseFields,
		}
	}
	
	// Return a generic chunk with metadata if available
	return {
		type: "messageStart", // Default type
		metadata: chunk.metadata,
	}
}

/**
 * Transform tool use data for Bedrock API
 * @param toolData - Tool use information
 * @returns Formatted tool data for Bedrock
 */
export function transformToolData(toolData: ToolData | null): TransformedToolData | null {
	if (!toolData) {
		return null
	}
	
	const transformed: TransformedToolData = {
		toolUse: {
			toolUseId: toolData.id,
			name: toolData.name,
			input: toolData.input
		}
	}
	
	return transformed
}

/**
 * Transform tool result data for Bedrock API
 * @param resultData - Tool result information
 * @returns Formatted result data for Bedrock
 */
export function transformToolResult(resultData: ToolResultData | null): TransformedToolResult | null {
	if (!resultData) {
		return null
	}
	
	const transformed: TransformedToolResult = {
		toolResult: {
			toolUseId: resultData.tool_use_id,
			content: resultData.content,
			status: resultData.status
		}
	}
	
	return transformed
}

/**
 * Handle image data transformation for Bedrock
 * @param imageData - Image data to transform
 * @returns Bedrock-compatible image format
 */
export function transformImageData(imageData: ImageData | null): TransformedImageData | null {
	if (!imageData || !imageData.source) {
		return null
	}
	
	const transformed: TransformedImageData = {
		image: {
			format: imageData.source.media_type?.split('/')[1] || 'jpeg',
			source: {
				bytes: imageData.source.data
			}
		}
	}
	
	return transformed
}

/**
 * Process and validate message content for Bedrock API
 * @param content - Message content to process
 * @returns Validated content blocks
 */
export function processMessageContent(content: string | MessageContent[] | null): ContentBlock[] {
	if (!content) {
		return []
	}
	
	if (typeof content === 'string') {
		return [{ text: content }]
	}
	
	if (Array.isArray(content)) {
		return content.map((block: MessageContent): ContentBlock => {
			if (block.type === 'text') {
				return { text: block.text || '' }
			}
			if (block.type === 'image') {
				const imageData = transformImageData(block as unknown as ImageData)
				return imageData || { text: '[Image]' }
			}
			if (block.type === 'tool_use') {
				const toolData = transformToolData(block as unknown as ToolData)
				return toolData || { text: '[Tool Use]' }
			}
			if (block.type === 'tool_result') {
				const resultData = transformToolResult(block as unknown as ToolResultData)
				return resultData || { text: '[Tool Result]' }
			}
			return { text: `[Unknown: ${block.type}]` }
		})
	}
	
	return [{ text: String(content) }]
}

/**
 * Transform message history for Bedrock Converse API
 * @param messages - Conversation history
 * @returns Bedrock-compatible message format
 */
export function transformConversationHistory(messages: ConversationMessage[] | NeutralConversationHistory): Array<{ role: ConversationRole; content: ContentBlock[] }> {
	if (!Array.isArray(messages)) {
		return []
	}
	
	return messages.map((message: ConversationMessage | NeutralMessage) => ({
		role: message.role as ConversationRole,
		content: processMessageContent(message.content)
	}))
}