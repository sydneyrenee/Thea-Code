import { McpClient, McpClientInfo } from "./McpClient"

/**
 * Minimal mock implementation of the MCP client used when the SDK is absent.
 */
class MockClient extends McpClient {
	constructor(info: McpClientInfo) {
		super(info)
	}

	async connect(_transport: unknown): Promise<void> {
		return Promise.resolve()
	}

	async close(): Promise<void> {
		return Promise.resolve()
	}

	async listTools(): Promise<unknown> {
		return { tools: [] }
	}

	async callTool(_params: Record<string, unknown>): Promise<unknown> {
		return { content: [] }
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
			const { Client } = require("@modelcontextprotocol/sdk/client")
			const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse")

			class SdkClientWrapper extends McpClient {
				private client: any

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
		} catch (error) {
			console.warn("MCP SDK not found, using mock client")
			const client = new MockClient({ name: "TheaCodeMcpClient", version: "1.0.0" })
			await client.connect(undefined)
			return client
		}
	}
}
