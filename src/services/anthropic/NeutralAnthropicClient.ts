// Fetch-based implementation without SDK dependencies
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import {
	convertToAnthropicHistory,
	convertToAnthropicContentBlocks,
	convertToNeutralHistory,
} from "../../api/transform/neutral-anthropic-format"
import type { ApiStreamChunk, ApiStream } from "../../api/transform/stream"
import type { 
	NeutralAnthropicClientOptions,
	NeutralCreateMessageParams,
	NeutralMessageStreamEvent,
	NeutralCacheControlEphemeral,
	AnthropicHistoryMessage,
	NeutralUsage
} from "./types"

export class NeutralAnthropicClient {
	private apiKey: string
	private baseURL: string

	constructor(options: NeutralAnthropicClientOptions) {
		this.apiKey = options.apiKey
		const envBase = process.env.ANTHROPIC_BASE_URL
		if (options.baseURL) {
			this.baseURL = options.baseURL
		} else if (envBase && envBase.length > 0) {
			this.baseURL = envBase
		} else {
			const g = globalThis as Record<string, unknown>
			const mockPort = g.__OLLAMA_PORT__ as number | undefined
			this.baseURL = mockPort ? `http://127.0.0.1:${mockPort}` : "https://api.anthropic.com"
		}
	}

	/** Convert neutral history to Anthropic format */
	public toAnthropicHistory(history: NeutralConversationHistory) {
		return convertToAnthropicHistory(history)
	}

	/** 
	 * Convert Anthropic history back to neutral format 
	 * @param history Array of messages in Anthropic format
	 * @returns Conversation history in neutral format
	 */
	public fromAnthropicHistory(history: Array<AnthropicHistoryMessage>) {
		// Type assertion is needed because the content array can contain different types
		// that are handled by the conversion function
		return convertToNeutralHistory(history)
	}

	/** Create a streaming chat message */
	public async *createMessage(params: NeutralCreateMessageParams): ApiStream {
		const { model, systemPrompt, messages, maxTokens, temperature, thinking } = params
		const anthropicMessages = convertToAnthropicHistory(messages)
		
		// Create cache control for system prompt if provided
		const systemContent = systemPrompt
			? [{ 
				type: "text" as const, 
				text: systemPrompt, 
				cache_control: { type: "ephemeral" } as NeutralCacheControlEphemeral 
			}]
			: undefined
			
		// Prepare request parameters
		const requestParams: Record<string, unknown> = {
			model,
			system: systemContent,
			messages: anthropicMessages,
			max_tokens: maxTokens ?? 8000, // Provide default value
			temperature,
			stream: true,
		}
		
		// Add thinking parameter if provided
		if (thinking) {
			requestParams.thinking = thinking
		}
		
		try {
			// Create the stream using fetch
			const response = await fetch(`${this.baseURL}/v1/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(requestParams)
			})
			
			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`Anthropic API error: ${response.status} ${errorText}`)
			}
			
			if (!response.body) {
				throw new Error('Response body is null')
			}
			
			// Create a reader from the response body stream
			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			
			// Process the stream chunks
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				
				// Decode the chunk and split by lines
				const chunk = decoder.decode(value, { stream: true })
				const lines = chunk.split('\n').filter(line => line.trim() !== '')
				
				for (const line of lines) {
					// Skip empty lines and comments
					if (!line || line.startsWith(':')) continue
					
					// Remove the "data: " prefix
					const data = line.startsWith('data: ') ? line.slice(6) : line
					
					// Parse the JSON data
					try {
						if (data === '[DONE]') break
						
						const parsedChunk = JSON.parse(data) as NeutralMessageStreamEvent
						
						// Process the chunk based on its type
						switch (parsedChunk.type) {
							case "message_start": {
								// Extract usage information from message start event
								const usage = parsedChunk.message.usage as NeutralUsage
								yield {
									type: "usage",
									inputTokens: usage?.input_tokens || 0,
									outputTokens: usage?.output_tokens || 0,
									cacheWriteTokens: usage?.cache_creation_input_tokens,
									cacheReadTokens: usage?.cache_read_input_tokens,
								} as ApiStreamChunk
								break
							}
							
							case "message_delta": {
								// Extract usage information from message delta event
								yield {
									type: "usage",
									inputTokens: 0,
									outputTokens: parsedChunk.usage?.output_tokens || 0,
								} as ApiStreamChunk
								break
							}
							
							case "content_block_start": {
								// Process different content block types
								const contentBlock = parsedChunk.content_block
								
								if (contentBlock.type === "text") {
									// Text content block
									yield { 
										type: "text", 
										text: contentBlock.text 
									} as ApiStreamChunk
								} 
								else if (contentBlock.type === "thinking") {
									// Thinking/reasoning content block
									yield { 
										type: "reasoning", 
										text: contentBlock.thinking 
									} as ApiStreamChunk
								} 
								else if (contentBlock.type === "tool_use") {
									// Tool use content block
									yield {
										type: "tool_use",
										id: contentBlock.id,
										name: contentBlock.name,
										input: contentBlock.input,
									} as ApiStreamChunk
								}
								break
							}
							
							case "content_block_delta": {
								// Process content block delta events
								const delta = parsedChunk.delta
								
								if (delta.type === "text_delta") {
									// Text delta
									yield { 
										type: "text", 
										text: delta.text 
									} as ApiStreamChunk
								} 
								else if (delta.type === "thinking_delta") {
									// Thinking/reasoning delta
									yield { 
										type: "reasoning", 
										text: delta.thinking 
									} as ApiStreamChunk
								}
								break
							}
							
							default:
								// Log unexpected chunk types
								console.warn(`Unexpected chunk type encountered: ${parsedChunk.type}`)
								break
						}
					} catch (error) {
						console.error('Error parsing stream chunk:', error)
					}
				}
			}
		} catch (error) {
			console.error('Error in createMessage:', error)
			// Convert to a more descriptive error before throwing
			throw new Error(`Failed to create message: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/** Count tokens for the given neutral content */
	public async countTokens(model: string, content: NeutralMessageContent): Promise<number> {
		// Convert neutral content to Anthropic format
		const anthropicBlocks = convertToAnthropicContentBlocks(content)
		
		// Use fetch to count tokens
		try {
			const response = await fetch(`${this.baseURL}/v1/messages/count_tokens`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model,
					messages: [{ role: "user", content: anthropicBlocks }]
				})
			})
			
			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`Anthropic API error: ${response.status} ${errorText}`)
			}
			
			// Define the expected response type
			interface TokenCountResponse {
				input_tokens: number
			}
			
			const result = await response.json() as TokenCountResponse
			
			// Return the token count from the result
			return result.input_tokens
		} catch (error) {
			console.error('Error in countTokens:', error)
			// Convert to a more descriptive error before throwing
			throw new Error(`Failed to count tokens: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}
