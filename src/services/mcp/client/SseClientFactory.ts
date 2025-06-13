import { McpClient, McpClientInfo } from "./McpClient"
// Import types for the MCP SDK
import type { Client as SdkClient } from "@modelcontextprotocol/sdk/client/index.js"
import type { SSEClientTransport as SdkSseTransport } from "@modelcontextprotocol/sdk/client/sse.js"

/**
 * Minimal mock implementation of the MCP client used when the SDK is absent.
 */
class MockClient extends McpClient {
	constructor(info: McpClientInfo) {
		super(info)
	}

	async connect(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		transport: unknown,
	): Promise<void> {
		// Parameter is required by interface but not used in this implementation
		return Promise.resolve()
	}

	async close(): Promise<void> {
		return Promise.resolve()
	}

	// Non-async methods since they don't use await
	listTools(): Promise<unknown> {
		return Promise.resolve({ tools: [] })
	}

	callTool(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		params: Record<string, unknown>,
	): Promise<unknown> {
		// Parameter is required by interface but not used in this implementation
		return Promise.resolve({ content: [] })
	}
}

/**
 * Factory for creating MCP clients that connect to an SSE server
 */
export class SseClientFactory {
	/**
	 * Create a new MCP client that connects to the specified server URL
	 */
	public static async createClient(serverUrl: URL): Promise<McpClient> {
		try {
			// Dynamic imports to handle cases where the SDK might not be available
			const { Client } = (await import("@modelcontextprotocol/sdk/client/index.js")) as {
				Client: typeof SdkClient
			}
			const { SSEClientTransport } = (await import("@modelcontextprotocol/sdk/client/sse.js")) as {
				SSEClientTransport: typeof SdkSseTransport
			}

			class SdkClientWrapper extends McpClient {
				private client: SdkClient

				constructor(info: McpClientInfo) {
					super(info)
					this.client = new Client(info)
				}

				async connect(transport: unknown): Promise<void> {
					await this.client.connect(transport)
				}

				async close(): Promise<void> {
					await this.client.close()
				}

				async listTools(): Promise<unknown> {
					return this.client.listTools()
				}

				async callTool(params: Record<string, unknown>): Promise<unknown> {
					return this.client.callTool(params)
				}
			}

			const transport = new SSEClientTransport(serverUrl)
			const client = new SdkClientWrapper({ name: "TheaCodeMcpClient", version: "1.0.0" })
			await client.connect(transport)
			return client
		} catch (err) {
			// Log the error but continue with mock client
			console.warn("MCP SDK not found, using mock client", err instanceof Error ? err.message : String(err))
			const client = new MockClient({ name: "TheaCodeMcpClient", version: "1.0.0" })
			await client.connect(undefined)
			return client
		}
	}
}
