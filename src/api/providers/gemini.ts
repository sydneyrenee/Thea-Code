import { GoogleGenerativeAI } from "@google/generative-ai"
import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, geminiDefaultModelId, GeminiModelId, geminiModels, ModelInfo } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"
import { convertToGeminiHistory, convertToGeminiContentBlocks } from "../transform/neutral-gemini-format"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"

const GEMINI_DEFAULT_TEMPERATURE = 0

export class GeminiHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: GoogleGenerativeAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new GoogleGenerativeAI(options.geminiApiKey ?? "not-provided")
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const model = this.client.getGenerativeModel(
			{
				model: this.getModel().id,
				systemInstruction: systemPrompt,
			},
			{
				baseUrl: this.options.googleGeminiBaseUrl || undefined,
			},
		)
		const result = await model.generateContentStream({
			contents: convertToGeminiHistory(messages),
			generationConfig: {
				// maxOutputTokens: this.getModel().info.maxTokens,
				temperature: this.options.modelTemperature ?? GEMINI_DEFAULT_TEMPERATURE,
			},
		})

		for await (const chunk of result.stream) {
			yield {
				type: "text",
				text: chunk.text(),
			}
		}

		const response = await result.response
		yield {
			type: "usage",
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		}
	}

	override getModel(): { id: GeminiModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in geminiModels) {
			const id = modelId as GeminiModelId
			return { id, info: geminiModels[id] }
		}
		return { id: geminiDefaultModelId, info: geminiModels[geminiDefaultModelId] }
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const model = this.client.getGenerativeModel(
				{
					model: this.getModel().id,
				},
				{
					baseUrl: this.options.googleGeminiBaseUrl || undefined,
				},
			)

			const result = await model.generateContent({
				contents: [{ role: "user", parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: this.options.modelTemperature ?? GEMINI_DEFAULT_TEMPERATURE,
				},
			})

			return result.response.text()
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Gemini completion error: ${error.message}`)
			}
			throw error
		}
	}

	/**
	 * Counts tokens for the given content using the base provider's implementation
	 * and Gemini-specific handling for images and other content types
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: NeutralMessageContent): Promise<number> {
		try {
			// For simple text content, use the base provider's implementation
			if (typeof content === 'string' || 
				(Array.isArray(content) && content.every(block => block.type === 'text'))) {
				return super.countTokens(content);
			}
			
			// For mixed content (including images), we need special handling
			if (Array.isArray(content)) {
				let totalTokens = 0;
				
				// Process each block based on its type
				for (const block of content) {
					if (block.type === 'text') {
						// Use base implementation for text blocks
						totalTokens += await super.countTokens([block]);
					} else if (block.type === 'image') {
						// Gemini charges approximately 258 tokens for a 512x512 image
						// This is a rough estimate and may need adjustment
						totalTokens += 258;
					} else if (block.type === 'tool_use' || block.type === 'tool_result') {
						// For tool use/result, count the JSON representation
						const jsonStr = JSON.stringify(block);
						// Create a text content block to pass to super.countTokens
						totalTokens += await super.countTokens([{ type: 'text', text: jsonStr }]);
					}
				}
				
				return totalTokens;
			}
			
			// Fallback to base implementation for any other cases
			return super.countTokens(content);
		} catch (error) {
			console.warn("Gemini token counting error, using fallback", error);
			return super.countTokens(content);
		}
	}
}
