import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import axios from "axios"
import * as vscode from 'vscode';
import { createSafeModelFetcher } from './apiProviderUtils';

import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { convertToR1Format } from "../transform/r1-format"
import { ApiStream } from "../transform/stream"
import { DEEP_SEEK_DEFAULT_TEMPERATURE } from "./constants"
import { XmlMatcher } from "../../utils/xml-matcher"
import { BaseProvider } from "./base-provider"
import { handleProviderError } from './apiProviderUtils';

/**
 * Fetches available models from the local Ollama instance
 * @param outputChannel VS Code output channel for logging
 * @returns Record of model IDs to their info objects
 */
export async function getOllamaModels(outputChannel: vscode.OutputChannel): Promise<Record<string, ModelInfo>> {
    const models: Record<string, ModelInfo> = {};
    const baseUrl = "http://localhost:11434"; // Default Ollama URL
    
    try {
        outputChannel.appendLine("Fetching models from Ollama...");
        const response = await axios.get(`${baseUrl}/api/tags`);
        
        if (response.data && Array.isArray(response.data.models)) {
            for (const model of response.data.models) {
                models[model.name] = {
                    maxTokens: model.details?.parameter_size ? parseInt(model.details.parameter_size) * 1024 : 4096,
                    contextWindow: model.details?.context_length || 8192,
                    supportsImages: Boolean(model.details?.modality?.includes("vision")),
                    supportsPromptCache: false,
                    inputPrice: 0, // Local models have no direct cost
                    outputPrice: 0,
                    description: `Ollama ${model.name}${model.details?.family ? ` (${model.details.family})` : ''}`,
                };
            }
        }
        
        outputChannel.appendLine(`Successfully fetched ${Object.keys(models).length} models from Ollama`);
        return models;
    } catch (error) {
        await handleProviderError(outputChannel, "Ollama", error, "model fetch error");
        // Return empty object as Ollama is optional
        return {};
    }
}

export class OllamaHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: (this.options.ollamaBaseUrl || "http://localhost:11434") + "/v1",
			apiKey: "ollama",
		})
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const modelId = this.getModel().id
		const useR1Format = modelId.toLowerCase().includes("deepseek-r1")
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...(useR1Format ? convertToR1Format(messages) : convertToOpenAiMessages(messages)),
		]

		const stream = await this.client.chat.completions.create({
			model: this.getModel().id,
			messages: openAiMessages,
			temperature: this.options.modelTemperature ?? 0,
			stream: true,
		})
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
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.ollamaModelId || "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const modelId = this.getModel().id
			const useR1Format = modelId.toLowerCase().includes("deepseek-r1")
			const response = await this.client.chat.completions.create({
				model: this.getModel().id,
				messages: useR1Format
					? convertToR1Format([{ role: "user", content: prompt }])
					: [{ role: "user", content: prompt }],
				temperature: this.options.modelTemperature ?? (useR1Format ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
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
