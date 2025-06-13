import type {
	NeutralMessage,
	NeutralConversationHistory,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
	NeutralContentBlock,
} from "../../shared/neutral-history"

/**
 * Type guard to check if a block is a text content block
 */
function isTextBlock(block: NeutralContentBlock): block is NeutralTextContentBlock {
	return block.type === "text" && "text" in block
}

/**
 * Type guard to check if a block is an image content block
 */
function isImageBlock(block: NeutralContentBlock): block is NeutralImageContentBlock {
	return (block.type === "image" || block.type === "image_url" || block.type === "image_base64") && "source" in block
}

/**
 * Type guard to check if a block is a tool use content block
 */
function isToolUseBlock(block: NeutralContentBlock): block is NeutralToolUseContentBlock {
	return block.type === "tool_use" && "name" in block
}

/**
 * Type guard to check if a block is a tool result content block
 */
function isToolResultBlock(block: NeutralContentBlock): block is NeutralToolResultContentBlock {
	return block.type === "tool_result" && "content" in block
}

/**
 * Convert complex content blocks to simple string content.
 * This function flattens complex message content (images, tool calls, etc.)
 * into a single string representation suitable for APIs that only support text.
 *
 * @param content - The content to convert, can be a string or array of content blocks
 * @returns A string representation of the content
 */
export function convertToSimpleContent(content: NeutralMessage["content"]): string {
	if (typeof content === "string") {
		return content
	}

	// Handle empty content arrays
	if (content.length === 0) {
		return ""
	}

	// Extract text from content blocks
	return content
		.map((block) => {
			if (isTextBlock(block)) {
				return block.text
			}
			if (isImageBlock(block)) {
				const mediaType = block.source.type === "base64" ? block.source.media_type : "image"
				return `[Image: ${mediaType}]`
			}
			if (isToolUseBlock(block)) {
				return `[Tool Use: ${block.name}]`
			}
			if (isToolResultBlock(block)) {
				return block.content
					.map((part) => {
						if (isTextBlock(part)) {
							return part.text
						}
						if (isImageBlock(part)) {
							const mediaType = part.source.type === "base64" ? part.source.media_type : "image"
							return `[Image: ${mediaType}]`
						}
						return ""
					})
					.join("\n")
			}
			// Handle unknown block types gracefully
			return `[Unknown content type: ${(block as { type: string }).type}]`
		})
		.filter(Boolean)
		.join("\n")
}

/**
 * Simple message format for APIs that only support string content
 */
export type SimpleMessage = {
	readonly role: "user" | "assistant" | "system" | "tool"
	readonly content: string
}

/**
 * Convert Neutral conversation history to simple format with string content.
 * This function is useful for APIs that only support simple text messages
 * and cannot handle complex content types like images or tool calls.
 *
 * @param messages - The conversation history to convert
 * @returns An array of simple messages with string content only
 */
export function convertToSimpleMessages(messages: NeutralConversationHistory): SimpleMessage[] {
	return messages.map(
		(message): SimpleMessage => ({
			role: message.role,
			content: convertToSimpleContent(message.content),
		}),
	)
}
