import { EventEmitter } from "events"
import { McpToolExecutor } from "../core/McpToolExecutor"
import { McpToolRouter } from "../core/McpToolRouter"
import { McpToolRegistry } from "../core/McpToolRegistry"
import { ToolDefinition } from "../types/McpProviderTypes"
import { ToolUseFormat } from "../types/McpToolTypes"
import { SseTransportConfig } from "../types/McpTransportTypes"

/**
 * McpIntegration provides a singleton facade for the MCP (Model Context Protocol) system.
 *
 * This class serves as the main entry point for all MCP functionality in Thea Code,
 * providing a unified interface for tool registration, execution, and server management.
 * All providers automatically get MCP integration through BaseProvider.
 *
 * Key Features:
 * - Singleton pattern ensures consistent MCP state across the application
 * - Automatic tool registration and execution
 * - Support for multiple tool use formats (XML, JSON, OpenAI function calls)
 * - Embedded MCP server with SSE and Stdio transports
 * - Event-driven architecture for tool lifecycle management
 *
 * Example Usage:
 * ```typescript
 * const mcpIntegration = McpIntegration.getInstance();
 *
 * // Register a custom tool
 * mcpIntegration.registerTool({
 *   name: 'analyze_file',
 *   description: 'Analyze a file for patterns',
 *   paramSchema: {
 *     type: 'object',
 *     properties: { path: { type: 'string' } },
 *     required: ['path']
 *   }
 * });
 *
 * // Execute a tool (format auto-detected)
 * const result = await mcpIntegration.routeToolUse({
 *   format: ToolUseFormat.XML,
 *   content: '<read_file><path>example.ts</path></read_file>'
 * });
 * ```
 */
export class McpIntegration extends EventEmitter {
	private static instance: McpIntegration
	private mcpToolRouter: McpToolRouter
	private mcpToolSystem: McpToolExecutor
	private isInitialized: boolean = false
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
		this.mcpToolSystem = McpToolExecutor.getInstance()

		// Forward events from the MCP tool router
		this.mcpToolRouter.on("tool-registered", (name: string) => this.emit("tool-registered", name))
		this.mcpToolRouter.on("tool-unregistered", (name: string) => this.emit("tool-unregistered", name))
		this.mcpToolRouter.on("started", (info: unknown) => this.emit("started", info))
		this.mcpToolRouter.on("stopped", () => this.emit("stopped"))
	}

	/** Check whether the integration has been initialized. */
	public isReady(): boolean {
		return this.isInitialized
	}

	/**
	 * Initialize the MCP integration
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		// Initialize the MCP tool router
		await this.mcpToolRouter.initialize()
		this.isInitialized = true
	}

	/**
	 * Shutdown the MCP integration
	 */
	public async shutdown(): Promise<void> {
		if (!this.isInitialized) {
			return
		}

		// Shutdown the MCP tool router
		await this.mcpToolRouter.shutdown()
		this.isInitialized = false
	}

	/**
	 * Register a tool with the MCP integration
	 * @param definition The tool definition
	 */
	public registerTool(definition: ToolDefinition): void {
		this.mcpToolSystem.registerTool(definition)
	}

	/**
	 * Unregister a tool from the MCP integration
	 * @param name The name of the tool to unregister
	 * @returns true if the tool was unregistered, false if it wasn't found
	 */
	public unregisterTool(name: string): boolean {
		return this.mcpToolSystem.unregisterTool(name)
	}

	/**
	 * Process a tool use request in XML format
	 * @param xmlContent The XML content containing the tool use request
	 * @returns The tool result in XML format
	 */
	public async processXmlToolUse(xmlContent: string): Promise<string> {
		const result = await this.mcpToolRouter.routeToolUse({
			format: ToolUseFormat.XML,
			content: xmlContent,
		})
		return result.content as string
	}

	/**
	 * Process a tool use request in JSON format
	 * @param jsonContent The JSON content containing the tool use request
	 * @returns The tool result in JSON format
	 */
	public async processJsonToolUse(jsonContent: string | Record<string, unknown>): Promise<string> {
		const result = await this.mcpToolRouter.routeToolUse({
			format: ToolUseFormat.JSON,
			content: jsonContent,
		})
		return result.content as string
	}

	/**
	 * Process a tool use request in OpenAI function call format
	 * @param functionCall The OpenAI function call object
	 * @returns The tool result in OpenAI tool result format
	 */
	public async processOpenAiFunctionCall(functionCall: Record<string, unknown>): Promise<Record<string, unknown>> {
		const result = await this.mcpToolRouter.routeToolUse({
			format: ToolUseFormat.OPENAI,
			content: functionCall,
		})
		return result.content as Record<string, unknown>
	}

	/**
	 * Route a tool use request based on its format
	 * @param content The tool use request content
	 * @returns The tool result
	 */
	public async routeToolUse(content: string | Record<string, unknown>): Promise<string | Record<string, unknown>> {
		// Detect the format
		const format = this.mcpToolRouter.detectFormat(content)

		// Route the request
		const result = await this.mcpToolRouter.routeToolUse({
			format,
			content,
		})

		// Return the result
		return result.content
	}

	/**
	 * Get the tool registry
	 * @returns The tool registry
	 */
	public getToolRegistry(): McpToolRegistry {
		return this.mcpToolSystem.getToolRegistry()
	}

	/**
	 * Get the server URL if the MCP server is running
	 * @returns The URL of the server, or undefined if not started
	 */
	public getServerUrl(): URL | undefined {
		return this.mcpToolSystem.getServerUrl()
	}
}

/**
 * McpToolHandler provides a simplified interface for handling tool use requests.
 * It detects the format of the request and routes it to the appropriate handler.
 *
 * This function can be used as a drop-in replacement for existing tool handling code.
 *
 * @param content The tool use request content (XML, JSON, or OpenAI format)
 * @returns The tool result in the same format as the request
 */
export async function handleToolUse(
	content: string | Record<string, unknown>,
): Promise<string | Record<string, unknown>> {
	const mcpIntegration = McpIntegration.getInstance()

	// Initialize if not already initialized
	if (!mcpIntegration.isReady()) {
		await mcpIntegration.initialize()
	}

	// Route the tool use request
	return mcpIntegration.routeToolUse(content)
}
