import { EventEmitter } from "events"
import { ToolDefinition } from "../types/McpProviderTypes"
import { NeutralToolUseRequest, NeutralToolResult } from "../types/McpToolTypes"
import { McpToolRegistry } from "./McpToolRegistry"
import { SseTransportConfig } from "../types/McpTransportTypes"
import { EmbeddedMcpProvider } from "../providers/EmbeddedMcpProvider"

/**
 * McpToolExecutor provides a unified interface for tool use across different AI models.
 * It leverages the Model Context Protocol (MCP) as the underlying mechanism for tool execution.
 */
export class McpToolExecutor extends EventEmitter {
	private static instance: McpToolExecutor
	private mcpProvider: EmbeddedMcpProvider | undefined
	private toolRegistry: McpToolRegistry
	private isInitialized: boolean = false
	private sseConfig?: SseTransportConfig

	/**
	 * Get the singleton instance of the McpToolExecutor
	 * @param config Optional SSE transport configuration
	 */
	public static getInstance(): McpToolExecutor {
		if (!McpToolExecutor.instance) {
			McpToolExecutor.instance = new McpToolExecutor()
		}
		return McpToolExecutor.instance
	}

	public static async initializeForTest(config?: SseTransportConfig): Promise<McpToolExecutor> {
		const instance = McpToolExecutor.getInstance()
		instance.sseConfig = config
		await instance.initialize()
		return instance
	}

	/**
	 * Private constructor to enforce singleton pattern
	 * @param config Optional SSE transport configuration
	 */
	private constructor(config?: SseTransportConfig) {
		super()
		// The EmbeddedMcpProvider has a private constructor and should be created using the static create method.
		this.sseConfig = config
		// The actual instantiation and initialization will happen in the initialize method as it's an async operation.
		// this.mcpProvider = new EmbeddedMcpProvider(config); // This line caused the error due to private constructor.
		this.toolRegistry = McpToolRegistry.getInstance()
	}

	/**
	 * Initialize the unified tool system
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		// Create and start the EmbeddedMcpProvider instance
		this.mcpProvider = await EmbeddedMcpProvider.create(this.sseConfig)
		await this.mcpProvider.start()
		this.isInitialized = true

		// Forward events from the MCP provider
		this.mcpProvider.on("tool-registered", (name: string) => this.emit("tool-registered", name))
		this.mcpProvider.on("tool-unregistered", (name: string) => this.emit("tool-unregistered", name))
		this.mcpProvider.on("started", (info: unknown) => this.emit("started", info))
		this.mcpProvider.on("stopped", () => this.emit("stopped"))
	}

	/**
	 * Shutdown the unified tool system
	 */
	public async shutdown(): Promise<void> {
		if (!this.isInitialized) {
			return
		}

		// Stop the MCP provider
		await this.mcpProvider!.stop()
		this.isInitialized = false
	}

	/**
	 * Register a tool with the unified tool system
	 * @param definition The tool definition
	 */
	public registerTool(definition: ToolDefinition): void {
		if (!this.mcpProvider) {
			throw new Error("McpToolExecutor not initialized")
		}
		// Register with both the MCP provider and the tool registry
		this.mcpProvider.registerToolDefinition(definition)
		this.toolRegistry.registerTool(definition)
	}

	/**
	 * Unregister a tool from the unified tool system
	 * @param name The name of the tool to unregister
	 * @returns true if the tool was unregistered, false if it wasn't found
	 */
	public unregisterTool(name: string): boolean {
		if (!this.mcpProvider) {
			throw new Error("McpToolExecutor not initialized")
		}
		// Unregister from both the MCP provider and the tool registry
		const mcpResult = this.mcpProvider.unregisterTool(name)
		const registryResult = this.toolRegistry.unregisterTool(name)

		return mcpResult && registryResult
	}

	/**
	 * Execute a tool from a neutral format request
	 * @param request The tool use request in neutral format
	 * @returns The tool result in neutral format
	 */
	public async executeToolFromNeutralFormat(request: NeutralToolUseRequest): Promise<NeutralToolResult> {
		if (!this.mcpProvider) {
			throw new Error("McpToolExecutor not initialized")
		}
		const { name, input, id } = request

		try {
			// Execute the tool using the MCP provider
			const result = await this.mcpProvider.executeTool(name, input)

			// Convert the result to neutral format
			return {
				type: "tool_result",
				tool_use_id: id,
				content: result.content,
				status: result.isError ? "error" : "success",
				error: result.isError
					? {
							message: result.content[0]?.text || "Unknown error",
						}
					: undefined,
			}
		} catch (error) {
			// Handle errors
			return {
				type: "tool_result",
				tool_use_id: id,
				content: [
					{
						type: "text",
						text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				status: "error",
				error: {
					message: error instanceof Error ? error.message : String(error),
				},
			}
		}
	}

	/**
	 * Get the tool registry
	 * @returns The tool registry
	 */
	public getToolRegistry(): McpToolRegistry {
		return this.toolRegistry
	}

	/**
	 * Get the server URL if the MCP provider is running
	 * @returns The URL of the server, or undefined if not started
	 */
	public getServerUrl(): URL | undefined {
		return this.mcpProvider?.getServerUrl()
	}
}
