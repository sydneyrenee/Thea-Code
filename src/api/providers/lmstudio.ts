import OpenAI from "openai"
import axios from "axios"

import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
import { NeutralConversationHistory } from "../../shared/neutral-history" // Import NeutralConversationHistory
import { convertToOpenAiHistory } from "../transform/neutral-openai-format" // Use neutral format conversion
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"

const LMSTUDIO_DEFAULT_TEMPERATURE = 0

export class LmStudioHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: (this.options.lmStudioBaseUrl || "http://localhost:1234") + "/v1",
			apiKey: "noop",
		})
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// Convert neutral history to OpenAI format
		const openAiMessages = convertToOpenAiHistory(messages)

		// Add system prompt if not already included
		const hasSystemMessage = openAiMessages.some((msg) => msg.role === "system")
		if (systemPrompt && systemPrompt.trim() !== "" && !hasSystemMessage) {
			openAiMessages.unshift({ role: "system", content: systemPrompt })
		}

		try {
			// Create params object with optional draft model
			const params: OpenAI.Chat.ChatCompletionCreateParams = {
				model: this.getModel().id,
				messages: openAiMessages,
				temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
				stream: true,
			}

			// Add draft model if speculative decoding is enabled and a draft model is specified
			if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				;(params as any).draft_model = this.options.lmStudioDraftModelId // Accommodate custom param
			}

			const stream = await this.client.chat.completions.create(params)

			// Stream handling with MCP integration for tool use
			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta
				if (delta?.content) {
					yield {
						type: "text",
						text: delta.content,
					}
				}

				// Handle tool calls if present (MCP integration)
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
								console.warn("LMStudio tool use error:", error)
								yield {
									type: "tool_result",
									id: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
									content: `Error: ${error instanceof Error ? error.message : String(error)}`,
								}
							}
						}
					}
				}
			}
		} catch {
			// const error = e as Error; // Unused
			// LM Studio doesn't return an error code/body for now
			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Thea Code's prompts.",
			)
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.lmStudioModelId || "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			// Create params object with optional draft model
			const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
				model: this.getModel().id,
				messages: [{ role: "user", content: prompt }],
				temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
				stream: false,
			}

			// Add draft model if speculative decoding is enabled and a draft model is specified
			if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				;(params as any).draft_model = this.options.lmStudioDraftModelId // Accommodate custom param
			}

			const response = await this.client.chat.completions.create(params)
			return response.choices[0]?.message.content || ""
		} catch {
			// const error = e as Error; // Unused
			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Thea Code's prompts.",
			)
		}
	}
}

export async function getLmStudioModels(baseUrl = "http://localhost:1234") {
	try {
		if (!URL.canParse(baseUrl)) {
			return []
		}

		const response = await axios.get(`${baseUrl}/v1/models`)
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const modelsArray = response.data?.data?.map((model: { id: string }) => model.id) || [] // Type 'model'
		return [...new Set<string>(modelsArray as string[])] // Assert modelsArray is string[]
	} catch {
		// const error = _e as Error; // Unused
		return []
	}
}
