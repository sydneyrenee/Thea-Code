import { McpIntegration } from '../../services/mcp/integration/McpIntegration';
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
		void this.mcpIntegration.initialize();

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
	countTokens(content: NeutralMessageContent): Promise<number> {
		// Note: This default implementation only handles text content for simplicity.
		// Providers that support image or other block types should override this method.
		if (typeof content === 'string') {
			// If content is a string, count tokens for the string
			if (!this.encoder) {
				this.encoder = new Tiktoken(o200kBase);
			}
			return Promise.resolve(Math.ceil(this.encoder.encode(content).length * TOKEN_FUDGE_FACTOR));
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
			return Promise.resolve(Math.ceil(totalTokens * TOKEN_FUDGE_FACTOR));
		}
		return Promise.resolve(0); // Return 0 for unexpected content types
	}

        protected registerTools(): void {
                // Register common tools with basic parameter schemas. The actual
                // execution for these tools is handled by the MCP provider.

                this.mcpIntegration.registerTool({
                        name: 'read_file',
                        description: 'Read the contents of a file',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: {
                                                type: 'string',
                                                description: 'Relative path to the file'
                                        },
                                        start_line: {
                                                type: 'integer',
                                                description: 'Optional starting line (1-based)'
                                        },
                                        end_line: {
                                                type: 'integer',
                                                description: 'Optional ending line (1-based, inclusive)'
                                        }
                                },
                                required: ['path']
                        },
                        handler: () => {
                                throw new Error('read_file execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'write_to_file',
                        description: 'Write full content to a file',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: { type: 'string', description: 'Relative path to write' },
                                        content: { type: 'string', description: 'Content to write' },
                                        line_count: { type: 'integer', description: 'Number of lines in the file' }
                                },
                                required: ['path', 'content', 'line_count']
                        },
                        handler: () => {
                                throw new Error('write_to_file execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'list_files',
                        description: 'List files in a directory',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: { type: 'string', description: 'Directory path' },
                                        recursive: { type: 'boolean', description: 'List recursively' }
                                },
                                required: ['path']
                        },
                        handler: () => {
                                throw new Error('list_files execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'search_files',
                        description: 'Search files using a regular expression',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: { type: 'string', description: 'Directory path' },
                                        regex: { type: 'string', description: 'Regular expression to search' },
                                        file_pattern: { type: 'string', description: 'Optional glob to filter files' }
                                },
                                required: ['path', 'regex']
                        },
                        handler: () => {
                                throw new Error('search_files execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'apply_diff',
                        description: 'Apply a unified diff to a file',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: { type: 'string', description: 'File path to apply the diff to' },
                                        diff: { type: 'string', description: 'Unified diff content' }
                                },
                                required: ['path', 'diff']
                        },
                        handler: () => {
                                throw new Error('apply_diff execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'insert_content',
                        description: 'Insert content into a file using operations',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: { type: 'string', description: 'File path' },
                                        operations: { type: 'string', description: 'Operations to perform' }
                                },
                                required: ['path', 'operations']
                        },
                        handler: () => {
                                throw new Error('insert_content execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'search_and_replace',
                        description: 'Search and replace content in a file',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        path: { type: 'string', description: 'File path' },
                                        operations: { type: 'string', description: 'Replace operations' }
                                },
                                required: ['path', 'operations']
                        },
                        handler: () => {
                                throw new Error('search_and_replace execution handled by MCP provider');
                        }
                });

                this.mcpIntegration.registerTool({
                        name: 'ask_followup_question',
                        description: 'Request additional information from the user',
                        paramSchema: {
                                type: 'object',
                                properties: {
                                        question: { type: 'string', description: 'Question to ask' },
                                        follow_up: { type: 'string', description: 'Optional follow up suggestion' }
                                },
                                required: ['question']
                        },
                        handler: () => {
                                throw new Error('ask_followup_question execution handled by MCP provider');
                        }
                });

                // Specific tools will be registered by individual providers as needed
        }

        protected async processToolUse(content: string | Record<string, unknown>): Promise<string | Record<string, unknown>> {
                // Delegate tool use processing to the MCP integration. The returned
                // value may be a string or structured object depending on the
                // format detected.
                return this.mcpIntegration.routeToolUse(content);
        }
}
