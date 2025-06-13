import type {
	NeutralConversationHistory,
	NeutralMessage,
	NeutralMessageContent,
	NeutralTextContentBlock,
	NeutralToolUseContentBlock,
} from "../../shared/neutral-history"

/**
 * Google API integration transform functions
 * Handles conversion between neutral format and Google API formats
 */

// Interface for Google API message content
interface GoogleTextContent {
	type: "text"
	text: string
}

interface GoogleImageContent {
	type: "image_url"
	image_url: {
		url: string
	}
}

interface GoogleToolCallContent {
	type: "tool_call"
	id: string
	function: {
		name: string
		arguments: string
	}
}

type GoogleContent = GoogleTextContent | GoogleImageContent | GoogleToolCallContent

// Interface for Google API message structure
interface GoogleMessage {
	role: "user" | "assistant" | "system"
	content: string | GoogleContent[]
	name?: string
	tool_calls?: GoogleToolCall[]
	tool_call_id?: string
}

// Interface for Google API tool call structure
interface GoogleToolCall {
	id: string
	type: "function"
	function: {
		name: string
		arguments: string
	}
}

// Interface for Google API choice structure
interface GoogleChoice {
	index: number
	message: GoogleMessage
	finish_reason?: string
}

// Interface for Google API usage structure  
interface GoogleUsage {
	prompt_tokens: number
	completion_tokens: number
	total_tokens: number
}

// Interface for Google API response structure
interface GoogleApiResponse {
	id: string
	object: string
	created: number
	model: string
	choices: GoogleChoice[]
	usage?: GoogleUsage
}

/**
 * Converts neutral conversation history to Google API format
 */
export function convertToGoogleFormat(neutralHistory: NeutralConversationHistory): GoogleMessage[] {
	const googleMessages: GoogleMessage[] = []

	for (const message of neutralHistory) {
		const googleMessage: GoogleMessage = {
			role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
			content: convertContent(message.content)
		}

		googleMessages.push(googleMessage)
	}

	return googleMessages
}

/**
 * Converts neutral message content to Google API content format
 */
function convertContent(content: string | NeutralMessageContent): string | GoogleContent[] {
	if (typeof content === "string") {
		return content
	}

	const convertedContent: GoogleContent[] = []

	for (const block of content) {
		if (block.type === "text") {
			convertedContent.push({
				type: "text",
				text: block.text
			})
		} else if (block.type === "image") {
			if (block.source.type === "base64") {
				convertedContent.push({
					type: "image_url",
					image_url: {
						url: `data:${block.source.media_type};base64,${block.source.data}`
					}
				})
			} else if (block.source.type === "image_url") {
				convertedContent.push({
					type: "image_url",
					image_url: {
						url: block.source.url
					}
				})
			}
		} else if (block.type === "tool_use") {
			convertedContent.push({
				type: "tool_call",
				id: block.id,
				function: {
					name: block.name,
					arguments: JSON.stringify(block.input)
				}
			})
		}
	}

	return convertedContent
}

/**
 * Converts Google API response to neutral format
 */
export function convertFromGoogleFormat(response: GoogleApiResponse): NeutralMessage {
	const choice = response.choices[0]
	const message = choice.message

	return {
		role: "assistant",
		content: convertFromGoogleContent(message.content)
	}
}

/**
 * Converts Google API content to neutral message content
 */
function convertFromGoogleContent(content: string | GoogleContent[]): string | NeutralMessageContent {
	if (typeof content === "string") {
		return content
	}

	const blocks: (NeutralTextContentBlock | NeutralToolUseContentBlock)[] = []

	for (const item of content) {
		if (item.type === "text") {
			blocks.push({
				type: "text",
				text: item.text
			})
		} else if (item.type === "tool_call") {
			blocks.push({
				type: "tool_use",
				id: item.id,
				name: item.function.name,
				input: JSON.parse(item.function.arguments) as Record<string, unknown>
			})
		}
	}

	return blocks
}