import OpenAI from "openai"
import { SingleCompletionHandler } from "../"
import {
	ApiHandlerOptions,
	ModelInfo,
	openAiNativeDefaultModelId,
	OpenAiNativeModelId,
	openAiNativeModels,
} from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history" // Import neutral history types
import { convertToOpenAiHistory } from "../transform/neutral-openai-format" // Import conversion function
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"

const OPENAI_NATIVE_DEFAULT_TEMPERATURE = 0

export class OpenAiNativeHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		const apiKey = this.options.openAiNativeApiKey ?? "not-provided"
		this.client = new OpenAI({ apiKey })
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const modelId = this.getModel().id

		// Convert neutral history to OpenAI format
		const openAiMessages = convertToOpenAiHistory(messages)

		// Add system prompt if not already included
		const hasSystemMessage = openAiMessages.some((msg) => msg.role === "system")
		const messagesWithSystem: OpenAI.Chat.ChatCompletionMessageParam[] = hasSystemMessage
			? openAiMessages
			: [{ role: "system" as const, content: systemPrompt }, ...openAiMessages]

		if (modelId.startsWith("o1")) {
			yield* this.handleO1FamilyMessage(modelId, systemPrompt, messagesWithSystem)
			return
		}

		if (modelId.startsWith("o3-mini")) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messagesWithSystem)
			return
		}

		yield* this.handleDefaultModelMessage(modelId, systemPrompt, messagesWithSystem)
	}

	private async *handleO1FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Array<OpenAI.Chat.ChatCompletionMessageParam>,
	): ApiStream {
		// o1 supports developer prompt with formatting
		// o1-preview and o1-mini only support user messages
		const isOriginalO1 = modelId === "o1"

		// For o1 models, we need to handle the system prompt specially
		const messagesWithoutSystem = messages.filter((msg) => msg.role !== "system")

		const response = await this.client.chat.completions.create({
			model: modelId,
			messages: [
				{
					role: isOriginalO1 ? "developer" : "user",
					content: isOriginalO1 ? `Formatting re-enabled\n${systemPrompt}` : systemPrompt,
				},
				...messagesWithoutSystem,
			],
			stream: true,
			stream_options: { include_usage: true },
		})

		yield* this.handleStreamResponse(response)
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Array<OpenAI.Chat.ChatCompletionMessageParam>,
	): ApiStream {
		// For o3-mini models, we need to handle the system prompt specially
		const messagesWithoutSystem = messages.filter((msg) => msg.role !== "system")

		// Create request options with reasoning_effort if available
		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: "o3-mini",
			messages: [
				{
					role: "developer",
					content: `Formatting re-enabled\n${systemPrompt}`,
				},
				...messagesWithoutSystem,
			],
			stream: true,
			stream_options: { include_usage: true },
		}

		// Add reasoning_effort if it's available in the model info
		const reasoningEffort = this.getModel().info.reasoningEffort
		if (reasoningEffort !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			;(requestOptions as any).reasoning_effort = reasoningEffort
		}

		const stream = await this.client.chat.completions.create(requestOptions)
		yield* this.handleStreamResponse(stream)
	}

	private async *handleDefaultModelMessage(
		modelId: string,
		systemPrompt: string,
		messages: Array<OpenAI.Chat.ChatCompletionMessageParam>,
	): ApiStream {
		const stream = await this.client.chat.completions.create({
			model: modelId,
			temperature: this.options.modelTemperature ?? OPENAI_NATIVE_DEFAULT_TEMPERATURE,
			messages: messages, // Already includes system message
			stream: true,
			stream_options: { include_usage: true },
		})

		yield* this.handleStreamResponse(stream)
	}

	private async *yieldResponseData(response: OpenAI.Chat.Completions.ChatCompletion): ApiStream {
		await Promise.resolve() // Satisfy require-await if disable comment is not working
		yield {
			type: "text",
			text: response.choices[0]?.message.content || "",
		}
		yield {
			type: "usage",
			inputTokens: response.usage?.prompt_tokens || 0,
			outputTokens: response.usage?.completion_tokens || 0,
		}
	}

	private async *handleStreamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>): ApiStream {
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			// Handle tool calls with MCP integration
			if (delta?.tool_calls) {
				for (const toolCall of delta.tool_calls) {
					if (toolCall.function?.name && toolCall.function?.arguments) {
						try {
							const toolUseInput = {
								name: toolCall.function.name,
								arguments: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
							}

							const toolResult = await this.processToolUse(toolUseInput)
							const toolResultString =
								typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

							yield {
								type: "tool_result",
								id: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
								content: toolResultString,
							}
						} catch (error) {
							console.warn("OpenAI Native tool use error:", error)
							yield {
								type: "tool_result",
								id: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
								content: `Error: ${error instanceof Error ? error.message : String(error)}`,
							}
						}
					}
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	override getModel(): { id: OpenAiNativeModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in openAiNativeModels) {
			const id = modelId as OpenAiNativeModelId
			return { id, info: openAiNativeModels[id] }
		}
		return { id: openAiNativeDefaultModelId, info: openAiNativeModels[openAiNativeDefaultModelId] }
	}

	/**
	 * Counts tokens for the given content using OpenAI's API
	 * Falls back to the base provider's implementation if the API call fails
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// Convert neutral content to OpenAI format
			const openAiContentBlocks = convertToOpenAiHistory([
				{
					role: "user",
					content: content,
				},
			])

			// Use the current model
			const actualModelId = this.getModel().id

			// Create a completion request with the content
			const response = await this.client.chat.completions.create({
				model: actualModelId,
				messages: openAiContentBlocks,
				stream: false,
			})

			// If usage information is available, return the prompt tokens
			if (response.usage) {
				return response.usage.prompt_tokens
			}

			// Fallback to base implementation if no usage information
			return super.countTokens(content)
		} catch (error) {
			// Log error but fallback to tiktoken estimation
			console.warn("OpenAI Native token counting failed, using fallback", error)

			// Use the base provider's implementation as fallback
			return super.countTokens(content)
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const modelId = this.getModel().id
			let requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming

			if (modelId.startsWith("o1")) {
				requestOptions = this.getO1CompletionOptions(modelId, prompt)
			} else if (modelId.startsWith("o3-mini")) {
				requestOptions = this.getO3CompletionOptions(modelId, prompt)
			} else {
				requestOptions = this.getDefaultCompletionOptions(modelId, prompt)
			}

			const response = await this.client.chat.completions.create(requestOptions)
			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`OpenAI Native completion error: ${error.message}`)
			}
			throw error
		}
	}

	private getO1CompletionOptions(
		modelId: string,
		prompt: string,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		return {
			model: modelId,
			messages: [{ role: "user", content: prompt }],
		}
	}

	private getO3CompletionOptions(
		modelId: string,
		prompt: string,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		return {
			model: "o3-mini",
			messages: [{ role: "user", content: prompt }],
			reasoning_effort: this.getModel().info.reasoningEffort,
		}
	}

	private getDefaultCompletionOptions(
		modelId: string,
		prompt: string,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
		return {
			model: modelId,
			messages: [{ role: "user", content: prompt }],
			temperature: this.options.modelTemperature ?? OPENAI_NATIVE_DEFAULT_TEMPERATURE,
		}
	}
}
