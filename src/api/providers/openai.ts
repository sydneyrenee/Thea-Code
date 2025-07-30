import OpenAI, { AzureOpenAI } from "openai"
import axios from "axios"

import {
	ApiHandlerOptions,
	azureOpenAiDefaultApiVersion,
	ModelInfo,
	openAiModelInfoSaneDefaults,
} from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history" // Import neutral history types
import { SingleCompletionHandler } from "../index"
import { convertToOpenAiHistory, convertToOpenAiContentBlocks } from "../transform/neutral-openai-format" // Import conversion functions
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { XmlMatcher } from "../../utils/xml-matcher"
import { API_REFERENCES } from "../../../dist/thea-config" // Import branded constants
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants" // Import ANTHROPIC_DEFAULT_MAX_TOKENS
import { supportsTemperature, hasCapability } from "../../utils/model-capabilities" // Import capability detection functions

const DEEP_SEEK_DEFAULT_TEMPERATURE = 0.6

export const defaultHeaders = {
	"HTTP-Referer": API_REFERENCES.HOMEPAGE,
	"X-Title": API_REFERENCES.APP_TITLE,
}

// OpenAiHandlerOptions is just an alias for ApiHandlerOptions
export type OpenAiHandlerOptions = ApiHandlerOptions

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
		} catch {
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
		const modelId = this.options.openAiModelId ?? ""
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false // Keep for now, might be refactored later
		// Use model capabilities instead of hardcoded model checks
		const isReasoningModel = modelInfo.reasoningEffort === "high" || enabledR1Format
		// Note: ark variable removed as it was unused

		// Convert neutral history to OpenAI format
		let openAiMessages = convertToOpenAiHistory(messages)

		// Add system prompt if not already included
		const hasSystemMessage = openAiMessages.some((msg) => msg.role === "system")
		if (!hasSystemMessage && systemPrompt) {
			openAiMessages = [{ role: "system", content: systemPrompt }, ...openAiMessages]
		}

		// Check if this is a model that requires special handling
		// O3-mini models don't support temperature and need special handling
		if (!supportsTemperature(modelInfo)) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages)
			return
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
				temperature: this.options.modelTemperature ?? (isReasoningModel ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0), // Use capability-based check
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
				const toolCalls = this.extractToolCalls(delta)
				for (const toolCall of toolCalls) {
					if (toolCall.function) {
						// Process tool use using MCP integration
						const toolResult = await this.processToolUse({
							id: toolCall.id,
							name: toolCall.function.name,
							input: JSON.parse(toolCall.function.arguments || "{}"),
						})

						// Ensure the tool result content is a string
						const toolResultString =
							typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

						// Yield tool result
						yield {
							type: "tool_result",
							id: toolCall.id,
							content: toolResultString,
						}
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
				yield this.processUsageMetrics(lastUsage)
			}
		} else {
			// o1 for instance doesnt support streaming, non-1 temp, or system prompt
			// Note: System prompt is already included in openAiMessages

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
			if (response.usage) {
				yield this.processUsageMetrics(response.usage)
			}
		}
	}

	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// Convert neutral content to OpenAI content blocks for API call
			const openAiContentBlocks = convertToOpenAiContentBlocks(content)

			// Use the current model
			const actualModelId = this.getModel().id

			// Create a dummy message with the content for the token counting API
			const dummyMessage: OpenAI.Chat.ChatCompletionMessageParam = {
				role: "user", // Token counting is typically done on user input
				content: "", // Initialize with empty string
			}

			// Set the content based on its type
			if (typeof content === "string") {
				// If it's a simple string, use it directly
				dummyMessage.content = content
			} else {
				// Otherwise use the array of content blocks
				// Cast to OpenAI.Chat.ChatCompletionContentPart[] which is the expected type
				dummyMessage.content = openAiContentBlocks as OpenAI.Chat.ChatCompletionContentPart[]
			}

			const response = await this.client.chat.completions.create({
				model: actualModelId,
				messages: [dummyMessage],
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
			console.warn("OpenAI token counting failed, using fallback", error)

			// Use the base provider's implementation as fallback
			return super.countTokens(content)
		}
	}

	protected processUsageMetrics(usage: { prompt_tokens?: number; completion_tokens?: number }): ApiStreamUsageChunk {
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
	public hasToolCalls(delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta): boolean {
		// Use extractToolCalls to maintain consistency and follow DRY principle
		return this.extractToolCalls(delta).length > 0
	}

	/**
	 * Extract tool calls from an OpenAI delta
	 * @param delta The OpenAI delta object
	 * @returns An array of tool calls
	 */
	public extractToolCalls(delta: OpenAI.Chat.ChatCompletionChunk.Choice.Delta | Record<string, unknown>): Array<{
		id: string
		type: string
		function: {
			name: string
			arguments: string
		}
	}> {
		// First, check for standard OpenAI function calls
		const standardToolCalls =
			(delta?.tool_calls as Array<{
				id: string
				type: string
				function: {
					name: string
					arguments: string
				}
			}>) ?? []

		if (standardToolCalls.length > 0) {
			return standardToolCalls
		}

		// If no standard tool calls found, check for content that might contain XML or JSON tool calls
		const content = delta?.content as string
		if (!content || typeof content !== "string") {
			return []
		}

		const toolCalls: Array<{
			id: string
			type: string
			function: {
				name: string
				arguments: string
			}
		}> = []

		// Check for XML tool use pattern
		const xmlToolUseRegex = /<(\w+)>[\s\S]*?<\/\1>/g
		let match

		while ((match = xmlToolUseRegex.exec(content)) !== null) {
			const tagName = match[1]
			// Skip known non-tool tags
			if (tagName !== "think" && tagName !== "tool_result" && tagName !== "tool_use") {
				const toolUseXml = match[0]

				try {
					// Extract parameters
					const params: Record<string, unknown> = {}

					// First, remove the outer tool tag to simplify parsing
					let outerContent = toolUseXml
					outerContent = outerContent.replace(new RegExp(`<${tagName}>\\s*`), "")
					outerContent = outerContent.replace(new RegExp(`\\s*</${tagName}>`), "")

					// Now parse each parameter
					const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
					let paramMatch

					while ((paramMatch = paramRegex.exec(outerContent)) !== null) {
						const paramName = paramMatch[1]
						const paramValue = paramMatch[2].trim()

						// Skip if the param name is the same as the tool name (outer tag)
						if (paramName !== tagName) {
							// Try to parse as JSON if possible
							try {
								params[paramName] = JSON.parse(paramValue)
							} catch {
								params[paramName] = paramValue
							}
						}
					}

					// Create tool call object in OpenAI format
					toolCalls.push({
						id: `${tagName}-${Date.now()}`,
						type: "function",
						function: {
							name: tagName,
							arguments: JSON.stringify(params),
						},
					})
				} catch (error) {
					console.warn("Error processing XML tool use:", error)
				}
			}
		}

		// Check for JSON tool use pattern if no XML tool use was found
		if (toolCalls.length === 0 && content.includes('"type":"tool_use"')) {
			try {
				// Try to find and parse JSON object
				const jsonStart = content.indexOf('{"type":"tool_use"')
				if (jsonStart !== -1) {
					// Find the end of the JSON object
					let braceCount = 0
					let inString = false
					let jsonEnd = -1

					for (let i = jsonStart; i < content.length; i++) {
						const char = content[i]

						if (char === '"' && content[i - 1] !== "\\") {
							inString = !inString
						} else if (!inString) {
							if (char === "{") braceCount++
							else if (char === "}") {
								braceCount--
								if (braceCount === 0) {
									jsonEnd = i + 1
									break
								}
							}
						}
					}

					if (jsonEnd !== -1) {
						const jsonStr = content.substring(jsonStart, jsonEnd)

						const jsonObj = JSON.parse(jsonStr) as {
							type: string
							name: string
							id?: string
							input?: Record<string, unknown>
						} // Assert type

						if (jsonObj.type === "tool_use" && jsonObj.name) {
							// Create tool call object in OpenAI format
							toolCalls.push({
								id: jsonObj.id || `${jsonObj.name}-${Date.now()}`,
								type: "function",
								function: {
									name: jsonObj.name,

									arguments: JSON.stringify(jsonObj.input || {}),
								},
							})
						}
					}
				}
			} catch (error) {
				console.warn("Error processing JSON tool use:", error)
			}
		}

		return toolCalls
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
				messages: [{ role: "user", content: prompt }],
				stream: false,
			})
			const content = message.choices[0]?.message.content
			return content || ""
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
		messages: NeutralConversationHistory,
	): ApiStream {
		// Convert neutral history to OpenAI format
		const openAiMessages = convertToOpenAiHistory(messages)
		const modelInfo = this.getModel().info

		// Check if the model supports various capabilities
		const supportsThinking = hasCapability(modelInfo, "thinking")
		const supportsImages = hasCapability(modelInfo, "images")

		// Customize the system prompt based on model capabilities
		let enhancedSystemPrompt = systemPrompt;
		
		// Add specific instructions based on model capabilities
		if (!supportsImages) {
			enhancedSystemPrompt += "\nNote: This model doesn't support image processing. Please respond accordingly if images are mentioned.";
		}
		
		if (supportsThinking) {
			enhancedSystemPrompt += "\nYou can use <think>...</think> tags to show your reasoning process.";
		}

		// Add system prompt as a developer message for models that need special handling
		const stream = await this.client.chat.completions.create({
			model: modelId.startsWith("o3-mini") ? "o3-mini" : modelId, // Keep the model ID check for backward compatibility
			messages: [
				{
					role: "developer",
					content: `Formatting re-enabled\n${enhancedSystemPrompt}`,
				},
				...openAiMessages,
			],
			stream: true,
			stream_options: { include_usage: true },
			// Note: reasoning_effort is not included as it's not properly typed
		})

		yield* this.handleStreamResponse(stream)
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
			const toolCalls = this.extractToolCalls(delta)
			for (const toolCall of toolCalls) {
				if (toolCall.function) {
					// Process tool use using MCP integration
					const toolResult = await this.processToolUse({
						id: toolCall.id,
						name: toolCall.function.name,
						input: JSON.parse(toolCall.function.arguments || "{}"),
					})

					// Ensure the tool result content is a string
					const toolResultString = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)

					// Yield tool result
					yield {
						type: "tool_result",
						id: toolCall.id,
						content: toolResultString,
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
}

export async function getOpenAiModels(baseUrl?: string, apiKey?: string) {
	try {
		if (!baseUrl) {
			return []
		}

		if (!URL.canParse(baseUrl)) {
			return []
		}

		const config: Record<string, unknown> = {}

		if (apiKey) {
			config["headers"] = { Authorization: `Bearer ${apiKey}` }
		}

		const response = await axios.get(`${baseUrl}/models`, config)
		const responseData = response.data as { data: { id: string; [key: string]: unknown }[] } | undefined

		const modelsArray = responseData?.data?.map((model: { id: string }) => model.id) || []
		return [...new Set<string>(modelsArray)]
	} catch (error) {
		console.error("Failed to fetch OpenAI models:", error)
		return {}
	}
}
