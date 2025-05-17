export type ApiStream = AsyncGenerator<ApiStreamChunk>
export type ApiStreamChunk = ApiStreamTextChunk | ApiStreamUsageChunk | ApiStreamReasoningChunk | ApiStreamToolUseChunk | ApiStreamToolResultChunk

export interface ApiStreamTextChunk {
	type: "text"
	text: string
}

export interface ApiStreamReasoningChunk {
	type: "reasoning"
	text: string
}

export interface ApiStreamUsageChunk {
	type: "usage"
	inputTokens: number
	outputTokens: number
	cacheWriteTokens?: number
	cacheReadTokens?: number
	totalCost?: number // openrouter
}

export interface ApiStreamToolUseChunk {
	type: "tool_use"
	id: string
	name: string
	input: unknown
}

export interface ApiStreamToolResultChunk {
	type: "tool_result"
	id?: string
	content: string
}
