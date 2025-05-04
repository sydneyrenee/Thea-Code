import { Anthropic } from "@anthropic-ai/sdk" // Keep for BaseProvider compatibility if needed, but not used directly for messages
import OpenAI from "openai"
import axios from "axios"

import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
// Remove Anthropic conversion imports
// import { convertToOpenAiMessages } from "../transform/openai-format"
// import { convertToR1Format } from "../transform/r1-format"
import { ApiStream } from "../transform/stream"
import { DEEP_SEEK_DEFAULT_TEMPERATURE } from "./constants"
import { XmlMatcher } from "../../utils/xml-matcher"
import { BaseProvider } from "./base-provider"

// Define a neutral message type (can be moved to a shared types file later)
export type NeutralMessage = {
	role: "user" | "assistant"
	content: string // Assuming text content for now, matching current Ollama handler capability
}

export class OllamaHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: (this.options.ollamaBaseUrl || "http://localhost:11434") + "/v1",
			apiKey: "ollama", // Ollama uses a dummy key via OpenAI client
		})
	}

	// Updated signature to use NeutralMessage[]
	override async *createMessage(systemPrompt: string, messages: NeutralMessage[]): ApiStream {
		// Construct openAiMessages directly
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

		if (systemPrompt && systemPrompt.trim() !== "") {
			openAiMessages.push({ role: "system", content: systemPrompt })
		}

		// Map neutral messages directly to OpenAI format
		messages.forEach((msg) => {
			// Basic mapping, assuming text content only for now
			openAiMessages.push({ role: msg.role, content: msg.content })
		})

		// Note: Removed useR1Format logic as it was tied to the Anthropic conversion

		const stream = await this.client.chat.completions.create({
			model: this.getModel().id,
			messages: openAiMessages, // Use the directly constructed messages
			temperature: this.options.modelTemperature ?? 0, // Keep default temperature
			stream: true,
		})

		// --- Streaming and XML matching logic remains the same ---
		const matcher = new XmlMatcher(
			"think",
			(chunk) =>
				({
					type: chunk.matched ? "reasoning" : "text",
					text: chunk.data,
				}) as const,
		)
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				for (const chunk of matcher.update(delta.content)) {
					yield chunk
				}
			}
		}
		for (const chunk of matcher.final()) {
			yield chunk
		}
		// --- End of streaming logic ---
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.ollamaModelId || "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	// completePrompt already uses a simple user message, no major change needed here
	// unless we want to align its input type too, but it's less critical.
	async completePrompt(prompt: string): Promise<string> {
		try {
			// Removed useR1Format logic here too for consistency
			const response = await this.client.chat.completions.create({
				model: this.getModel().id,
				messages: [{ role: "user", content: prompt }], // Simple user message
				temperature: this.options.modelTemperature ?? 0, // Keep default temperature
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
export async function getOllamaModels(baseUrl = "http://localhost:11434") {
	try {
		if (!URL.canParse(baseUrl)) {
			return []
		}

		const response = await axios.get(`${baseUrl}/api/tags`)
		const modelsArray = response.data?.models?.map((model: any) => model.name) || []
		return [...new Set<string>(modelsArray)]
	} catch (error) {
		return []
	}
}
