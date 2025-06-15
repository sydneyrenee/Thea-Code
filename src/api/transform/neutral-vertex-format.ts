import { Content, Part, TextPart, InlineDataPart, FunctionCallPart, FunctionResponsePart } from "@google-cloud/vertexai"
import type { NeutralConversationHistory, NeutralMessage, NeutralMessageContent } from "../../shared/neutral-history"

// Define Vertex-specific types
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

interface VertexMessage {
	role: "user" | "assistant" | "system" | "tool"
	content: string | VertexContentBlock[]
	ts?: number
}

/**
 * Converts a message from the Neutral format to the Vertex Claude format.
 * This is used for the Claude models on Vertex AI.
 */
export function convertToVertexClaudeMessage(neutralMessage: NeutralMessage): VertexMessage {
	const vertexMessage: VertexMessage = {
		role: neutralMessage.role,
		content: [],
		ts: neutralMessage.ts,
	}

	if (typeof neutralMessage.content === "string") {
		// If content is a string, convert to a single text block
		vertexMessage.content = [
			{
				type: "text",
				text: neutralMessage.content,
			},
		]
	} else if (Array.isArray(neutralMessage.content)) {
		// If content is an array of blocks, convert each block
		vertexMessage.content = neutralMessage.content.map((block) => {
			if (block.type === "text") {
				return {
					type: "text",
					text: block.text,
				} as VertexTextBlock		} else if (block.type === "image") {
			// Use proper type guard for image source
			if (block.source.type === "base64") {
				return {
					type: "image",
					source: {
						type: "base64",
						media_type: block.source.media_type,
						data: block.source.data,
					},
				} as VertexImageBlock
			} else {
				// Handle image_url type or fallback
				return {
					type: "text",
					text: "[Image content not supported in this format]",
				} as VertexTextBlock
			}
		}
			// Other block types are not directly supported in Vertex Claude
			return {
				type: "text",
				text: `[Unsupported content type: ${block.type}]`,
			} as VertexTextBlock
		})
	}

	return vertexMessage
}

/**
 * Converts a history from the Neutral format to the Vertex Claude format.
 */
export function convertToVertexClaudeHistory(neutralHistory: NeutralConversationHistory): VertexMessage[] {
	return neutralHistory.map(convertToVertexClaudeMessage)
}

/**
 * Formats a message for caching in Vertex Claude.
 * This adds cache_control to the appropriate blocks.
 */
export function formatMessageForCache(message: VertexMessage, shouldCache: boolean): VertexMessage {
	// Assistant messages are kept as-is since they can't be cached
	if (message.role === "assistant") {
		return message
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
	const lastTextBlockIndex = message.content.reduce(
		(lastIndex, content, index) => (content.type === "text" ? index : lastIndex),
		-1,
	)

	// Then use this pre-calculated index in the map function
	return {
		...message,
		content: message.content.map((content, contentIndex) => {
			// Images and other non-text content are passed through unchanged
			if (content.type === "image") {
				return content
			}

			// Check if this is the last text block using our pre-calculated index
			const isLastTextBlock = contentIndex === lastTextBlockIndex

			return {
				type: "text" as const,
				text: content.text,
				...(shouldCache && isLastTextBlock && { cache_control: { type: "ephemeral" } }),
			}
		}),
	}
}

/**
 * Converts a message from the Neutral format to the Vertex Gemini format.
 * This is used for the Gemini models on Vertex AI.
 */
export function convertToVertexGeminiMessage(neutralMessage: NeutralMessage): Content {
	// Gemini Content structure is { role: string, parts: Part[] }
	const geminiMessage: Content = {
		role: neutralMessage.role === "user" ? "user" : "model", // Basic role mapping (user/model)
		parts: [], // Initialize parts
	}

	if (typeof neutralMessage.content === "string") {
		// If content is a string, convert to a single text part
		geminiMessage.parts.push({ text: neutralMessage.content } as TextPart)
	} else if (Array.isArray(neutralMessage.content)) {
		// If content is an array of blocks, convert each block to a Part
		geminiMessage.parts = neutralMessage.content
			.flatMap((block) => {
				if (block.type === "text") {
					return { text: block.text } as TextPart
				} else if (block.type === "image") {
					// Convert Neutral image source to Gemini image part with proper type guard
					if (block.source.type === "base64") {
						return {
							inlineData: {
								mimeType: block.source.media_type,
								data: block.source.data, // Base64 data
							},
						} as InlineDataPart
					} else {
						// Handle image_url type or fallback
						return { text: "[Image content not supported in this format]" } as TextPart
					}
				} else if (block.type === "tool_use") {
					// Convert to Gemini function call format
					return {
						functionCall: {
							name: block.name,
							args: block.input,
						},
					} as FunctionCallPart
				} else if (block.type === "tool_result") {
					// Extract function name from tool_use_id (assuming format: "name-id")
					const name = block.tool_use_id.split("-")[0]

					// Handle different content formats
					if (Array.isArray(block.content)) {
						const textParts = block.content.filter((part) => part.type === "text")
						const imageParts = block.content.filter((part) => part.type === "image")

						const text = textParts.length > 0 ? textParts.map((part) => part.text).join("\n\n") : ""

						const imageText = imageParts.length > 0 ? "\n\n(See next part for image)" : ""

						// Create function response part and any image parts
						const parts: Part[] = [
							{
								functionResponse: {
									name,
									response: {
										name,
										content: text + imageText,
									},
								},
							} as FunctionResponsePart,
						]

						// Add image parts if any
						if (imageParts.length > 0) {
							imageParts.forEach((part) => {
								if (part.type === "image" && part.source.type === "base64") {
									parts.push({
										inlineData: {
											mimeType: part.source.media_type,
											data: part.source.data,
										},
									} as InlineDataPart)
								}
							})
						}

						return parts
					}
				}

				// Handle other potential block types if necessary
				console.warn(`convertToVertexGeminiMessage: Unsupported Neutral block type: ${block.type}`)
				return { text: `[Unsupported Neutral block type: ${block.type}]` } as TextPart
			})
			.filter((part) => part !== null) // Filter out any null or undefined parts
	}

	return geminiMessage
}

/**
 * Converts a history from the Neutral format to the Vertex Gemini format.
 */
export function convertToVertexGeminiHistory(neutralHistory: NeutralConversationHistory): Content[] {
	return neutralHistory.map(convertToVertexGeminiMessage)
}

/**
 * Converts NeutralMessageContent to Vertex Claude content blocks.
 */
export function convertToVertexClaudeContentBlocks(neutralContent: NeutralMessageContent): VertexContentBlock[] {
	if (typeof neutralContent === "string") {
		return [{ type: "text", text: neutralContent }]
	}

	return neutralContent.map((block) => {
		if (block.type === "text") {
			return {
				type: "text",
				text: block.text,
			} as VertexTextBlock
		} else if (block.type === "image") {
			// Use proper type guard for image source
			if (block.source.type === "base64") {
				return {
					type: "image",
					source: {
						type: "base64",
						media_type: block.source.media_type,
						data: block.source.data,
					},
				} as VertexImageBlock
			} else {
				// Handle image_url type or fallback
				return {
					type: "text",
					text: "[Image content not supported in this format]",
				} as VertexTextBlock
			}
		}
		// Other block types are not directly supported
		return {
			type: "text",
			text: `[Unsupported content type: ${block.type}]`,
		} as VertexTextBlock
	})
}
