import OpenAI from "openai"
import { SingleCompletionHandler } from "../"
import {
	ApiHandlerOptions,
	ModelInfo,
	openAiNativeDefaultModelId,
	OpenAiNativeModelId,
	openAiNativeModels,
} from "../../shared/api"
import type { NeutralConversationHistory } from "../../shared/neutral-history"
import { ApiStream } from "../transform/stream"
import { OpenAiCompatibleHandler } from "./openai-compatible-base"
import { defaultHeaders } from "./openai"
import { supportsTemperature, getReasoningEffort } from "../../utils/model-capabilities"
import { isThinkingModel, isO3MiniModel } from "../../utils/model-pattern-detection"
import { ToolCallAggregator } from "./shared/tool-use"

export class OpenAiNativeHandler extends OpenAiCompatibleHandler implements SingleCompletionHandler {
	private nativeClient: OpenAI

	constructor(options: ApiHandlerOptions) {
		// Check for environment variable override for base URL (used in tests)
		const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
		
		super(options, {
			apiKey: options.openAiNativeApiKey ?? "not-provided",
			baseUrl,
			modelId: options.apiModelId ?? openAiNativeDefaultModelId,
			includeMaxTokens: false,
			streamingEnabled: true,
		})
		this.nativeClient = new OpenAI({
			baseURL: baseUrl,
			apiKey: options.openAiNativeApiKey ?? "not-provided",
			defaultHeaders,
		})
	}

	override getModel(): { id: string; info: ModelInfo } {
		return this.getProviderModelInfo()
	}

	protected getProviderModelInfo(): { id: string; info: ModelInfo } {
		const modelId = (this.options.apiModelId ?? openAiNativeDefaultModelId) as OpenAiNativeModelId
		const modelInfo = openAiNativeModels[modelId] || openAiNativeModels[openAiNativeDefaultModelId]

		return {
			id: modelId,
			info: modelInfo,
		}
	}

	override async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		const modelId = this.options.apiModelId ?? openAiNativeDefaultModelId
		const modelInfo = this.getModel().info

		// Use capability detection instead of hardcoded model checks
		const isReasoningModel = isThinkingModel(modelId)
		const isO3 = isO3MiniModel(modelId)
		const supportsTemp = supportsTemperature(modelInfo)
		const reasoningEffort = getReasoningEffort(modelInfo)

		let chatMessages: OpenAI.Chat.ChatCompletionMessageParam[]
		if (isReasoningModel) {
			// Reasoning models use developer role instead of system
			chatMessages = [
				{ role: "developer", content: `Formatting re-enabled\n${systemPrompt}` },
				...messages.map((m) => ({ role: m.role as "user" | "assistant", content: typeof m.content === "string" ? m.content : "Hello!" })),
			]
		} else {
			chatMessages = [
				{ role: "system", content: systemPrompt },
				...messages.map((m) => ({ role: m.role as "user" | "assistant", content: typeof m.content === "string" ? m.content : "[Complex content]" })),
			]
		}

		const baseParams: Record<string, unknown> = {
			model: isO3 ? "o3-mini" : modelId,
			messages: chatMessages,
			stream: true,
			stream_options: { include_usage: true },
		}
		
		// Only include temperature if the model supports it
		if (supportsTemp && !isReasoningModel) {
			baseParams["temperature"] = this.options.modelTemperature ?? 0
		}
		
		// Include reasoning_effort if the model has it configured
		if (reasoningEffort) {
			baseParams["reasoning_effort"] = reasoningEffort
		}

		let stream
		try {
			stream = await this.nativeClient.chat.completions.create((baseParams as unknown) as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			throw new Error(message)
		}

		const agg = new ToolCallAggregator()

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			
			// Emit completed tool calls as soon as they parse
			for (const c of agg.addFromDelta(delta)) {
				yield { type: "tool_use" as const, id: c.id, name: c.name, input: c.argString }
			}
			
			// Existing text handling
			if (delta && typeof delta.content !== "undefined" && delta.content !== null) {
				yield { type: "text" as const, text: delta.content }
			}
			
			if (chunk.usage) {
				yield {
					type: "usage" as const,
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}

		// Flush any remaining aggregated tool calls
		for (const c of agg.finalize()) {
			if (c.argString) {
				yield { type: "tool_use" as const, id: c.id, name: c.name, input: c.argString }
			}
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const modelId = this.options.apiModelId ?? openAiNativeDefaultModelId
		const modelInfo = this.getModel().info
		
		// Use capability detection
		const isReasoningModel = isThinkingModel(modelId)
		const isO3 = isO3MiniModel(modelId)
		const supportsTemp = supportsTemperature(modelInfo)
		const reasoningEffort = getReasoningEffort(modelInfo)

		const params: Record<string, unknown> = {
			model: isO3 ? "o3-mini" : modelId,
			messages: [{ role: "user", content: prompt }],
		}
		
		// Only include temperature if the model supports it
		if (supportsTemp && !isReasoningModel) {
			params["temperature"] = this.options.modelTemperature ?? 0
		}
		
		// Include reasoning_effort if the model has it configured
		if (reasoningEffort) {
			params["reasoning_effort"] = reasoningEffort
		}

		try {
			const response = await this.nativeClient.chat.completions.create(
				(params as unknown) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
			)
			return response.choices?.[0]?.message?.content ?? ""
		} catch (error) {
			throw new Error(`OpenAI Native completion error: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}
