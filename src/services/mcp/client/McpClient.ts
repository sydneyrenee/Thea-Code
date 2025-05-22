export interface McpClientInfo {
	name: string;
	version: string
}

/**
 * Abstract base class for MCP clients.
 * Concrete implementations wrap the MCP SDK client or a mock implementation.
 */
export abstract class McpClient {
	constructor(protected clientInfo: McpClientInfo) {}

	/** Connect the client using the provided transport. */
	abstract connect(transport: unknown): Promise<void>

	/** Close the client connection and clean up resources. */
	abstract close(): Promise<void>

	/** List tools available from the server. */
	abstract listTools(): Promise<unknown>

	/** Call a tool using the MCP protocol. */
	abstract callTool(params: Record<string, unknown>): Promise<unknown>
}
