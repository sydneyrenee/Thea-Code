import { ConversationRole, Message, ContentBlock } from "@aws-sdk/client-bedrock-runtime"
import type {
	NeutralConversationHistory,
	NeutralMessage,
	NeutralMessageContent,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
} from "../../shared/neutral-history"

/**
 * Convert Neutral messages to Bedrock Converse format
 */
export function convertToBedrockConverseMessages(neutralHistory: NeutralConversationHistory): Message[] {
	// Helper function to safely get string value
	const safeString = (value: unknown): string => {
		if (typeof value === "string") {
			return value
		}
		if (value === null || value === undefined) {
			return ""
		}
		try {
			// Handle different types appropriately
			if (typeof value === "object") {
				return JSON.stringify(value)
			}
			if (typeof value === "number" || typeof value === "boolean") {
				return value.toString()
			}
			// For other types, use an empty string
			return ""
		} catch {
			return ""
		}
	}

	// Helper function to safely split a string
	const safeSplit = (str: unknown, separator: string): string[] => {
		const safeStr = safeString(str)
		try {
			return safeStr ? safeStr.split(separator) : []
		} catch {
			return []
		}
	}

	// Helper function to safely get format from media type
	const getFormatFromMediaType = (mediaType: unknown): string => {
		const parts = safeSplit(mediaType, "/")
		return parts.length > 1 ? parts[1] : ""
	}
	return neutralHistory.map((neutralMessage) => {
		// Map Neutral roles to Bedrock roles
		const role: ConversationRole = neutralMessage.role === "assistant" ? "assistant" : "user"

		if (typeof neutralMessage.content === "string") {
			return {
				role,
				content: [
					{
						text: neutralMessage.content,
					},
				] as ContentBlock[],
			}
		}

		// Process complex content types
		const content = neutralMessage.content.map((block): ContentBlock => {
			if (block.type === "text") {
				return {
					text: block.text || "",
				} as ContentBlock
			}

			if (block.type === "image") {
				// Convert base64 string to byte array if needed
				let byteArray: Uint8Array

				// Safely get the data from the source with proper type guard
				if (block.source && block.source.type === "base64") {
					const sourceData = block.source.data
					if (typeof sourceData === "string") {
						// Use explicit string type to avoid unsafe call
						const safeBase64: string = sourceData
						try {
							// Use explicit string type to avoid unsafe argument
							const binaryString = atob(safeBase64)
							byteArray = new Uint8Array(binaryString.length)
							for (let i = 0; i < binaryString.length; i++) {
								byteArray[i] = binaryString.charCodeAt(i)
							}
						} catch (error) {
							console.error("Error decoding base64 data:", error)
							byteArray = new Uint8Array(0)
						}
					} else {
						byteArray = new Uint8Array(0)
					}

					// Extract format from media_type (e.g., "image/jpeg" -> "jpeg")
					const format = getFormatFromMediaType(block.source.media_type)

					if (!["png", "jpeg", "gif", "webp"].includes(format)) {
						throw new Error(`Unsupported image format: ${format}`)
					}

					return {
						image: {
							format: format as "png" | "jpeg" | "gif" | "webp",
							source: {
								bytes: byteArray,
							},
						},
					} as ContentBlock
				} else {
					// Handle image_url type or fallback
					return {
						text: "[Image content not supported in this format]",
					} as ContentBlock
				}
			}

			if (block.type === "tool_use") {
				// Convert tool use to XML format
				const input = block.input || {}
				const toolParams = Object.entries(input)
					.map(([key, value]) => {
						const safeKey = String(key)
						const safeValue = typeof value === "string" ? value : JSON.stringify(value)
						return `<${safeKey}>\n${safeValue}\n</${safeKey}>`
					})
					.join("\n")

				const safeName = block.name || ""
				return {
					toolUse: {
						toolUseId: block.id || "",
						name: safeName,
						input: `<${safeName}>\n${toolParams}\n</${safeName}>`,
					},
				} as ContentBlock
			}

			if (block.type === "tool_result") {
				// First try to use content if available
				if (block.content && Array.isArray(block.content)) {
					return {
						toolResult: {
							toolUseId: block.tool_use_id || "",
							content: block.content.map((item) => {
								if (item.type === "text") {
									return { text: item.text }
								}
								// Skip images in tool results as they're handled separately
								return { text: "(see following message for image)" }
							}),
							status: "success",
						},
					} as ContentBlock
				}

				// Default case
				return {
					toolResult: {
						toolUseId: block.tool_use_id || "",
						content: [
							{
								text: "Tool result content unavailable",
							},
						],
						status: "success",
					},
				} as ContentBlock
			}

			// Default case for unknown block types
			return {
				text: `[Unknown Block Type]`,
			} as ContentBlock
		})

		return {
			role,
			content,
		}
	})
}

/**
 * Convert Bedrock Converse messages to Neutral format
 */
export function convertToNeutralHistoryFromBedrock(bedrockMessages: Message[]): NeutralConversationHistory {
	return bedrockMessages.map((bedrockMessage) => {
		const neutralMessage: NeutralMessage = {
			role: bedrockMessage.role === "assistant" ? "assistant" : "user",
			content: [],
		}

		if (!bedrockMessage.content || !Array.isArray(bedrockMessage.content)) {
			neutralMessage.content = "[No content]"
			return neutralMessage
		}

		const contentBlocks: NeutralMessageContent = bedrockMessage.content.map((block) => {
			if ("text" in block && block.text) {
				return {
					type: "text",
					text: block.text,
				} as NeutralTextContentBlock
			}

			if ("image" in block && block.image) {
				// Convert byte array to base64 if needed
				let base64Data: string
				if (block.image.source && "bytes" in block.image.source) {
					const bytes = block.image.source.bytes
					// Ensure bytes is not undefined before creating Uint8Array
					const binary = bytes
						? Array.from(new Uint8Array(bytes))
								.map((byte) => String.fromCharCode(byte))
								.join("")
						: ""
					base64Data = binary ? btoa(binary) : ""
				} else {
					base64Data = ""
				}

				return {
					type: "image",
					source: {
						type: "base64",
						media_type: `image/${block.image.format}`,
						data: base64Data,
					},
				} as NeutralImageContentBlock
			}

			if ("toolUse" in block && block.toolUse) {
				// Parse XML-formatted input to extract parameters
				const input: Record<string, string | number | boolean> = {}
				// Simple parsing logic - in a real implementation, this would need to be more robust
				const toolUseInput = block.toolUse.input
				const xmlContent =
					typeof toolUseInput === "string" ? toolUseInput : toolUseInput ? JSON.stringify(toolUseInput) : ""
				// Use a safer approach than matchAll for TypeScript compatibility
				const regex = /<([^>]+)>\s*([\s\S]*?)\s*<\/\1>/g
				let match

				while ((match = regex.exec(xmlContent)) !== null) {
					const key = match[1]
					const value = match[2]
					if (key !== block.toolUse.name) {
						// Skip the outer wrapper
						input[key] = value.trim()
					}
				}

				return {
					type: "tool_use",
					id: block.toolUse.toolUseId || "",
					name: block.toolUse.name || "",
					input,
				} as NeutralToolUseContentBlock
			}

			if ("toolResult" in block && block.toolResult) {
				const content: Array<NeutralTextContentBlock | NeutralImageContentBlock> = []

				if (block.toolResult.content && Array.isArray(block.toolResult.content)) {
					block.toolResult.content.forEach((item) => {
						if ("text" in item && item.text) {
							content.push({
								type: "text",
								text: item.text,
							} as NeutralTextContentBlock)
						}
					})
				}

				return {
					type: "tool_result",
					tool_use_id: block.toolResult.toolUseId || "",
					content,
					status: (block.toolResult.status as "success" | "error") || "success",
				} as NeutralToolResultContentBlock
			}

			// Default for unknown block types
			return {
				type: "text",
				text: `[Unsupported Bedrock block type]`,
			} as NeutralTextContentBlock
		})

		neutralMessage.content = contentBlocks
		return neutralMessage
	})
}

/**
 * Convert Neutral content blocks to Bedrock content blocks
 */
export function convertToBedrockContentBlocks(neutralContent: NeutralMessageContent): ContentBlock[] {
	if (typeof neutralContent === "string") {
		return [{ text: neutralContent } as ContentBlock]
	}

	return neutralContent.map((block): ContentBlock => {
		if (block.type === "text") {
			return {
				text: block.text || "",
			} as ContentBlock
		}

		if (block.type === "image" && block.source) {
			// Convert base64 string to byte array
			let byteArray: Uint8Array

			// Safely get the data from the source with proper type guard
			if (block.source.type === "base64") {
				const sourceData = block.source.data
				if (typeof sourceData === "string") {
					// Use explicit string type to avoid unsafe call
					const safeBase64: string = sourceData
					try {
						// Use explicit string type to avoid unsafe argument
						const binaryString = atob(safeBase64)
						byteArray = new Uint8Array(binaryString.length)
						for (let i = 0; i < binaryString.length; i++) {
							byteArray[i] = binaryString.charCodeAt(i)
						}
					} catch (error) {
						console.error("Error decoding base64 data:", error)
						byteArray = new Uint8Array(0)
					}
				} else {
					byteArray = new Uint8Array(0)
				}

				// Extract format from media_type with proper type guard
				const mediaType = block.source.media_type
				const format: string = mediaType.split("/")[1] || ""

				if (!["png", "jpeg", "gif", "webp"].includes(format)) {
					throw new Error(`Unsupported image format: ${format}`)
				}

				return {
					image: {
						format: format as "png" | "jpeg" | "gif" | "webp",
						source: {
							bytes: byteArray,
						},
					},
				} as ContentBlock
			} else {
				// Handle image_url type or fallback
				return {
					text: "[Image content not supported in this format]",
				} as ContentBlock
			}
		}

		// Other block types are not directly supported in content blocks
		return {
			text: `[Unsupported content type: ${block.type}]`,
		} as ContentBlock
	})
}
