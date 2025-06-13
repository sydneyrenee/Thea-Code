// src/services/mcp/types/McpToolTypes.ts

/**
 * Interface for tool use request in a neutral format
 */
export interface NeutralToolUseRequest {
	type: "tool_use"
	id: string
	name: string
	input: Record<string, unknown>
}

/**
 * Interface for tool result in a neutral format
 */
export interface NeutralToolResult {
	type: "tool_result"
	tool_use_id: string
	content: Array<{
		type: string
		text?: string
		[key: string]: unknown
	}>
	status: "success" | "error"
	error?: {
		message: string
		details?: unknown
	}
}

/**
 * Enum for supported tool use formats
 */
export enum ToolUseFormat {
	XML = "xml",
	JSON = "json",
	OPENAI = "openai",
	NEUTRAL = "neutral",
}

/**
 * Interface for tool use request with format information
 */
export interface ToolUseRequestWithFormat {
	format: ToolUseFormat
	content: string | Record<string, unknown>
}

/**
 * Interface for tool result with format information
 */
export interface ToolResultWithFormat {
	format: ToolUseFormat
	content: string | Record<string, unknown>
}
