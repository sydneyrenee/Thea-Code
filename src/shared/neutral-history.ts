// Represents a single block of content within a message
interface NeutralContentBlock {
	type: "text" | "image" | "image_url" | "image_base64" | "tool_use" | "tool_result"
	// Add a unique ID for tool_use blocks to link them to tool_result blocks
	id?: string // Optional ID for tool_use blocks
}

// Represents a block of text content
interface NeutralTextContentBlock extends NeutralContentBlock {
	type: "text"
	text: string
}

// Represents a block of image content
interface NeutralImageContentBlock extends NeutralContentBlock {
	type: "image" | "image_url" | "image_base64"
	source:
		| {
				type: "base64"
				media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
				data: string
		  }
		| {
				type: "image_url"
				url: string
		  }
}

// Represents an AI's request to use a tool
interface NeutralToolUseContentBlock extends NeutralContentBlock {
	type: "tool_use"
	id: string // Unique ID for this tool call instance
	name: string // The name of the tool requested
	// Store parameters as a structured object, not just a JSON string
	input: Record<string, unknown> // The parameters for the tool call
}

// Represents the result of a tool execution
interface NeutralToolResultContentBlock extends NeutralContentBlock {
	type: "tool_result"
	tool_use_id: string // The ID of the tool_use block this result corresponds to
	// Content can be text, images, or a mix, similar to message content
	content: Array<NeutralTextContentBlock | NeutralImageContentBlock> // Result content
	// Optionally include a status (success/error) if the tool execution had one
	status?: "success" | "error"
	// Optionally include error details if status is 'error';
	error?: {
		message: string
		details?: unknown
	}
}

// A message's content can be a mix of different block types
type NeutralMessageContent = Array<
	NeutralTextContentBlock | NeutralImageContentBlock | NeutralToolUseContentBlock | NeutralToolResultContentBlock
>

// Represents a single message in the conversation history
interface NeutralMessage {
	role: "user" | "assistant" | "system" | "tool" // Standard roles
	// Content can be a simple string or structured blocks
	content: string | NeutralMessageContent
	// Optional timestamp for history tracking
	ts?: number
	// Optional metadata (e.g., for UI display, not sent to AI)
	metadata?: Record<string, unknown>
}

// The complete conversation history
type NeutralConversationHistory = NeutralMessage[]

// Export the types for use in other files
export type {
	NeutralContentBlock,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
	NeutralMessageContent,
	NeutralMessage,
	NeutralConversationHistory,
}
