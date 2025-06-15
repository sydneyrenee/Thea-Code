import OpenAI from "openai"
import type {
	NeutralConversationHistory,
	NeutralMessage,
	NeutralMessageContent,
	NeutralToolResultContentBlock,
} from "../../shared/neutral-history"

/**
 * OpenAI transformation utilities for handling API integrations
 */

// Interface for OpenAI tool call data
interface OpenAIToolCall {
	id: string
	type: "function"
	function: {
		name: string
		arguments: string
	}
}

// Interface for OpenAI completion options
interface OpenAICompletionOptions {
	model: string
	messages: OpenAI.Chat.ChatCompletionMessageParam[]
	temperature?: number
	max_tokens?: number
	tools?: OpenAI.Chat.ChatCompletionTool[]
	tool_choice?: OpenAI.Chat.ChatCompletionToolChoiceOption
	stream?: boolean
	response_format?: Record<string, unknown>
	presence_penalty?: number
	frequency_penalty?: number
	logit_bias?: Record<string, number>
	user?: string
	seed?: number
	top_p?: number
	n?: number
	stop?: string | string[]
	suffix?: string
	echo?: boolean
	best_of?: number
	logprobs?: number
	top_logprobs?: number
	completion_tokens?: number
}

/**
 * Extract tool calls from OpenAI delta response
 */
export function extractToolCalls(delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta): OpenAIToolCall[] {
	if (!delta?.tool_calls) return []
	
	return delta.tool_calls
		.filter((call): call is Required<typeof call> => call.id !== undefined)
		.map(call => ({
			id: call.id,
			type: "function" as const,
			function: {
				name: call.function?.name || "",
				arguments: call.function?.arguments || "",
			},
		}))
}

/**
 * Convert OpenAI Chat Completion response to neutral format
 * This function converts the OpenAI response format to the neutral conversation history format
 * used throughout the application for provider-agnostic handling.
 */
export function convertOpenAIToNeutral(response: OpenAI.Chat.ChatCompletion): NeutralConversationHistory {
	// Convert each choice to a neutral message
	return response.choices.map((choice): NeutralMessage => {
		const message = choice.message
		
		// Create the neutral message with proper role mapping
		const neutralMessage: NeutralMessage = {
			role: message.role,
			content: [] as NeutralMessageContent
		}

		// Handle content based on its type
		if (typeof message.content === "string" && message.content) {
			// If content is a simple string, create a text block
			neutralMessage.content = [{
				type: "text",
				text: message.content
			}]
		} else if (message.content === null) {
			// Handle null content (can happen when tool_calls are present)
			neutralMessage.content = []
		}

		// Handle tool calls for assistant messages
		if (message.tool_calls && message.role === "assistant") {
			// Ensure content is an array
			if (!Array.isArray(neutralMessage.content)) {
				neutralMessage.content = []
			}
			
			message.tool_calls.forEach((toolCall) => {
				if (toolCall.type === "function") {
					// Parse the arguments JSON safely
					let args: Record<string, unknown>
					try {
						args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>
					} catch (e) {
						console.warn("Failed to parse tool call arguments:", e)
						args = { raw: toolCall.function.arguments || "" }
					}

					// Add tool use block to content
					(neutralMessage.content as NeutralMessageContent).push({
						type: "tool_use",
						id: toolCall.id,
						name: toolCall.function.name,
						input: args
					})
				}
			})
		}

		return neutralMessage
	})
}

/**
 * Transform completion options for OpenAI API
 */
export function transformCompletionOptions(options: OpenAICompletionOptions): OpenAI.Chat.ChatCompletionCreateParams {
	return {
		model: options.model,
		messages: options.messages,
		temperature: options.temperature,
		max_tokens: options.max_tokens,
		tools: options.tools,
		tool_choice: options.tool_choice,
		stream: options.stream,
	}
}

/**
 * Handle OpenAI streaming response
 */
export function handleStreamingResponse(chunk: OpenAI.Chat.ChatCompletionChunk): string {
	return chunk?.choices?.[0]?.delta?.content || ""
}

/**
 * Process OpenAI tool result
 */
export function processToolResult(result: { id: string; content: string }): NeutralToolResultContentBlock {
	return {
		type: "tool_result",
		tool_use_id: result.id,
		content: [
			{
				type: "text",
				text: result.content,
			},
		],
	}
}