import { Anthropic } from "@anthropic-ai/sdk"
import { Content, FunctionCallPart, FunctionResponsePart, InlineDataPart, Part, TextPart } from "@google/generative-ai"

function convertAnthropicContentToGemini(content: Anthropic.Messages.MessageParam["content"]): Part[] {
	if (typeof content === "string") {
		return [{ text: content } as TextPart]
	}

	return content.flatMap((block) => {
		switch (block.type) {
			case "text":
				return { text: block.text } as TextPart
			case "image":
				// Type guard to ensure source is Base64ImageSource
				if (block.source.type !== "base64") {
					throw new Error("Unsupported image source type, expected base64")
				}
				return {
					inlineData: {
						data: block.source.data, // Now safe to access
						mimeType: block.source.media_type as string, // Now safe to access
					},
				} as InlineDataPart
			case "tool_use":
				return {
					functionCall: {
						name: block.name,
						args: block.input,
					},
				} as FunctionCallPart
			case "tool_result":
				const name = block.tool_use_id.split("-")[0]
				if (!block.content) {
					return []
				}
				if (typeof block.content === "string") {
					return {
						functionResponse: {
							name,
							response: {
								name,
								content: block.content,
							},
						},
					} as FunctionResponsePart
				} else {
					// The only case when tool_result could be array is when the tool failed and we're providing ie user feedback potentially with images
					const textParts = block.content.filter((part) => part.type === "text")
					const imageParts = block.content.filter(
						(part): part is Anthropic.Messages.ImageBlockParam => part.type === "image",
					)
					const text = textParts.length > 0 ? textParts.map((part) => part.text).join("\n\n") : ""
					const imageText = imageParts.length > 0 ? "\n\n(See next part for image)" : ""
					return [
						{
							functionResponse: {
								name,
								response: {
									name,
									content: text + imageText,
								},
							},
						} as FunctionResponsePart,
						...imageParts.map((part) => {
							// Type guard for image part source
							if (part.source.type !== "base64") {
								throw new Error("Unsupported image source type in tool_result, expected base64")
							}
							return {
								inlineData: {
									data: part.source.data, // Now safe to access
									mimeType: part.source.media_type as string, // Now safe to access
								},
							} as InlineDataPart
						}),
					]
				}
			default:
				// Use a type assertion to a more specific type or use a safe string
				throw new Error(`Unsupported content block type: ${String(block.type || "unknown")}`)
		}
	})
}

export function convertAnthropicMessageToGemini(message: Anthropic.Messages.MessageParam): Content {
	return {
		role: message.role === "assistant" ? "model" : "user",
		parts: convertAnthropicContentToGemini(message.content),
	}
}
