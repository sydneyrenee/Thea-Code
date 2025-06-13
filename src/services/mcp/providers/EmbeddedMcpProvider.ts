import { EventEmitter } from "events"
import type { Server as HttpServer } from "http"
import type { AddressInfo } from "net"
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "../transport/config/SseTransportConfig"
import { SseTransport } from "../transport/SseTransport"
import { StdioTransport } from "../transport/StdioTransport"
import {
	ToolCallResult,
	ToolDefinition,
	ResourceDefinition,
	ResourceTemplateDefinition,
	IMcpProvider,
} from "../types/McpProviderTypes"
import { StdioTransportConfig, IMcpTransport } from "../types/McpTransportTypes"

const isTestEnv = process.env.JEST_WORKER_ID !== undefined

// Define a more specific type for the MCP server instance from the SDK
// This needs to align with the actual SDK's McpServer class structure
interface SdkMcpServer {
	tool: (
		name: string,
		description: string,
		schema: Record<string, unknown>,
		handler: (args: Record<string, unknown>) => Promise<unknown>,
	) => void
	connect: (transport: unknown) => Promise<void>
}

export class EmbeddedMcpProvider extends EventEmitter implements IMcpProvider {
	private server!: SdkMcpServer // Definite assignment in create()
	private tools: Map<string, ToolDefinition> = new Map()
	private resources: Map<string, ResourceDefinition> = new Map()
	private resourceTemplates: Map<string, ResourceTemplateDefinition> = new Map()
	private isStarted: boolean = false
	private transport?: IMcpTransport
	private sseConfig: SseTransportConfig
	private stdioConfig?: StdioTransportConfig
	private transportType: "sse" | "stdio" = "sse"
	private serverUrl?: URL

	private static async createServerInstance(): Promise<SdkMcpServer> {
		try {
			// Import McpServer using the package export which resolves to the
			// appropriate module format (ESM or CJS) based on the current runtime.
			const mod = (await import("@modelcontextprotocol/sdk/server/mcp.js")) as {
				McpServer?: new (options: { name: string; version: string }) => SdkMcpServer
			}
			const { McpServer } = mod
			if (!McpServer) {
				throw new Error("MCP SDK McpServer not found")
			}
			if (!isTestEnv) {
				console.log("Initializing MCP Server...")
			}
			return new McpServer({
				name: "EmbeddedMcpProvider",
				version: "1.0.0",
			})
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			if (!isTestEnv) {
				console.error("Failed to initialize MCP server:", errorMessage)
			}
			throw error
		}
	}

	static async create(
		options?:
			| { type: "sse"; config?: SseTransportConfig }
			| { type: "stdio"; config: StdioTransportConfig }
			| SseTransportConfig,
	): Promise<EmbeddedMcpProvider> {
		const instance = new EmbeddedMcpProvider()

		if (options && "type" in options) {
			instance.transportType = options.type
			if (options.type === "sse") {
				instance.sseConfig = { ...DEFAULT_SSE_CONFIG, ...options.config }
			} else {
				instance.stdioConfig = options.config
				// Ensure sseConfig has defaults even if stdio is primary
				instance.sseConfig = { ...DEFAULT_SSE_CONFIG }
			}
		} else {
			instance.transportType = "sse"
			instance.sseConfig = { ...DEFAULT_SSE_CONFIG, ...(options as SseTransportConfig) }
		}

		instance.server = await EmbeddedMcpProvider.createServerInstance()
		return instance
	}

	private constructor() {
		super()
		// Initialize sseConfig with defaults, will be overridden in create()
		this.sseConfig = { ...DEFAULT_SSE_CONFIG }
		// Server is initialized in the static create method, so mark as definitely assigned or handle null
		// For now, using definite assignment assertion, assuming create() is always called.
	}

	private registerHandlers(): void {
		if (!this.server) {
			throw new Error("Cannot register handlers: MCP Server not initialized")
		}

		for (const [name, definition] of this.tools.entries()) {
			try {
				this.server.tool(
					name,
					definition.description || "",
					definition.paramSchema || {},
					async (args: Record<string, unknown>) => {
						try {
							return await definition.handler(args)
						} catch (error) {
							return {
								content: [
									{
										type: "text",
										text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`,
									},
								],
								isError: true,
							}
						}
					},
				)
			} catch (error) {
				if (!isTestEnv) {
					console.error(`Failed to register tool ${name}:`, error)
				}
			}
		}

		for (const [uri, definition] of this.resources.entries()) {
			const resourceName = `resource:${uri}`
			try {
				this.server.tool(resourceName, `Access resource: ${definition.description || uri}`, {}, async () => {
					try {
						const content = await definition.handler()
						return {
							content: [
								{
									type: "text",
									text: content instanceof Buffer ? content.toString("utf-8") : content,
								},
							],
						}
					} catch (error) {
						return {
							content: [
								{
									type: "text",
									text: `Error accessing resource '${uri}': ${error instanceof Error ? error.message : String(error)}`,
								},
							],
							isError: true,
						}
					}
				})
			} catch (error) {
				if (!isTestEnv) {
					console.error(`Failed to register resource ${uri}:`, error)
				}
			}
		}

		for (const [uriTemplate, definition] of this.resourceTemplates.entries()) {
			const templateName = `template:${uriTemplate}`
			const paramNames = this.extractParamNames(uriTemplate)
			const paramSchema: Record<string, { type: string }> = {}
			for (const param of paramNames) {
				paramSchema[param] = { type: "string" }
			}

			try {
				this.server.tool(
					templateName,
					`Access resource template: ${definition.description || uriTemplate}`,
					paramSchema,
					async (args: Record<string, unknown>) => {
						try {
							const content = await definition.handler(args as Record<string, string>)
							return {
								content: [
									{
										type: "text",
										text: content instanceof Buffer ? content.toString("utf-8") : content,
									},
								],
							}
						} catch (error) {
							return {
								content: [
									{
										type: "text",
										text: `Error accessing resource template '${uriTemplate}': ${error instanceof Error ? error.message : String(error)}`,
									},
								],
								isError: true,
							}
						}
					},
				)
			} catch (error) {
				if (!isTestEnv) {
					console.error(`Failed to register resource template ${uriTemplate}:`, error)
				}
			}
		}
	}

	private extractParamNames(template: string): string[] {
		const paramRegex = /{([^}]+)}/g
		const params: string[] = []
		let match
		while ((match = paramRegex.exec(template)) !== null) {
			params.push(match[1])
		}
		return params
	}

	private matchUriTemplate(template: string, uri: string): Record<string, string> | null {
		const regexStr = template.replace(/{([^}]+)}/g, "(?<$1>[^/]+)")
		const regex = new RegExp(`^${regexStr}$`)
		const match = regex.exec(uri)
		if (!match || !match.groups) {
			return null
		}
		return match.groups
	}

	public registerToolDefinition(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition)
		this.emit("tool-registered", definition.name)
	}

	public registerResource(definition: ResourceDefinition): void {
		this.resources.set(definition.uri, definition)
		this.emit("resource-registered", definition.uri)
	}

	public registerResourceTemplate(definition: ResourceTemplateDefinition): void {
		this.resourceTemplates.set(definition.uriTemplate, definition)
		this.emit("resource-template-registered", definition.uriTemplate)
	}

	public unregisterTool(name: string): boolean {
		const result = this.tools.delete(name)
		if (result) {
			this.emit("tool-unregistered", name)
		}
		return result
	}

	public unregisterResource(uri: string): boolean {
		const result = this.resources.delete(uri)
		if (result) {
			this.emit("resource-unregistered", uri)
		}
		return result
	}

	public unregisterResourceTemplate(uriTemplate: string): boolean {
		const result = this.resourceTemplates.delete(uriTemplate)
		if (result) {
			this.emit("resource-template-unregistered", uriTemplate)
		}
		return result
	}

	public async start(): Promise<void> {
		if (this.isStarted) {
			return
		}
		if (!this.server) {
			throw new Error("MCP Server not initialized. Call EmbeddedMcpProvider.create() first.")
		}

		try {
			if (this.transportType === "stdio") {
				this.transport = new StdioTransport(this.stdioConfig!)
			} else {
				// SSE Transport
				this.transport = new SseTransport(this.sseConfig)
			}

			if (!this.transport) {
				throw new Error(`Failed to initialize ${this.transportType} transport`)
			}

			this.registerHandlers()
			// The SDK's connect method expects the raw SDK transport instance.
			// It will also start the underlying HTTP server for SSE.
			await this.server.connect(this.transport as unknown)

			// After connect, if SSE, the port should be determined and available.
			if (this.transportType === "sse") {
				const sdkSseTransportInstance = this.transport as {
					httpServer?: HttpServer
					port?: number
				}

				let actualPort: number | undefined
				// The SDK's SSEServerTransport has an `httpServer` which is a Node `http.Server`
				// The `address()` method returns an `AddressInfo` object or string.
				if (
					sdkSseTransportInstance.httpServer &&
					typeof sdkSseTransportInstance.httpServer.address === "function"
				) {
					const rawAddress: AddressInfo | string | null = sdkSseTransportInstance.httpServer.address()
					if (rawAddress && typeof rawAddress === "object" && "port" in rawAddress) {
						actualPort = rawAddress.port
					}
				}

				if (
					!actualPort &&
					typeof sdkSseTransportInstance.port === "number" &&
					sdkSseTransportInstance.port !== 0
				) {
					// Fallback to .port property if httpServer.address() didn't yield a port
					// This might be the case if the SDK sets .port directly after listening.
					actualPort = sdkSseTransportInstance.port
					if (!isTestEnv) {
						console.warn("Retrieved port from sdkSseTransportInstance.port")
					}
				}

				if (!actualPort) {
					throw new Error("SSE Transport failed to determine the listening port after connect.")
				}

				const host = this.sseConfig.hostname || "localhost"
				this.serverUrl = new URL(`http://${host}:${actualPort}`)
				if (!isTestEnv) {
					console.log(`MCP server (SSE) started at ${this.serverUrl.toString()}`)
				}
			} else {
				if (!isTestEnv) {
					console.log(`MCP server started with ${this.transportType} transport`)
				}
			}

			this.isStarted = true
			const eventData: { url?: string; type: string; port?: number } = {
				url: this.serverUrl?.toString(),
				type: this.transportType,
				port: this.serverUrl ? parseInt(this.serverUrl.port, 10) : undefined,
			}
			this.emit("started", eventData)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			if (!isTestEnv) {
				console.error("Failed to start MCP server:", errorMessage)
			}
			this.isStarted = false
			if (this.transport) {
				try {
					await this.transport.close()
				} catch (closeError) {
					if (!isTestEnv) {
						console.error("Error closing transport:", closeError)
					}
				}
			}
			throw error
		}
	}

	public async stop(): Promise<void> {
		if (!this.isStarted) {
			return
		}
		try {
			if (this.transport?.close) {
				await this.transport.close()
			}
		} catch (error) {
			if (!isTestEnv) {
				console.error("Error stopping MCP server:", error)
			}
		} finally {
			this.transport = undefined
			this.serverUrl = undefined
			this.isStarted = false
			this.emit("stopped")
		}
	}

	public getServerUrl(): URL | undefined {
		return this.serverUrl
	}

	public getTools(): Map<string, ToolDefinition> {
		return new Map(this.tools)
	}

	public getResources(): Map<string, ResourceDefinition> {
		return new Map(this.resources)
	}

	public getResourceTemplates(): Map<string, ResourceTemplateDefinition> {
		return new Map(this.resourceTemplates)
	}

	public isRunning(): boolean {
		return this.isStarted
	}

	public async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
		const tool = this.tools.get(name)
		if (!tool) {
			return {
				content: [{ type: "text", text: `Tool '${name}' not found` }],
				isError: true,
			}
		}
		try {
			return await tool.handler(args || {})
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				isError: true,
			}
		}
	}

	public registerTool(
		name: string,
		description: string,
		paramSchema: Record<string, unknown>,
		handler: (args: Record<string, unknown>) => Promise<ToolCallResult>,
	): void {
		this.tools.set(name, { name, description, paramSchema, handler })
		if (this.isStarted && this.server) {
			try {
				this.server.tool(name, description, paramSchema, async (args: Record<string, unknown>) => {
					try {
						return await handler(args)
					} catch (error) {
						return {
							content: [
								{
									type: "text",
									text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`,
								},
							],
							isError: true,
						}
					}
				})
			} catch (error) {
				if (!isTestEnv) {
					console.error(`Failed to register tool ${name}:`, error)
				}
			}
		}
		this.emit("tool-registered", name)
	}

	public async accessResource(uri: string): Promise<{ content: string | Buffer; mimeType?: string }> {
		const resource = this.resources.get(uri)
		if (!resource) {
			for (const [template, definition] of this.resourceTemplates.entries()) {
				const match = this.matchUriTemplate(template, uri)
				if (match) {
					try {
						const content = await definition.handler(match)
						return { content, mimeType: definition.mimeType }
					} catch (error) {
						throw new Error(
							`Error reading resource template '${template}': ${error instanceof Error ? error.message : String(error)}`,
						)
					}
				}
			}
			throw new Error(`Resource '${uri}' not found`)
		}
		try {
			const content = await resource.handler()
			return { content, mimeType: resource.mimeType }
		} catch (error) {
			throw new Error(
				`Error reading resource '${uri}': ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
}
