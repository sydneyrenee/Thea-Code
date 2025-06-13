import type {
	NeutralConversationHistory,
	NeutralMessage,
	NeutralMessageContent,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
} from "../../shared/neutral-history" // Import neutral history types
import type {
	Content,
	Part,
	TextPart,
	InlineDataPart,
	FunctionCallPart,
	FunctionResponsePart,
} from "@google/generative-ai" // Import Gemini types

// Define the expected structure of the function response
interface FunctionResponseContent {
	name: string
	content: string
}

/**
 * Converts a history from the Neutral format to the Gemini format.
 */
export function convertToGeminiHistory(neutralHistory: NeutralConversationHistory): Content[] {
	// Gemini history is an array of Content objects
	return neutralHistory.map((neutralMessage) => {
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
						// Convert Neutral image source to Gemini image part
						// Type guard for image block
						if (
							block.type === "image" &&
							"source" in block &&
							typeof block.source === "object" &&
							block.source !== null &&
							"media_type" in block.source &&
							"data" in block.source
						) {
							return {
								inlineData: {
									mimeType: String(block.source.media_type as string),
									data: String(block.source.data), // Base64 data
								},
							} as InlineDataPart
						}
						// Fallback if the block doesn't have the expected structure
						return { text: "[Image could not be processed]" } as TextPart
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
										} as FunctionResponseContent,
									},
								} as FunctionResponsePart,
							]

							// Add image parts if any
							if (imageParts.length > 0) {
								imageParts.forEach((part) => {
									// Type guard for image part
									if (
										"source" in part &&
										typeof part.source === "object" &&
										part.source !== null &&
										"media_type" in part.source &&
										"data" in part.source
									) {
										parts.push({
											inlineData: {
												mimeType: String(part.source.media_type as string),
												data: String(part.source.data),
											},
										} as InlineDataPart)
									} else {
										console.warn("Invalid image part structure in tool_result")
									}
								})
							}

							return parts
						}
					}

					// Handle other potential block types if necessary
					console.warn(`convertToGeminiHistory: Unsupported Neutral block type: ${block.type}`)
					return { text: `[Unsupported Neutral block type: ${block.type}]` } as TextPart
				})
				.filter((part) => part !== null) // Filter out any null or undefined parts
		}

		return geminiMessage
	})
}

/**
 * Converts NeutralMessageContent to an array of Gemini Part objects.
 */
export function convertToGeminiContentBlocks(neutralContent: NeutralMessageContent): Part[] {
	// Gemini content is an array of Part objects
	const geminiParts: Part[] = []

	if (typeof neutralContent === "string") {
		geminiParts.push({ text: neutralContent } as TextPart)
	} else if (Array.isArray(neutralContent)) {
		neutralContent.forEach((block) => {
			if (block.type === "text") {
				geminiParts.push({ text: block.text } as TextPart)
			} else if (block.type === "image") {
				// Type guard for image block
				if (
					"source" in block &&
					typeof block.source === "object" &&
					block.source !== null &&
					"media_type" in block.source &&
					"data" in block.source
				) {
					geminiParts.push({
						inlineData: {
							mimeType: String(block.source.media_type as string),
							data: String(block.source.data),
						},
					} as InlineDataPart)
				} else {
					console.warn("Invalid image block structure in convertToGeminiContentBlocks")
					geminiParts.push({ text: "[Image could not be processed]" } as TextPart)
				}
			}
			// Tool_use and tool_result blocks are not typically included directly in ContentPart for generation requests
			// They are usually part of the history structure or handled separately.
		})
	}

	return geminiParts.filter((part) => part !== null) // Filter out any null or undefined parts
}

/**
 * Converts a history from the Gemini format to the Neutral format.
 */
export function convertToNeutralHistoryFromGemini(
	geminiHistory: Content[], // Input type is Gemini Content array
): NeutralConversationHistory {
	return geminiHistory.map((geminiMessage) => {
		const neutralMessage: NeutralMessage = {
			// Map Gemini roles to Neutral roles
			role: geminiMessage.role === "model" ? "assistant" : "user",
			content: [], // Initialize content as an array of blocks
		}

		// Process each part in the Gemini message
		if (geminiMessage.parts && Array.isArray(geminiMessage.parts)) {
			const contentBlocks: NeutralMessageContent = []

			geminiMessage.parts.forEach((part: Part) => {
				// Handle text parts
				if ("text" in part && part.text) {
					contentBlocks.push({
						type: "text",
						text: part.text,
					} as NeutralTextContentBlock)
				}
				// Handle image parts
				else if ("inlineData" in part && part.inlineData) {
					contentBlocks.push({
						type: "image",
						source: {
							type: "base64",
							media_type: part.inlineData.mimeType,
							data: part.inlineData.data,
						},
					} as NeutralImageContentBlock)
				}
				// Handle function calls (tool use)
				else if ("functionCall" in part && part.functionCall) {
					contentBlocks.push({
						type: "tool_use",
						id: `${part.functionCall.name}-${Date.now()}`, // Generate a unique ID
						name: part.functionCall.name,
						input: part.functionCall.args || {},
					} as NeutralToolUseContentBlock)
				}
				// Handle function responses (tool results)
				else if ("functionResponse" in part && part.functionResponse) {
					const toolUseId = `${part.functionResponse.name}-${Date.now()}` // This is a simplification

					// Create a text block for the function response content
					const responseContent: Array<NeutralTextContentBlock | NeutralImageContentBlock> = []

					// Cast response to the expected structure
					const response = part.functionResponse.response as FunctionResponseContent

					if (response && response.content) {
						responseContent.push({
							type: "text",
							text: response.content,
						} as NeutralTextContentBlock)
					}

					contentBlocks.push({
						type: "tool_result",
						tool_use_id: toolUseId,
						content: responseContent,
					} as NeutralToolResultContentBlock)
				}
				// Handle other part types if necessary
				else {
					console.warn(`convertToNeutralHistoryFromGemini: Unsupported Gemini part type`)
					contentBlocks.push({
						type: "text",
						text: `[Unsupported Gemini part type]`,
					} as NeutralTextContentBlock)
				}
			})

			neutralMessage.content = contentBlocks
		}

		return neutralMessage
	})
}
