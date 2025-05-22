import OpenAI from "openai"
import axios from "axios"

import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import { convertToOllamaHistory, convertToOllamaContentBlocks } from "../transform/neutral-ollama-format"
import { ApiStream } from "../transform/stream"
import { HybridMatcher } from "../../utils/json-xml-bridge"
import { BaseProvider } from "./base-provider"
import { OpenAiHandler } from "./openai"

export class OllamaHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI
	private openAiHandler: OpenAiHandler

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: (this.options.ollamaBaseUrl || "http://localhost:10000") + "/v1",
			apiKey: "ollama", // Ollama uses a dummy key via OpenAI client
		})
		
		// Create an OpenAI handler for tool use detection and processing
		this.openAiHandler = new OpenAiHandler({
			...options,
			// Override any OpenAI-specific options as needed
			openAiApiKey: "ollama", // Use the same dummy key
			openAiBaseUrl: (this.options.ollamaBaseUrl || "http://localhost:10000") + "/v1",
			openAiModelId: this.options.ollamaModelId || ""
		})
	}

	// Updated to use NeutralConversationHistory
	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		// Convert neutral history to Ollama format
		const openAiMessages = convertToOllamaHistory(messages)

		// Add system prompt if not already included
		const hasSystemMessage = openAiMessages.some(msg => msg.role === 'system')
		if (systemPrompt && systemPrompt.trim() !== "" && !hasSystemMessage) {
			openAiMessages.unshift({ role: "system", content: systemPrompt })
		}

		const stream = await this.client.chat.completions.create({
			model: this.getModel().id,
			messages: openAiMessages,
			temperature: this.options.modelTemperature ?? 0,
			stream: true,
		})

		// Hybrid matching logic for reasoning/thinking blocks only
		const matcher = new HybridMatcher(
			"think",  // XML tag name for reasoning
			"thinking", // JSON type for reasoning
			(chunk) => {
				// Regular reasoning/text handling
				return {
					type: chunk.matched ? "reasoning" : "text",
					text: typeof chunk.data === 'string' ? chunk.data : JSON.stringify(chunk.data),
				} as const;
			}
		);
		
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta ?? {}

			if (delta.content) {
				// Use OpenAI handler for all tool use detection (including XML and JSON patterns)
				const toolCalls = this.openAiHandler.extractToolCalls(delta);
				
				if (toolCalls.length > 0) {
					// Process tool calls using OpenAI handler's logic
					for (const toolCall of toolCalls) {
						if (toolCall.function) {
							// Process tool use using MCP integration
							const toolResult = await this.processToolUse({
								id: toolCall.id,
								name: toolCall.function.name,
								input: JSON.parse(toolCall.function.arguments || '{}')
							});
							
							// Ensure the tool result content is a string
							const toolResultString = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
							
							// Yield tool result
							yield {
								type: 'tool_result',
								id: toolCall.id,
								content: toolResultString
							};
						}
					}
				} else {
					// If no tool use was detected, use the matcher for regular content
					for (const chunk of matcher.update(delta.content)) {
						yield chunk;
					}
				}
			}
		}
		
		for (const chunk of matcher.final()) {
			yield chunk
		}
	}

	// Implement countTokens method for NeutralMessageContent
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// Convert neutral content to Ollama format (string)
			const ollamaContent = convertToOllamaContentBlocks(content)
			
			// Use the base provider's implementation for token counting
			// This will use tiktoken to count tokens in the string
			return super.countTokens([{ type: 'text', text: ollamaContent }])
		} catch (error) {
			console.warn("Ollama token counting error, using fallback", error)
			return super.countTokens(content)
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.ollamaModelId || "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	// Update completePrompt to use the same conversion logic
	async completePrompt(prompt: string): Promise<string> {
		try {
			// Create a simple neutral history with a single user message
			const neutralHistory: NeutralConversationHistory = [
				{ role: 'user', content: [{ type: 'text', text: prompt }] }
			]
			
			// Convert to Ollama format
			const openAiMessages = convertToOllamaHistory(neutralHistory)
			
			const response = await this.client.chat.completions.create({
				model: this.getModel().id,
				messages: openAiMessages,
				temperature: this.options.modelTemperature ?? 0,
				stream: false,
			})
			
			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Ollama completion error: ${error.message}`)
			}
			throw error
		}
	}
}

// getOllamaModels function remains the same
export async function getOllamaModels(baseUrl = "http://localhost:10000") {
	try {
		if (!URL.canParse(baseUrl)) {
			return []
		}

		const response = await axios.get(`${baseUrl}/api/tags`)
		const modelsArray = response.data?.models?.map((model: { name: string }) => model.name) || []
		return [...new Set<string>(modelsArray)]
	} catch {
		// Silently return empty array on error
		return []
	}
}
