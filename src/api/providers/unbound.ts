import { Anthropic } from "@anthropic-ai/sdk";
import axios from "axios";
import OpenAI from "openai";
import * as vscode from 'vscode';

import { ApiHandlerOptions, ModelInfo, unboundDefaultModelId, unboundDefaultModelInfo } from "../../shared/api";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream";
import { SingleCompletionHandler } from "../";
import { BaseProvider } from "./base-provider";
// TODO: Update this path if the generated file is elsewhere relative to src/api/providers
import { EXTENSION_NAME } from "../../../dist/thea-config"; // Import from generated config

interface UnboundUsage extends OpenAI.CompletionUsage {
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}

export class UnboundHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions;
	private client: OpenAI;

	constructor(options: ApiHandlerOptions) {
		super();
		this.options = options;
		const baseURL = "https://api.getunbound.ai/v1";
		const apiKey = this.options.unboundApiKey ?? "not-provided";
		this.client = new OpenAI({ baseURL, apiKey });
	}

	private supportsTemperature(): boolean {
		return !this.getModel().id.startsWith("openai/o3-mini");
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		// Convert Anthropic messages to OpenAI format
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		];

		// this is specifically for claude models (some models may 'support prompt caching' automatically without this)
		if (this.getModel().id.startsWith("anthropic/claude-3")) {
			openAiMessages[0] = {
				role: "system",
				content: [
					{
						type: "text",
						text: systemPrompt,
						// @ts-ignore-next-line
						cache_control: { type: "ephemeral" },
					},
				],
			};

			const lastTwoUserMessages = openAiMessages.filter((msg) => msg.role === "user").slice(-2);
			lastTwoUserMessages.forEach((msg) => {
				if (typeof msg.content === "string") {
					msg.content = [{ type: "text", text: msg.content }];
				}
				if (Array.isArray(msg.content)) {
					let lastTextPart = msg.content.filter((part) => part.type === "text").pop();

					if (!lastTextPart) {
						lastTextPart = { type: "text", text: "..." };
						msg.content.push(lastTextPart);
					}
					// @ts-ignore-next-line
					lastTextPart["cache_control"] = { type: "ephemeral" };
				}
			});
		}

		let maxTokens: number | undefined;
		if (this.getModel().id.startsWith("anthropic/")) {
			maxTokens = this.getModel().info.maxTokens;
		}

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: this.getModel().id.split("/")[1], // Unbound uses model name without provider prefix
			max_tokens: maxTokens,
			messages: openAiMessages,
			stream: true,
		};

		if (this.supportsTemperature()) {
			requestOptions.temperature = this.options.modelTemperature ?? 0;
		}

		const { data: completion, response } = await this.client.chat.completions
			.create(requestOptions, {
				headers: {
					"X-Unbound-Metadata": JSON.stringify({
						labels: [
							{
								key: "app",
								value: EXTENSION_NAME, // Use constant
							},
						],
					}),
				},
			})
			.withResponse();

		for await (const chunk of completion) {
			const delta = chunk.choices[0]?.delta;
			const usage = chunk.usage as UnboundUsage;

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				};
			}

			if (usage) {
				const usageData: ApiStreamUsageChunk = {
					type: "usage",
					inputTokens: usage.prompt_tokens || 0,
					outputTokens: usage.completion_tokens || 0,
				};
				if (usage.cache_creation_input_tokens) {
					usageData.cacheWriteTokens = usage.cache_creation_input_tokens;
				}
				if (usage.cache_read_input_tokens) {
					usageData.cacheReadTokens = usage.cache_read_input_tokens;
				}
				yield usageData;
			}
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.unboundModelId;
		const modelInfo = this.options.unboundModelInfo;
		if (modelId && modelInfo) {
			return { id: modelId, info: modelInfo };
		}
		return {
			id: unboundDefaultModelId,
			info: unboundDefaultModelInfo,
		};
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: this.getModel().id.split("/")[1], // Unbound uses model name without provider prefix
				messages: [{ role: "user", content: prompt }],
			};

			if (this.supportsTemperature()) {
				requestOptions.temperature = this.options.modelTemperature ?? 0;
			}

			if (this.getModel().id.startsWith("anthropic/")) {
				requestOptions.max_tokens = this.getModel().info.maxTokens;
			}

			const response = await this.client.chat.completions.create(requestOptions, {
				headers: {
					"X-Unbound-Metadata": JSON.stringify({
						labels: [
							{
								key: "app",
								value: EXTENSION_NAME, // Use constant
							},
						],
					}),
				},
			});
			return response.choices[0]?.message.content || "";
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Unbound completion error: ${error.message}`);
			}
			throw error;
		}
	}
}

import { createSafeModelFetcher } from './apiProviderUtils';

export const getUnboundModels = (outputChannel: vscode.OutputChannel) => {
    const fetchUnboundModels = async () => {
        // Stub implementation
        return [];
    };
    
    return createSafeModelFetcher('Unbound', fetchUnboundModels, outputChannel)();
};
