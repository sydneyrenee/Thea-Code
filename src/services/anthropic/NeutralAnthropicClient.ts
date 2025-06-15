import { Anthropic } from "@anthropic-ai/sdk"
import type { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import type { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"
import type { Messages } from "@anthropic-ai/sdk/resources"

import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import {
	convertToAnthropicHistory,
	convertToAnthropicContentBlocks,
	convertToNeutralHistory,
} from "../../api/transform/neutral-anthropic-format"
import type { ApiStreamChunk, ApiStream } from "../../api/transform/stream"

interface CreateMessageParams {
	model: string
	systemPrompt: string
	messages: NeutralConversationHistory
	maxTokens?: number
	temperature?: number
	thinking?: unknown // BetaThinkingConfigParam from SDK; use unknown here to avoid dependency
}

export class NeutralAnthropicClient {
	private client: Anthropic

	constructor(apiKey: string, baseURL?: string) {
		this.client = new Anthropic({ apiKey, baseURL })
	}

	/** Convert neutral history to Anthropic format */
	public toAnthropicHistory(history: NeutralConversationHistory) {
		return convertToAnthropicHistory(history)
	}

	/** Convert Anthropic history back to neutral format */
	public fromAnthropicHistory(history: Array<{ role: "user" | "assistant"; content: string | Array<unknown>; ts?: number }>) {
		// @ts-expect-error - Complex type conversion, needs refactoring
		return convertToNeutralHistory(history)
	}

	/** Create a streaming chat message */
	public async *createMessage({
		model,
		systemPrompt,
		messages,
		maxTokens,
		temperature,
		thinking,
	}: CreateMessageParams): ApiStream {
		const anthropicMessages = convertToAnthropicHistory(messages)
		const stream = (await this.client.messages.create({
			model,
			system: systemPrompt
				? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } as CacheControlEphemeral }]
				: undefined,
			messages: anthropicMessages as Messages.MessageParam[],
			max_tokens: maxTokens ?? 8000, // Provide default value
			temperature,
			// @ts-expect-error - thinking param type is complex and varies across SDK versions
			thinking,
			stream: true,
		})) as AnthropicStream<Messages.RawMessageStreamEvent>

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start":
					yield {
						type: "usage",
						inputTokens: chunk.message.usage?.input_tokens || 0,
						outputTokens: chunk.message.usage?.output_tokens || 0,
						cacheWriteTokens: chunk.message.usage?.cache_creation_input_tokens,
						cacheReadTokens: chunk.message.usage?.cache_read_input_tokens,
					} as ApiStreamChunk
					break
				case "message_delta":
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage?.output_tokens || 0,
					} as ApiStreamChunk
					break
				case "content_block_start":
					if (chunk.content_block.type === "text") {
						yield { type: "text", text: chunk.content_block.text } as ApiStreamChunk
					} else if (chunk.content_block.type === "thinking") {
						yield { type: "reasoning", text: chunk.content_block.thinking } as ApiStreamChunk
					} else if (chunk.content_block.type === "tool_use") {
						yield {
							type: "tool_use",
							id: chunk.content_block.id,
							name: chunk.content_block.name,
							input: chunk.content_block.input,
						} as ApiStreamChunk
					}
					break
				case "content_block_delta":
					if (chunk.delta.type === "text_delta") {
						yield { type: "text", text: chunk.delta.text } as ApiStreamChunk
					} else if (chunk.delta.type === "thinking_delta") {
						yield { type: "reasoning", text: chunk.delta.thinking } as ApiStreamChunk
					}
					break
				default:
					console.warn(`Unexpected chunk type encountered: ${chunk.type}`)
					break
			}
		}
	}

	/** Count tokens for the given neutral content */
	public async countTokens(model: string, content: NeutralMessageContent): Promise<number> {
		const anthropicBlocks = convertToAnthropicContentBlocks(content)
		const result = await this.client.messages.countTokens({
			model,
			messages: [{ role: "user", content: anthropicBlocks }],
		})
		return result.input_tokens
	}
}
