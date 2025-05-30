import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"
import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"; // Import neutral history types
import { convertToAnthropicHistory, convertToAnthropicContentBlocks } from "../transform/neutral-anthropic-format"; // Import conversion functions
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants"
import { SingleCompletionHandler, getModelParams } from "../index"

export class AnthropicHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private client: Anthropic

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new Anthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.anthropicBaseUrl || undefined,
		})
	}

	// Updated to accept NeutralConversationHistory
	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// Convert neutral history to Anthropic format
		const anthropicMessages = convertToAnthropicHistory(messages);

		let stream: AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>
		const cacheControl: CacheControlEphemeral = { type: "ephemeral" }
		let { id: modelId, maxTokens, thinking, temperature, virtualId } = this.getModel()

		switch (modelId) {
			case "claude-3-7-sonnet-20250219":
			case "claude-3-5-sonnet-20241022":
			case "claude-3-5-haiku-20241022":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307": {
				/**
				 * The latest message will be the new user message, one before will
				 * be the assistant message from a previous request, and the user message before that will be a previously cached user message. So we need to mark the latest user message as ephemeral to cache it for the next request, and mark the second to last user message as ephemeral to let the server know the last message to retrieve from the cache for the current request..
				 */
				// Use the converted Anthropic messages
				const userMsgIndices = anthropicMessages.reduce(
					(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
					[] as number[],
				)

				const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
				const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

				try {
					stream = await this.client.messages.create(
						{
							model: modelId,
							max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
							temperature,
							thinking,
							// Setting cache breakpoint for system prompt so new tasks can reuse it.
							system: [{ text: systemPrompt, type: "text", cache_control: cacheControl }],
							// Use the converted Anthropic messages
							messages: anthropicMessages.map((message, index) => {
								if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
									return {
										...message,
										content:
											typeof message.content === "string"
												? [{ type: "text", text: message.content, cache_control: cacheControl }]
												: message.content.map((content, contentIndex) =>
														contentIndex === message.content.length - 1
															? { ...content, cache_control: cacheControl }
															: content,
													),
									}
								}
								return message
							}),
							// tools, // cache breakpoints go from tools > system > messages, and since tools dont change, we can just set the breakpoint at the end of system (this avoids having to set a breakpoint at the end of tools which by itself does not meet min requirements for haiku caching)
							// tool_choice: { type: "auto" },
							// tools: tools,
							stream: true,
						},
						(() => {
							// prompt caching: https://x.com/alexalbert__/status/1823751995901272068
							// https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#default-headers
							// https://github.com/anthropics/anthropic-sdk-typescript/commit/c920b77fc67bd839bfeb6716ceab9d7c9bbe7393

							const betas = []

							// Check for the thinking-128k variant first
							if (virtualId === "claude-3-7-sonnet-20250219:thinking") {
								betas.push("output-128k-2025-02-19")
							}

							// Then check for models that support prompt caching
							switch (modelId) {
								case "claude-3-7-sonnet-20250219":
								case "claude-3-5-sonnet-20241022":
								case "claude-3-5-haiku-20241022":
								case "claude-3-opus-20240229":
								case "claude-3-haiku-20240307":
									betas.push("prompt-caching-2024-07-31")
									return {
										headers: { "anthropic-beta": betas.join(",") },
									}
								default:
									return undefined
							}
						})(),
					)
				} catch (error) {
					console.error("Error creating Anthropic message stream:", error);
					// Depending on your error handling strategy, you might want to:
					// - Rethrow the error: throw error;
					// - Yield an error chunk: yield { type: "error", message: error.message };
					// - Log and return/break
					throw error; // Or handle gracefully
				}
				break
			}
			default: {
				try {
					stream = (await this.client.messages.create({
						model: modelId,
						max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
						temperature,
						system: [{ text: systemPrompt, type: "text" }],
						// Use the converted Anthropic messages
						messages: anthropicMessages,
						// tools,
						// tool_choice: { type: "auto" },
						stream: true,
					})) as AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>
				} catch (error) {
					console.error("Error creating Anthropic message stream for default model:", error);
					throw error; // Consistent error handling with the above case
				}
				break
			}
		}

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start": {
					// Tells us cache reads/writes/input/output.
					const usage = chunk.message.usage

					yield {
						type: "usage",
						inputTokens: usage.input_tokens || 0,
						outputTokens: usage.output_tokens || 0,
						cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
						cacheReadTokens: usage.cache_read_input_tokens || undefined,
					}

					break
				}
				case "message_delta": {
					// Tells us stop_reason, stop_sequence, and output tokens
					// along the way and at the end of the message.
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}

					break
				}
				case "message_stop":
					// No usage data, just an indicator that the message is done.
					break
				case "content_block_start": {
					switch (chunk.content_block.type) {
						case "thinking": {
							// We may receive multiple text blocks, in which
							// case just insert a line break between them.
							if (chunk.index > 0) {
								yield { type: "reasoning", text: "\n" }
							}

							yield { type: "reasoning", text: chunk.content_block.thinking }
							break
						}
						case "text": {
							// We may receive multiple text blocks, in which
							// case just insert a line break between them.
							if (chunk.index > 0) {
								yield { type: "text", text: "\n" }
							}

							yield { type: "text", text: chunk.content_block.text }
							break
						}
						case "tool_use": {
							const toolUseBlock = chunk.content_block;
							// Process tool use using MCP integration via BaseProvider.processToolUse
							const toolResult = await this.processToolUse({
								id: toolUseBlock.id,
								name: toolUseBlock.name,
								input: toolUseBlock.input
							});

							// Ensure the tool result content is a string for StreamToolResult
							const toolResultString = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

							// Yield tool result
							yield {
								type: 'tool_result',
								id: toolUseBlock.id, // Corrected from 'tool_use_id' to 'id'
								content: toolResultString
							};
							break;
						}
					}
					break;
				}
				case "content_block_delta": {
					switch (chunk.delta.type) {
						case "thinking_delta": {
							yield { type: "reasoning", text: chunk.delta.thinking }
							break
						}
						case "text_delta": {
							yield { type: "text", text: chunk.delta.text }
							break
						}
					}
					break
				}
				case "content_block_stop": {
					break;
				}
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId;
		let id = modelId && modelId in anthropicModels ? (modelId as AnthropicModelId) : anthropicDefaultModelId;
		const info: ModelInfo = anthropicModels[id];

		// Track the original model ID for special variant handling
		const virtualId = id;

		 // Special handling for thinking variants
		// The `:thinking` variant is a virtual identifier for the
		// `claude-3-7-sonnet-20250219` model with a thinking budget.
		if (id === "claude-3-7-sonnet-20250219:thinking") {
			id = "claude-3-7-sonnet-20250219";
		}

		// Get base model parameters
		const baseParams = getModelParams({
			options: this.options,
			model: info,
			defaultMaxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS
		});

		// Model-specific thinking adjustments
		if (info.thinking) {
			// For models that support thinking, ensure proper configuration
			const customMaxTokens = this.options.modelMaxTokens;
			const customMaxThinkingTokens = this.options.modelMaxThinkingTokens;

			// Set thinking parameter for model variants that use it
			if (virtualId.includes(":thinking")) {
				// Clamp the thinking budget to be at most 80% of max tokens and at least 1024 tokens
				const effectiveMaxTokens = customMaxTokens ?? baseParams.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS;
				const maxBudgetTokens = Math.floor(effectiveMaxTokens * 0.8);
				const budgetTokens = Math.max(
					Math.min(customMaxThinkingTokens ?? maxBudgetTokens, maxBudgetTokens),
					1024
				);

				// Override thinking with specific budget
				baseParams.thinking = {
					type: "enabled",
					budget_tokens: budgetTokens
				};
			}
		}

		return {
			id,
			info,
			virtualId, // Include the original ID to use for header selection
			...baseParams,
		}
	}

	async completePrompt(prompt: string) {
		let { id: modelId, temperature } = this.getModel()

		const message = await this.client.messages.create({
			model: modelId,
			max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
			thinking: undefined,
			temperature,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		})

		const content = message.content.find(({ type }) => type === "text")
		return content?.type === "text" ? content.text : ""
	}

	/**
	 * Counts tokens for the given content using Anthropic's API
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// Convert neutral content to Anthropic content blocks for API call
			const anthropicContentBlocks = convertToAnthropicContentBlocks(content);

			// Use the current model
			const actualModelId = this.getModel().id

			const response = await this.client.messages.countTokens({
				model: actualModelId,
				messages: [
					{
						role: "user",
						content: anthropicContentBlocks, // Use the converted content blocks
					},
				],
			})

			return response.input_tokens
		} catch (error) {
			// Log error but fallback to tiktoken estimation
			console.warn("Anthropic token counting failed, using fallback", error)

			// Use the base provider's implementation as fallback (which now expects NeutralMessageContent)
			return super.countTokens(content) // Pass the original neutral content
		}
	}
}
