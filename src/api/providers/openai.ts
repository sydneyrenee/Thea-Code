import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import axios from "axios"

import {
	ApiHandlerOptions,
	azureOpenAiDefaultApiVersion,
	ModelInfo,
	openAiModelInfoSaneDefaults,
} from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"; // Import neutral history types
import { SingleCompletionHandler } from "../index"
import { convertToOpenAiHistory, convertToOpenAiContentBlocks } from "../transform/neutral-openai-format"; // Import conversion functions
import { convertToR1Format } from "../transform/r1-format" // Keep for now, might be refactored later
import { convertToSimpleMessages } from "../transform/simple-format" // Keep for now, might be refactored later
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { XmlMatcher } from "../../utils/xml-matcher"
import { API_REFERENCES } from "../../../dist/thea-config" // Import branded constants
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants" // Import ANTHROPIC_DEFAULT_MAX_TOKENS

const DEEP_SEEK_DEFAULT_TEMPERATURE = 0.6

export const defaultHeaders = {
	"HTTP-Referer": API_REFERENCES.HOMEPAGE,
	"X-Title": API_REFERENCES.APP_TITLE,
}

export interface OpenAiHandlerOptions extends ApiHandlerOptions {}

export class OpenAiHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: OpenAiHandlerOptions
	private client: OpenAI

	constructor(options: OpenAiHandlerOptions) {
		super()
		this.options = options

		const baseURL = this.options.openAiBaseUrl ?? "https://api.openai.com/v1"
		const apiKey = this.options.openAiApiKey ?? "not-provided"
		let urlHost: string

		try {
			urlHost = new URL(this.options.openAiBaseUrl ?? "").host
		} catch (error) {
			// Likely an invalid `openAiBaseUrl`; we're still working on
			// proper settings validation.
			urlHost = ""
		}

		if (urlHost === "azure.com" || urlHost.endsWith(".azure.com") || options.openAiUseAzure) {
			// Azure API shape slightly differs from the core API shape:
			// https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
			this.client = new AzureOpenAI({
				baseURL,
				apiKey,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				defaultHeaders,
			})
		} else {
			this.client = new OpenAI({ baseURL, apiKey, defaultHeaders })
		}
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const modelInfo = this.getModel().info
		const modelUrl = this.options.openAiBaseUrl ?? ""
		const modelId = this.options.openAiModelId ?? ""
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false // Keep for now, might be refactored later
		const deepseekReasoner = modelId.includes("deepseek-reasoner") || enabledR1Format // Keep for now, might be refactored later
		const ark = modelUrl.includes(".volces.com") // Keep for now, might be refactored later

		// Convert neutral history to OpenAI format
		let openAiMessages = convertToOpenAiHistory(messages);

		// Add system prompt if not already included
		const hasSystemMessage = openAiMessages.some(msg => msg.role === 'system');
		if (!hasSystemMessage && systemPrompt) {
			openAiMessages = [
				{ role: 'system', content: systemPrompt },
				...openAiMessages
			];
		}

		if (modelId.startsWith("o3-mini")) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages);
			return;
		}

		if (this.options.openAiStreamingEnabled ?? true) {
			// System message is handled by convertToOpenAiHistory, but some models
			// might require it separately or in a specific format.
			// For now, we assume convertToOpenAiHistory includes it correctly.
			// let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
			// 	role: "system",
			// 	content: systemPrompt,
			// }

			// The conversion logic for deepseekReasoner and ark needs to be
			// integrated into convertToOpenAiHistory or handled by separate adapters.
			// For now, we use the primary conversion.
			// let convertedMessages;
			// if (deepseekReasoner) {
			// 	convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages]);
			// } else if (ark) {
			// 	convertedMessages = [systemMessage, ...convertToSimpleMessages(messages)];
			// } else {
			// 	if (modelInfo.supportsPromptCache) {
			// 		systemMessage = {
			// 			role: "system",
			// 			content: [
			// 				{
			// 					type: "text",
			// 					text: systemPrompt,
			// 					// @ts-ignore-next-line
			// 					cache_control: { type: "ephemeral" },
			// 				},
			// 			],
			// 		};
			// 	}
			// 	convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)];
			// 	if (modelInfo.supportsPromptCache) {
			// 		// Note: the following logic is copied from openrouter:
			// 		// Add cache_control to the last two user messages
			// 		// (note: this works because we only ever add one user message at a time, but if we added multiple we'd need to mark the user message before the last assistant message)
			// 		const lastTwoUserMessages = convertedMessages.filter((msg) => msg.role === "user").slice(-2);
			// 		lastTwoUserMessages.forEach((msg) => {
			// 			if (typeof msg.content === "string") {
			// 				msg.content = [{ type: "text", text: msg.content }];
			// 			}
			// 			if (Array.isArray(msg.content)) {
			// 				// NOTE: this is fine since env details will always be added at the end. but if it weren't there, and the user added a image_url type message, it would pop a text part before it and then move it after to the end.
			// 				let lastTextPart = msg.content.filter((part) => part.type === "text").pop();

			// 				if (!lastTextPart) {
			// 					lastTextPart = { type: "text", text: "..." }
			// 					msg.content.push(lastTextPart)
			// 				}
			// 				// @ts-ignore-next-line
			// 				lastTextPart["cache_control"] = { type: "ephemeral" }
			// 			}
			// 		})
			// 	}
			// }


			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				temperature: this.options.modelTemperature ?? (deepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0), // Keep for now
				messages: openAiMessages, // Use the converted OpenAI messages
				stream: true as const,
				stream_options: { include_usage: true },
			}
			if (this.options.includeMaxTokens) {
				requestOptions.max_tokens = modelInfo.maxTokens
			}
			// Add system prompt separately if needed by the model/API
			if (systemPrompt) {
				// This might need adjustment based on how convertToOpenAiHistory handles system prompts
				// and the specific OpenAI model's requirements.
				// For now, we assume it's included in openAiMessages.
			}

			const stream = await this.client.chat.completions.create(requestOptions)

			const matcher = new XmlMatcher(
				"think",
				(chunk) =>
					({
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					}) as const,
			)

			let lastUsage

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta ?? {}

				if (delta.content) {
					for (const chunk of matcher.update(delta.content)) {
						yield chunk
					}
				}

				// Handle tool use (function calls) using the helper method
				const toolCalls = this.extractToolCalls(delta);
				for (const toolCall of toolCalls) {
					if (toolCall.function) {
						// Process tool use using MCP integration
						const toolResult = await this.processToolUse({
							id: toolCall.id,
							name: toolCall.function.name,
							input: JSON.parse(toolCall.function.arguments || '{}')
						});

						// Yield tool result
						yield {
							type: 'tool_result',
							id: toolCall.id,
							content: toolResult
						};
					}
				}

				if ("reasoning_content" in delta && delta.reasoning_content) {
					yield {
						type: "reasoning",
						text: (delta.reasoning_content as string | undefined) || "",
					}
				}
				if (chunk.usage) {
					lastUsage = chunk.usage
				}
			}
			for (const chunk of matcher.final()) {
				yield chunk
			}

			if (lastUsage) {
				yield this.processUsageMetrics(lastUsage, modelInfo)
			}
		} else {
			// o1 for instance doesnt support streaming, non-1 temp, or system prompt
			const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
				role: "user",
				content: systemPrompt,
			}

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: openAiMessages, // Use the converted OpenAI messages
			}
			// Add system prompt separately if needed by the model/API
			if (systemPrompt) {
				// This might need adjustment based on how convertToOpenAiHistory handles system prompts
				// and the specific OpenAI model's requirements.
				// For now, we assume it's included in openAiMessages.
			}

			const response = await this.client.chat.completions.create(requestOptions)

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}
			yield this.processUsageMetrics(response.usage, modelInfo)
		}
	}

	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// Convert neutral content to OpenAI content blocks for API call
			const openAiContentBlocks = convertToOpenAiContentBlocks(content);

			// Use the current model
			const actualModelId = this.getModel().id;

			// Create a dummy message with the content for the token counting API
			const dummyMessage: OpenAI.Chat.ChatCompletionMessageParam = {
				role: "user", // Token counting is typically done on user input
				content: "" // Initialize with empty string
			};
			
			// Set the content based on its type
			if (typeof content === 'string') {
				// If it's a simple string, use it directly
				dummyMessage.content = content;
			} else {
				// Otherwise use the array of content blocks
				dummyMessage.content = openAiContentBlocks as any;
			}

			const response = await this.client.chat.completions.create({
				model: actualModelId,
				messages: [dummyMessage],
				stream: false
			});

			// If usage information is available, return the prompt tokens
			if (response.usage) {
				return response.usage.prompt_tokens;
			}
			
			// Fallback to base implementation if no usage information
			return super.countTokens(content);
		} catch (error) {
			// Log error but fallback to tiktoken estimation
			console.warn("OpenAI token counting failed, using fallback", error);

			// Use the base provider's implementation as fallback
			return super.countTokens(content);
		}
	}


	protected processUsageMetrics(usage: any, modelInfo?: ModelInfo): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
		}
	}

	/**
	 * Check if a delta contains tool calls
	 * @param delta The OpenAI delta object
	 * @returns True if the delta contains tool calls, false otherwise
	 */
	public hasToolCalls(delta: any): boolean {
		// Use extractToolCalls to maintain consistency and follow DRY principle
		return this.extractToolCalls(delta).length > 0;
	}

	/**
	 * Extract tool calls from an OpenAI delta
	 * @param delta The OpenAI delta object
	 * @returns An array of tool calls
	 */
	public extractToolCalls(delta: any): any[] {
		// Extracts tool calls from a delta chunk.
		// Ensures it returns an array, even if tool_calls is null or undefined.
		return delta?.tool_calls ?? [];
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.openAiModelId ?? "",
			info: this.options.openAiCustomModelInfo ?? openAiModelInfoSaneDefaults,
		}
	}

        async completePrompt(prompt: string): Promise<string> {
                try {
                        const modelId = this.getModel().id
                        const modelTemp = this.options.modelTemperature ?? 0
                        const message = await this.client.chat.completions.create({
                                model: modelId,
                                max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
                                temperature: modelTemp,
                                messages: [{ role: 'user', content: prompt }],
                                stream: false,
                        })
                        const content = message.choices[0]?.message.content
                        return content || ''
                } catch (error) {
                        if (error instanceof Error) {
                                throw new Error(`OpenAI completion error: ${error.message}`)
                        }
                        throw error
                }
        }

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: NeutralConversationHistory
	): ApiStream {
		// Convert neutral history to OpenAI format
		const openAiMessages = convertToOpenAiHistory(messages);
		
		// Add system prompt as a developer message for o3-mini models
		const stream = await this.client.chat.completions.create({
			model: "o3-mini",
			messages: [
				{
					role: "developer",
					content: `Formatting re-enabled\n${systemPrompt}`,
				},
				...openAiMessages
			],
			stream: true,
			stream_options: { include_usage: true }
			// Note: reasoning_effort is not included as it's not properly typed
		});

		yield* this.handleStreamResponse(stream);
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

			// Handle tool use (function calls) using the helper method
			const toolCalls = this.extractToolCalls(delta);
			for (const toolCall of toolCalls) {
				if (toolCall.function) {
					// Process tool use using MCP integration
					const toolResult = await this.processToolUse({
						id: toolCall.id,
						name: toolCall.function.name,
						input: JSON.parse(toolCall.function.arguments || '{}')
					});

					// Yield tool result
					yield {
						type: 'tool_result',
						id: toolCall.id,
						content: toolResult
					};
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

}

export async function getOpenAiModels(baseUrl?: string, apiKey?: string) {
	try {
		if (!baseUrl) {
			return []
		}

		if (!URL.canParse(baseUrl)) {
			return []
		}

		const config: Record<string, any> = {}

		if (apiKey) {
			config["headers"] = { Authorization: `Bearer ${apiKey}` }
		}

		const response = await axios.get(`${baseUrl}/models`, config)
		const modelsArray = response.data?.data?.map((model: any) => model.id) || []
		return [...new Set<string>(modelsArray)]
	} catch (error) {
		console.error("Failed to fetch OpenAI models:", error)
		return {}
	}
}
