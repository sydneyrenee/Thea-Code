import { Anthropic } from "@anthropic-ai/sdk"
import { McpIntegration, handleToolUse } from '../../services/mcp/integration/McpIntegration';
import { ApiHandler } from ".."
import { ModelInfo } from "../../shared/api"
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"; // Import neutral history types
import { ApiStream } from "../transform/stream"
import { Tiktoken } from "js-tiktoken/lite"
import o200kBase from "js-tiktoken/ranks/o200k_base"

// Reuse the fudge factor used in the original code
const TOKEN_FUDGE_FACTOR = 1.5

/**
 * Base class for API providers that implements common functionality
 */
export abstract class BaseProvider implements ApiHandler {
	protected mcpIntegration: McpIntegration;
	// Cache the Tiktoken encoder instance since it's stateless
	private encoder: Tiktoken | null = null
	// Updated to accept NeutralConversationHistory
	abstract createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream
	abstract getModel(): { id: string; info: ModelInfo }

	constructor() {
		// Get the MCP integration singleton instance
		this.mcpIntegration = McpIntegration.getInstance();
		
		// Initialize MCP integration
		this.mcpIntegration.initialize();

		// Register tools
		this.registerTools();
	}

	/**
	 * Default token counting implementation using tiktoken
	 * Providers can override this to use their native token counting endpoints
	 *
	 * Uses a cached Tiktoken encoder instance for performance since it's stateless.
	 * The encoder is created lazily on first use and reused for subsequent calls.
	 *
	 * @param content The content to count tokens for (using NeutralMessageContent)
	 * @returns A promise resolving to the token count
	 */
	// Updated to accept NeutralMessageContent
	async countTokens(content: NeutralMessageContent): Promise<number> {
		// Note: This default implementation only handles text content for simplicity.
		// Providers that support image or other block types should override this method.
		if (typeof content === 'string') {
			// If content is a string, count tokens for the string
			if (!this.encoder) {
				this.encoder = new Tiktoken(o200kBase);
			}
			return Math.ceil(this.encoder.encode(content).length * TOKEN_FUDGE_FACTOR);
		} else if (Array.isArray(content)) {
			// If content is an array of blocks, sum tokens for text blocks
			let totalTokens = 0;
			if (!this.encoder) {
				this.encoder = new Tiktoken(o200kBase);
			}
			for (const block of content) {
				if (block.type === 'text') {
					const text = block.text || '';
					if (text.length > 0) {
						const tokens = this.encoder.encode(text);
						totalTokens += tokens.length;
					}
				}
				// Image, tool_use, and tool_result blocks are not handled by the default implementation.
				// Providers should override countTokens to handle these if necessary.
			}
			return Math.ceil(totalTokens * TOKEN_FUDGE_FACTOR);
		}
		return 0; // Return 0 for unexpected content types
	}

	protected registerTools(): void {
		// Register common tools
		// Specific tools will be registered by individual providers
	}

	protected async processToolUse(content: string | Record<string, unknown>): Promise<string> {
		// Process tool use using MCP integration
		const result = await this.mcpIntegration.routeToolUse(content);
		// Ensure we return a string
		return typeof result === 'string' ? result : JSON.stringify(result);
	}
}
