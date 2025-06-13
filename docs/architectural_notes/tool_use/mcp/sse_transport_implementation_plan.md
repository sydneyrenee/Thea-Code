# Implementation Plan: Switching from StdioTransport to SSETransport

**Date:** 2025-05-05

## 1. Overview

This document outlines the changes needed to modify the MCP integration in Thea Code to use SSETransport instead of StdioTransport. This change will provide:

- **Thread Safety**: The SSE transport uses proper HTTP request handling, ensuring thread-safe operations
- **Resource Safety**: Connections are properly managed with clear lifecycle events
- **Multiple Simultaneous Connections**: The server can now handle multiple clients connecting at once
- **Improved Observability**: HTTP-based communication provides better logging and monitoring options
- **Error Resilience**: Better error handling and recovery mechanisms

## 2. Required Code Changes

### 2.1 Create an SSE Transport Configuration Class

```typescript
// src/services/mcp/config/SseTransportConfig.ts

/**
 * Configuration options for the SSE transport
 */
export interface SseTransportConfig {
	/**
	 * The port to listen on (default: 0 for random available port)
	 */
	port?: number

	/**
	 * The hostname to bind to (default: localhost)
	 */
	hostname?: string

	/**
	 * Whether to allow connections from other hosts (default: false)
	 */
	allowExternalConnections?: boolean

	/**
	 * The path to serve the SSE endpoint on (default: /mcp/events)
	 */
	eventsPath?: string

	/**
	 * The path to accept POST requests on (default: /mcp/api)
	 */
	apiPath?: string
}

/**
 * Default configuration for the SSE transport
 */
export const DEFAULT_SSE_CONFIG: SseTransportConfig = {
	port: 0, // Use a random available port
	hostname: "localhost",
	allowExternalConnections: false,
	eventsPath: "/mcp/events",
	apiPath: "/mcp/api",
}
```

### 2.2 Modify EmbeddedMcpProvider to Use SSETransport

```typescript
// src/services/mcp/EmbeddedMcpProvider.ts

// Add imports
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig"

export class EmbeddedMcpProvider extends EventEmitter {
	// Add new properties
	private sseConfig: SseTransportConfig
	private serverUrl?: URL

	/**
	 * Create a new embedded MCP server
	 * @param config Optional SSE transport configuration
	 */
	constructor(config?: SseTransportConfig) {
		super()

		this.sseConfig = { ...DEFAULT_SSE_CONFIG, ...config }

		try {
			// Try to import the MCP SDK dynamically
			const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js")
			this.server = new McpServer({
				name: "EmbeddedMcpProvider",
				version: "1.0.0",
			})
		} catch (error) {
			// If the MCP SDK is not installed, use the mock implementation
			console.warn("MCP SDK not found, using mock implementation")
			this.server = new MockMcpServer({
				name: "EmbeddedMcpProvider",
				version: "1.0.0",
			})
		}
	}

	/**
	 * Start the embedded MCP server
	 */
	async start(): Promise<void> {
		if (this.isStarted) {
			return
		}

		// Register all handlers
		this.registerHandlers()

		try {
			// Try to import the MCP SDK dynamically
			if (this.sseConfig.allowExternalConnections) {
				// Use SSE transport for external connections
				const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js")
				this.transport = new SSEServerTransport({
					port: this.sseConfig.port,
					hostname: this.sseConfig.hostname,
					cors: { origin: "*" },
					eventsPath: this.sseConfig.eventsPath,
					apiPath: this.sseConfig.apiPath,
				})
			} else {
				// Use SSE transport for localhost only
				const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js")
				this.transport = new SSEServerTransport({
					port: this.sseConfig.port,
					hostname: this.sseConfig.hostname,
					cors: { origin: "localhost" },
					eventsPath: this.sseConfig.eventsPath,
					apiPath: this.sseConfig.apiPath,
				})
			}

			// Connect the server to the transport
			await this.server.connect(this.transport)

			// Store the server URL for clients to connect to
			const port = this.transport.getPort()
			this.serverUrl = new URL(`http://${this.sseConfig.hostname}:${port}`)

			this.isStarted = true
			this.emit("started", { url: this.serverUrl.toString() })
			console.log(`MCP server started at ${this.serverUrl.toString()}`)
		} catch (error) {
			console.error("Failed to start MCP server:", error)

			// Fall back to mock transport in case of error
			this.transport = new MockSseServerTransport()
			this.serverUrl = new URL(`http://localhost:0`)
			this.isStarted = true
			this.emit("started", { url: this.serverUrl.toString() })
		}
	}

	/**
	 * Stop the embedded MCP server
	 */
	async stop(): Promise<void> {
		if (!this.isStarted) {
			return
		}

		try {
			// Close the server connection
			if (this.transport && typeof this.transport.close === "function") {
				await this.transport.close()
			}
		} catch (error) {
			console.error("Error stopping MCP server:", error)
		} finally {
			// Clean up resources
			this.transport = undefined
			this.serverUrl = undefined
			this.isStarted = false
			this.emit("stopped")
		}
	}

	/**
	 * Get the URL of the running MCP server
	 * @returns The URL of the server, or undefined if not started
	 */
	getServerUrl(): URL | undefined {
		return this.serverUrl
	}

	// Rest of the class remains the same
}

// Add mock implementation for SSE transport
class MockSseServerTransport {
	constructor() {}

	getPort(): number {
		return 0
	}

	close(): Promise<void> {
		return Promise.resolve()
	}
}
```

### 2.3 Update McpToolExecutor to Pass Configuration

```typescript
// src/services/mcp/McpToolExecutor.ts

// Add imports
import { SseTransportConfig } from "./config/SseTransportConfig"

export class McpToolExecutor extends EventEmitter {
	// Add new property
	private sseConfig?: SseTransportConfig

	/**
	 * Get the singleton instance of the McpToolExecutor
	 * @param config Optional SSE transport configuration
	 */
	public static getInstance(config?: SseTransportConfig): McpToolExecutor {
		if (!McpToolExecutor.instance) {
			McpToolExecutor.instance = new McpToolExecutor(config)
		} else if (config) {
			// Update config if provided
			McpToolExecutor.instance.sseConfig = config
		}
		return McpToolExecutor.instance
	}

	/**
	 * Private constructor to enforce singleton pattern
	 * @param config Optional SSE transport configuration
	 */
	private constructor(config?: SseTransportConfig) {
		super()
		this.sseConfig = config
		this.mcpServer = new EmbeddedMcpProvider(config)
		this.toolRegistry = McpToolRegistry.getInstance()

		// Forward events from the MCP server
		this.mcpServer.on("tool-registered", (name) => this.emit("tool-registered", name))
		this.mcpServer.on("tool-unregistered", (name) => this.emit("tool-unregistered", name))
		this.mcpServer.on("started", (info) => this.emit("started", info))
		this.mcpServer.on("stopped", () => this.emit("stopped"))
	}

	/**
	 * Get the server URL if the MCP server is running
	 * @returns The URL of the server, or undefined if not started
	 */
	public getServerUrl(): URL | undefined {
		return this.mcpServer.getServerUrl()
	}

	// Rest of the class remains the same
}
```

### 2.4 Update McpToolRouter to Pass Configuration

```typescript
// src/services/mcp/McpToolRouter.ts

// Add imports
import { SseTransportConfig } from "./config/SseTransportConfig"

export class McpToolRouter extends EventEmitter {
	// Add new property
	private sseConfig?: SseTransportConfig

	/**
	 * Get the singleton instance of the McpToolRouter
	 * @param config Optional SSE transport configuration
	 */
	public static getInstance(config?: SseTransportConfig): McpToolRouter {
		if (!McpToolRouter.instance) {
			McpToolRouter.instance = new McpToolRouter(config)
		} else if (config) {
			// Update config if provided
			McpToolRouter.instance.sseConfig = config
		}
		return McpToolRouter.instance
	}

	/**
	 * Private constructor to enforce singleton pattern
	 * @param config Optional SSE transport configuration
	 */
	private constructor(config?: SseTransportConfig) {
		super()
		this.sseConfig = config
		this.mcpToolSystem = McpToolExecutor.getInstance(config)

		// Forward events from the MCP tool system
		this.mcpToolSystem.on("tool-registered", (name) => this.emit("tool-registered", name))
		this.mcpToolSystem.on("tool-unregistered", (name) => this.emit("tool-unregistered", name))
		this.mcpToolSystem.on("started", (info) => this.emit("started", info))
		this.mcpToolSystem.on("stopped", () => this.emit("stopped"))
	}

	// Rest of the class remains the same
}
```

### 2.5 Update McpIntegration to Pass Configuration

```typescript
// src/services/mcp/McpIntegration.ts

// Add imports
import { SseTransportConfig } from "./config/SseTransportConfig"

export class McpIntegration extends EventEmitter {
	// Add new property
	private sseConfig?: SseTransportConfig

	/**
	 * Get the singleton instance of the McpIntegration
	 * @param config Optional SSE transport configuration
	 */
	public static getInstance(config?: SseTransportConfig): McpIntegration {
		if (!McpIntegration.instance) {
			McpIntegration.instance = new McpIntegration(config)
		} else if (config) {
			// Update config if provided
			McpIntegration.instance.sseConfig = config
		}
		return McpIntegration.instance
	}

	/**
	 * Private constructor to enforce singleton pattern
	 * @param config Optional SSE transport configuration
	 */
	private constructor(config?: SseTransportConfig) {
		super()
		this.sseConfig = config
		this.mcpToolRouter = McpToolRouter.getInstance(config)
		this.mcpToolSystem = McpToolExecutor.getInstance(config)

		// Forward events from the MCP tool router
		this.mcpToolRouter.on("tool-registered", (name) => this.emit("tool-registered", name))
		this.mcpToolRouter.on("tool-unregistered", (name) => this.emit("tool-unregistered", name))
		this.mcpToolRouter.on("started", (info) => this.emit("started", info))
		this.mcpToolRouter.on("stopped", () => this.emit("stopped"))
	}

	/**
	 * Get the server URL if the MCP server is running
	 * @returns The URL of the server, or undefined if not started
	 */
	public getServerUrl(): URL | undefined {
		return this.mcpToolSystem.getServerUrl()
	}

	// Rest of the class remains the same
}
```

### 2.6 Create an SSE Client Factory

```typescript
// src/services/mcp/client/SseClientFactory.ts

/**
 * Factory for creating MCP clients that connect to an SSE server
 */
export class SseClientFactory {
	/**
	 * Create a new MCP client that connects to the specified server URL
	 * @param serverUrl The URL of the MCP server to connect to
	 * @returns A new MCP client
	 */
	public static async createClient(serverUrl: URL): Promise<any> {
		try {
			// Try to import the MCP SDK dynamically
			const { Client } = require("@modelcontextprotocol/sdk/client")
			const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse")

			// Create the client
			const client = new Client({
				name: "TheaCodeMcpClient",
				version: "1.0.0",
			})

			// Create the transport
			const transport = new SSEClientTransport(serverUrl)

			// Connect the client to the transport
			await client.connect(transport)

			return client
		} catch (error) {
			console.warn("MCP SDK not found, using mock client")

			// Create a mock client
			const client = new MockClient({
				name: "TheaCodeMcpClient",
				version: "1.0.0",
			})

			return client
		}
	}
}

// Mock implementation of the Client class
class MockClient {
	constructor(private clientInfo: any) {}

	async connect(transport: any): Promise<void> {
		return Promise.resolve()
	}

	async close(): Promise<void> {
		return Promise.resolve()
	}

	async listTools(): Promise<any> {
		return { tools: [] }
	}

	async callTool(params: any): Promise<any> {
		return { content: [] }
	}
}
```

## 3. Test Implementation

### 3.1 Unit Tests for SSE Transport Configuration

```typescript
// src/services/mcp/__tests__/SseTransportConfig.test.ts

import { DEFAULT_SSE_CONFIG } from "../config/SseTransportConfig"

describe("SseTransportConfig", () => {
	test("DEFAULT_SSE_CONFIG should have expected values", () => {
		expect(DEFAULT_SSE_CONFIG).toEqual({
			port: 0,
			hostname: "localhost",
			allowExternalConnections: false,
			eventsPath: "/mcp/events",
			apiPath: "/mcp/api",
		})
	})
})
```

### 3.2 Integration Tests for SSE Transport

```typescript
// src/services/mcp/__tests__/SseTransport.test.ts

import { EmbeddedMcpProvider } from "../EmbeddedMcpProvider"
import { SseClientFactory } from "../client/SseClientFactory"
import { SseTransportConfig } from "../config/SseTransportConfig"

describe("SSE Transport", () => {
	let server: EmbeddedMcpProvider

	beforeEach(() => {
		// Create a new server with a random port for each test
		server = new EmbeddedMcpProvider({
			port: 0, // Use random port for tests
			hostname: "localhost",
		})
	})

	afterEach(async () => {
		// Clean up after each test
		await server.stop()
	})

	test("should start server and get URL", async () => {
		// Start the server
		await server.start()

		// Get the server URL
		const url = server.getServerUrl()

		// Verify that the URL is defined
		expect(url).toBeDefined()
		expect(url?.protocol).toBe("http:")
		expect(url?.hostname).toBe("localhost")
		expect(url?.port).toBeTruthy() // Should have a port assigned
	})

	test("should connect client to server", async () => {
		// Start the server
		await server.start()

		// Get the server URL
		const url = server.getServerUrl()
		expect(url).toBeDefined()

		// Register a test tool
		server.registerTool(
			"test_tool",
			"A test tool",
			{
				message: { type: "string" },
			},
			async (args) => ({
				content: [{ type: "text", text: `Received: ${args.message}` }],
			}),
		)

		// Create a client and connect to the server
		const client = await SseClientFactory.createClient(url!)

		try {
			// List available tools
			const toolsResult = await client.listTools()
			expect(toolsResult.tools).toHaveLength(1)
			expect(toolsResult.tools[0].name).toBe("test_tool")

			// Call the tool
			const result = await client.callTool({
				name: "test_tool",
				arguments: { message: "Hello, world!" },
			})

			// Verify the result
			expect(result.content).toHaveLength(1)
			expect(result.content[0].type).toBe("text")
			expect(result.content[0].text).toBe("Received: Hello, world!")
		} finally {
			// Close the client
			await client.close()
		}
	})

	test("should handle multiple clients", async () => {
		// Start the server
		await server.start()

		// Get the server URL
		const url = server.getServerUrl()
		expect(url).toBeDefined()

		// Register a test tool
		server.registerTool(
			"test_tool",
			"A test tool",
			{
				message: { type: "string" },
			},
			async (args) => ({
				content: [{ type: "text", text: `Received: ${args.message}` }],
			}),
		)

		// Create multiple clients
		const client1 = await SseClientFactory.createClient(url!)
		const client2 = await SseClientFactory.createClient(url!)
		const client3 = await SseClientFactory.createClient(url!)

		try {
			// Call the tool from each client
			const [result1, result2, result3] = await Promise.all([
				client1.callTool({
					name: "test_tool",
					arguments: { message: "Client 1" },
				}),
				client2.callTool({
					name: "test_tool",
					arguments: { message: "Client 2" },
				}),
				client3.callTool({
					name: "test_tool",
					arguments: { message: "Client 3" },
				}),
			])

			// Verify the results
			expect(result1.content[0].text).toBe("Received: Client 1")
			expect(result2.content[0].text).toBe("Received: Client 2")
			expect(result3.content[0].text).toBe("Received: Client 3")
		} finally {
			// Close all clients
			await Promise.all([client1.close(), client2.close(), client3.close()])
		}
	})

	test("should use custom configuration", async () => {
		// Create a server with custom configuration
		const customConfig: SseTransportConfig = {
			port: 8080,
			hostname: "127.0.0.1",
			allowExternalConnections: true,
			eventsPath: "/custom/events",
			apiPath: "/custom/api",
		}

		const customServer = new EmbeddedMcpProvider(customConfig)

		try {
			// Start the server
			await customServer.start()

			// Get the server URL
			const url = customServer.getServerUrl()

			// Verify that the URL uses the custom configuration
			expect(url).toBeDefined()
			expect(url?.hostname).toBe("127.0.0.1")

			// Note: We can't verify the port is exactly 8080 because it might be changed
			// if the port is already in use, but we can verify it's a valid port
			expect(url?.port).toBeTruthy()
		} finally {
			// Clean up
			await customServer.stop()
		}
	})

	test("should handle server restart", async () => {
		// Start the server
		await server.start()

		// Get the server URL
		const url1 = server.getServerUrl()
		expect(url1).toBeDefined()

		// Stop the server
		await server.stop()

		// Verify that the URL is no longer available
		expect(server.getServerUrl()).toBeUndefined()

		// Restart the server
		await server.start()

		// Get the new server URL
		const url2 = server.getServerUrl()
		expect(url2).toBeDefined()

		// The new URL should be different from the old one (different port)
		expect(url2?.toString()).not.toBe(url1?.toString())
	})
})
```

### 3.3 Update Existing Tests

Existing tests that use the MCP server will need to be updated to account for the new SSE transport. The main changes will be:

1. Waiting for the server to start and get a URL
2. Creating clients that connect to that URL
3. Ensuring proper cleanup of clients and server

## 4. Implementation Considerations

### 4.1 Backward Compatibility

To maintain backward compatibility, we should:

1. Keep the existing API surface unchanged where possible
2. Add new methods and properties rather than modifying existing ones
3. Provide sensible defaults for new configuration options
4. Use feature flags to enable/disable the new transport

### 4.2 Error Handling

The SSE transport implementation should include robust error handling:

1. Connection errors should be caught and logged
2. Reconnection logic should be implemented for clients
3. Server should gracefully handle client disconnections
4. Fallback mechanisms should be in place for when the SSE transport fails

### 4.3 Resource Management

Proper resource management is critical:

1. All connections should be properly closed when no longer needed
2. Memory leaks should be avoided by cleaning up event listeners
3. The HTTP server should be properly shut down when stopping the MCP server
4. Clients should be properly closed when they are no longer needed

### 4.4 Security Considerations

Since we're exposing an HTTP server:

1. By default, only allow connections from localhost
2. Provide configuration options for more restrictive security
3. Consider adding authentication for production use cases
4. Implement proper CORS settings to prevent cross-origin attacks
5. Consider using HTTPS for production deployments

## 5. Migration Strategy

### 5.1 Phased Approach

To migrate existing code to use the new SSE transport:

1. **Phase 1: Core Implementation**

    - Implement the SSE transport configuration
    - Update the EmbeddedMcpProvider to use SSE transport
    - Create the SSE client factory
    - Write tests for the new implementation

2. **Phase 2: Integration**

    - Update the McpToolExecutor to pass configuration
    - Update the McpToolRouter to pass configuration
    - Update the McpIntegration to pass configuration
    - Update existing tests to work with the new implementation

3. **Phase 3: Provider Integration**

    - Update the BaseProvider to use the new transport
    - Update provider handlers to use the new transport
    - Write tests for the updated provider handlers

4. **Phase 4: Validation and Rollout**
    - Validate the implementation with real models
    - Roll out the new transport gradually
    - Monitor for any issues and fix them

### 5.2 Feature Flag

To control the rollout of the new transport, we can use a feature flag:

```typescript
// src/config/features.ts

export const FEATURES = {
	USE_SSE_TRANSPORT: true,
}

// src/services/mcp/McpIntegration.ts

import { FEATURES } from "../../config/features"

export class McpIntegration {
	// ...

	constructor(config?: SseTransportConfig) {
		super()
		this.sseConfig = config

		// Use SSE transport if the feature flag is enabled
		if (FEATURES.USE_SSE_TRANSPORT) {
			this.mcpToolRouter = McpToolRouter.getInstance(config)
			this.mcpToolSystem = McpToolExecutor.getInstance(config)
		} else {
			// Use the old implementation
			this.mcpToolRouter = McpToolRouter.getInstance()
			this.mcpToolSystem = McpToolExecutor.getInstance()
		}

		// ...
	}

	// ...
}
```

## 6. Conclusion

Switching from StdioTransport to SSETransport will provide significant benefits in terms of thread safety, resource management, and connection handling. The implementation plan outlined above provides a clear path to making this change while maintaining backward compatibility and ensuring proper testing.

By following this plan, we can ensure a smooth transition to the new transport while minimizing the risk of breaking existing functionality. The phased approach allows us to validate each step of the implementation before moving on to the next, and the feature flag gives us the ability to roll back if necessary.
