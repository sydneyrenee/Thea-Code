import OpenAI from "openai"
import type { NeutralConversationHistory } from "../../shared/neutral-history"
import { convertToOpenAiHistory } from "./neutral-openai-format"

type ContentPartText = OpenAI.Chat.ChatCompletionContentPartText
type ContentPartImage = OpenAI.Chat.ChatCompletionContentPartImage
type UserMessage = OpenAI.Chat.ChatCompletionUserMessageParam
type AssistantMessage = OpenAI.Chat.ChatCompletionAssistantMessageParam
type Message = OpenAI.Chat.ChatCompletionMessageParam

/**
 * Converts neutral messages to OpenAI format while merging consecutive messages with the same role.
 * This is required for DeepSeek Reasoner which does not support successive messages with the same role.
 *
 * @param neutralHistory Array of neutral messages
 * @returns Array of OpenAI messages where consecutive messages with the same role are combined
 */
export function convertToR1Format(neutralHistory: NeutralConversationHistory): Message[] {
	const messages = convertToOpenAiHistory(neutralHistory)
	return messages.reduce<Message[]>((merged, message) => {
		const lastMessage = merged[merged.length - 1]
		let messageContent: string | (ContentPartText | ContentPartImage)[] = ""
		let hasImages = false

		// Convert content to appropriate format
		if (Array.isArray(message.content)) {
			const textParts: string[] = []
			const imageParts: ContentPartImage[] = []
			const unknownPartsAsText: string[] = []

			message.content.forEach((part) => {
				if (part.type === "text") {
					textParts.push(part.text)
				} else if (part.type === "image_url") {
					hasImages = true
					// Type assertion is safe here since we checked part.type === "image_url"
					imageParts.push(part)
				} else {
					// Preserve unknown blocks by stringifying to avoid silent data loss
					try {
						if (typeof part === "object" && part !== null) {
							const maybeText = (part as { text?: unknown }).text
							if (typeof maybeText === "string") {
								unknownPartsAsText.push(maybeText)
							} else {
								unknownPartsAsText.push(JSON.stringify(part))
							}
						} else {
							unknownPartsAsText.push(String(part))
						}
					} catch {
						unknownPartsAsText.push("[unsupported content]")
					}
				}
			})

			if (hasImages) {
				const parts: (ContentPartText | ContentPartImage)[] = []
				if (textParts.length > 0) {
					parts.push({ type: "text", text: textParts.concat(unknownPartsAsText).join("\n") })
				}
				parts.push(...imageParts)
				messageContent = parts
			} else {
				messageContent = textParts.concat(unknownPartsAsText).join("\n")
			}
		} else {
			messageContent = message.content || ""
		}

		// If last message has same role, merge the content
		if (lastMessage?.role === message.role) {
			if (typeof lastMessage.content === "string" && typeof messageContent === "string") {
				lastMessage.content += `\n${messageContent}`
			}
			// If either has image content, convert both to array format
			else {
				const lastContent = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text" as const, text: lastMessage.content || "" }]

				const newContent = Array.isArray(messageContent)
					? messageContent
					: [{ type: "text" as const, text: messageContent }]

				if (message.role === "assistant") {
					const mergedContent = [...lastContent, ...newContent] as AssistantMessage["content"]
					lastMessage.content = mergedContent
				} else {
					const mergedContent = [...lastContent, ...newContent] as UserMessage["content"]
					lastMessage.content = mergedContent
				}
			}
		} else {
			// Add as new message with the correct type based on role
			if (message.role === "assistant") {
				const newMessage: AssistantMessage = {
					role: "assistant",
					content: messageContent as AssistantMessage["content"],
				}
				merged.push(newMessage)
			} else {
				const newMessage: UserMessage = {
					role: "user",
					content: messageContent as UserMessage["content"],
				}
				merged.push(newMessage)
			}
		}

		return merged
	}, [])
}
