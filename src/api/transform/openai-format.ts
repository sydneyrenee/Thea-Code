import OpenAI from "openai"
import type {
	NeutralConversationHistory,
	NeutralContentBlock,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
} from "../../shared/neutral-history"

export function convertToOpenAiMessages(
	neutralHistory: NeutralConversationHistory,
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

	for (const neutralMessage of neutralHistory) {
		if (typeof neutralMessage.content === "string") {
			if (
				neutralMessage.role === "user" ||
				neutralMessage.role === "assistant" ||
				neutralMessage.role === "system"
			) {
				openAiMessages.push({
					role: neutralMessage.role,
					content: neutralMessage.content,
				})
			} else if (neutralMessage.role === "tool") {
				// OpenAI 'tool' role messages require a tool_call_id.
				// This path (simple string content for 'tool' role) is unusual without it.
				// Assuming structured tool results (with tool_use_id) are handled in the array content block.
				console.warn(
					`[convertToOpenAiMessages] Skipping 'tool' role message with simple string content due to missing tool_call_id: ${neutralMessage.content}`,
				)
			}
		} else if (Array.isArray(neutralMessage.content)) {
			// image_url.url is base64 encoded image data
			// ensure it contains the content-type of the image: data:image/png;base64,
			/*
	       { role: "user", content: "" | { type: "text", text: string } | { type: "image_url", image_url: { url: string } } },
	        // content required unless tool_calls is present
	       { role: "assistant", content?: "" | null, tool_calls?: [{ id: "", function: { name: "", arguments: "" }, type: "function" }] },
	       { role: "tool", tool_call_id: "", content: ""}
	        */
			if (neutralMessage.role === "user") {
				const { nonToolMessages, toolMessages } = neutralMessage.content.reduce<{
					nonToolMessages: (NeutralTextContentBlock | NeutralImageContentBlock)[]
					toolMessages: NeutralToolResultContentBlock[]
				}>(
					(acc, part: NeutralContentBlock) => {
						// part is now NeutralContentBlock
						if (part.type === "tool_result") {
							acc.toolMessages.push(part as NeutralToolResultContentBlock)
						} else if (part.type === "text" || part.type === "image_url" || part.type === "image_base64") {
							acc.nonToolMessages.push(part as NeutralTextContentBlock | NeutralImageContentBlock)
						} // user cannot send tool_use messages
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process tool result messages FIRST since they must follow the tool use messages
				let toolResultImages: NeutralImageContentBlock[] = []
				toolMessages.forEach((toolMessage) => {
					// Neutral tool results can be a string or an array of text/image blocks. OpenAI SDK tool results are a single string, so we concatenate parts for compatibility.
					let content: string

					if (typeof toolMessage.content === "string") {
						content = toolMessage.content
					} else {
						content =
							toolMessage.content
								?.map((part: NeutralTextContentBlock | NeutralImageContentBlock) => {
									if (part.type === "image_url" || part.type === "image_base64") {
										toolResultImages.push(part)
										return "(see following user message for image)"
									} else if (part.type === "text") {
										return part.text
									}
									return "" // Fallback for unexpected block types if any
								})
								.join("\n") ?? ""
					}
					openAiMessages.push({
						role: "tool",
						tool_call_id: toolMessage.tool_use_id,
						content: content,
					})
				})

				// If tool results contain images, send as a separate user message
				// I ran into an issue where if I gave feedback for one of many tool uses, the request would fail.
				// "Messages following `tool_use` blocks must begin with a matching number of `tool_result` blocks."
				// Therefore we need to send these images after the tool result messages
				// NOTE: it's actually okay to have multiple user messages in a row, the model will treat them as a continuation of the same input (this way works better than combining them into one message, since the tool result specifically mentions (see following user message for image)
				// UPDATE v2.0: we don't use tools anymore, but if we did it's important to note that the openrouter prompt caching mechanism requires one user message at a time, so we would need to add these images to the user content array instead.
				// if (toolResultImages.length > 0) {
				// 	openAiMessages.push({
				// 		role: "user",
				// 		content: toolResultImages.map((part) => ({
				// 			type: "image_url",
				// 			image_url: { url: `data:${part.source.media_type as string};base64,${part.source.data as string}` },
				// 		})),
				// 	})
				// }

				// Process non-tool messages
				if (nonToolMessages.length > 0) {
					openAiMessages.push({
						role: "user",
						content: nonToolMessages.map((part: NeutralTextContentBlock | NeutralImageContentBlock) => {
							if (part.type === "image_base64" && part.source.type === "base64") {
								return {
									type: "image_url",
									image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
								}
							} else if (part.type === "image_url" && part.source.type === "image_url") {
								return {
									type: "image_url",
									image_url: { url: part.source.url },
								}
							} else if (part.type === "text") {
								return { type: "text", text: part.text }
							}
							// Fallback for any unexpected block types in nonToolMessages
							return { type: "text", text: "[Unsupported content block]" }
						}),
					})
				}
			} else if (neutralMessage.role === "assistant") {
				const { nonToolMessages, toolMessages } = neutralMessage.content.reduce<{
					nonToolMessages: (NeutralTextContentBlock | NeutralImageContentBlock)[]
					toolMessages: NeutralToolUseContentBlock[]
				}>(
					(acc, part: NeutralContentBlock) => {
						// part is NeutralContentBlock
						if (part.type === "tool_use") {
							acc.toolMessages.push(part as NeutralToolUseContentBlock)
						} else if (part.type === "text" || part.type === "image_url" || part.type === "image_base64") {
							acc.nonToolMessages.push(part as NeutralTextContentBlock | NeutralImageContentBlock)
						} // assistant cannot send tool_result messages
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process non-tool messages
				let content: string | undefined
				if (nonToolMessages.length > 0) {
					content = nonToolMessages
						.map((part: NeutralTextContentBlock | NeutralImageContentBlock) => {
							if (part.type === "image_url" || part.type === "image_base64") {
								return "" // Assistant messages to OpenAI don't typically include images directly this way.
							} else if (part.type === "text") {
								return part.text
							}
							return "" // Fallback for unexpected block types
						})
						.join("\n")
				}

				// Process tool use messages
				let tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[] = toolMessages.map((toolMessage) => ({
					id: toolMessage.id,
					type: "function",
					function: {
						name: toolMessage.name,
						// json string
						arguments: JSON.stringify(toolMessage.input),
					},
				}))

				openAiMessages.push({
					role: "assistant",
					content,
					// Cannot be an empty array. API expects an array with minimum length 1, and will respond with an error if it's empty
					tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
				})
			}
		}
	}

	return openAiMessages
}
