# MCP Refactoring Implementation Details

This document provides detailed implementation steps for the MCP architecture refactoring plan. It focuses on the specific code changes needed for each component.

## Table of Contents

1. [Type Definitions](#type-definitions)
2. [Core Components](#core-components)
3. [Provider Components](#provider-components)
4. [Transport Components](#transport-components)
5. [Client Components](#client-components)
6. [Integration Components](#integration-components)
7. [Management Components](#management-components)
8. [External References](#external-references)
9. [Test Updates](#test-updates)

## Type Definitions

### McpToolTypes.ts

````typescript
// src/services/mcp/types/McpToolTypes.ts

/**
 * Interface for tool use request in a neutral format
 */
export interface NeutralToolUseRequest {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Interface for tool result in a neutral format
 */
export interface NeutralToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  status: 'success' | 'error';
  error?: {
    message: string;
    details?: unknown;
  };
}

/**
 * Enum for supported tool use formats
 */
export enum ToolUseFormat {
  XML = 'xml',
  JSON = 'json',
  OPENAI = 'openai',
  NEUTRAL = 'neutral'
}

/**
 * Interface for tool use request with format information
 */
export interface ToolUseRequestWithFormat {
  format: ToolUseFormat;
  content: string | Record<string, unknown>;
}

### McpProviderTypes.ts

```typescript
// src/services/mcp/types/McpProviderTypes.ts

/**
 * Interface for tool call result
 */
export interface ToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Interface for tool definitions that can be registered with the embedded MCP server
 */
export interface ToolDefinition {
  name: string
  description?: string
  paramSchema?: Record<string, any>
  handler: (args: Record<string, unknown>) => Promise<ToolCallResult>
}

/**
 * Interface for resource definitions that can be registered with the embedded MCP server
 */
export interface ResourceDefinition {
  uri: string
  name: string
  mimeType?: string
  description?: string
  handler: () => Promise<string | Buffer>
}

/**
 * Interface for resource template definitions that can be registered with the embedded MCP server
 */
export interface ResourceTemplateDefinition {
  uriTemplate: string
  name: string
  description?: string
  mimeType?: string
  handler: (params: Record<string, string>) => Promise<string | Buffer>
}

/**
 * Interface for MCP provider
 */
export interface IMcpProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerToolDefinition(definition: ToolDefinition): void;
  unregisterTool(name: string): boolean;
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  getServerUrl(): URL | undefined;
  isRunning(): boolean;
}
````

### McpTransportTypes.ts

````typescript
// src/services/mcp/types/McpTransportTypes.ts

/**
 * Configuration options for the SSE transport
 */
export interface SseTransportConfig {
  /**
   * The port to listen on (default: 0 for random available port)
   */
  port?: number;

  /**
   * The hostname to bind to (default: localhost)
   */
  hostname?: string;

  /**
   * Whether to allow connections from other hosts (default: false)
   */
  allowExternalConnections?: boolean;

  /**
   * The path to serve the SSE endpoint on (default: /mcp/events)
   */
  eventsPath?: string;

  /**
   * The path to accept POST requests on (default: /mcp/api)
   */
  apiPath?: string;
}

## Core Components

### McpToolRegistry.ts

```typescript
// src/services/mcp/core/McpToolRegistry.ts

import { EventEmitter } from "events";
import { ToolDefinition, ToolCallResult } from "../types/McpProviderTypes";

/**
 * McpToolRegistry serves as a central registry for all tools in the system.
 * It provides a unified interface for registering tools that can be used by
 * both the embedded MCP server and the JSON-XML bridge.
 */
export class McpToolRegistry extends EventEmitter {
  private tools: Map<string, ToolDefinition> = new Map();
  private static instance: McpToolRegistry;

  /**
   * Get the singleton instance of the McpToolRegistry
   */
  public static getInstance(): McpToolRegistry {
    if (!McpToolRegistry.instance) {
      McpToolRegistry.instance = new McpToolRegistry();
    }
    return McpToolRegistry.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
  }

  /**
   * Register a tool with the registry
   * @param definition The tool definition
   */
  public registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
    this.emit('tool-registered', definition.name);
  }

  /**
   * Unregister a tool from the registry
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  public unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.emit('tool-unregistered', name);
    }
    return result;
  }

  /**
   * Get a tool by name
   * @param name The name of the tool to get
   * @returns The tool definition, or undefined if not found
   */
  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   * @returns A map of tool names to tool definitions
   */
  public getAllTools(): Map<string, ToolDefinition> {
    return new Map(this.tools);
  }

  /**
   * Check if a tool exists
   * @param name The name of the tool to check
   * @returns true if the tool exists, false otherwise
   */
  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   * @param name The name of the tool to execute
   * @param args The arguments to pass to the tool
   * @returns The result of the tool execution
   */
  public async executeTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    try {
      return await tool.handler(args);
    } catch (error) {
      throw new Error(`Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
````

### McpToolExecutor.ts

````typescript
// src/services/mcp/core/McpToolExecutor.ts

import { EventEmitter } from "events";
import {
  jsonToolUseToXml,
  xmlToolUseToJson,
  openAiFunctionCallToNeutralToolUse,
  neutralToolUseToOpenAiFunctionCall
} from "../../../utils/json-xml-bridge";
import { NeutralToolUseRequest, NeutralToolResult } from "../types/McpToolTypes";
import { McpToolRegistry } from "./McpToolRegistry";
import { IMcpProvider } from "../types/McpProviderTypes";
import { SseTransportConfig } from "../transport/config/SseTransportConfig";

/**
 * McpToolExecutor provides a unified interface for tool use across different AI models.
 * It leverages the Model Context Protocol (MCP) as the underlying mechanism for tool execution,
 * while providing converters for both XML and JSON formats.
 */
export class McpToolExecutor extends EventEmitter {
  private static instance: McpToolExecutor;
  private mcpProvider: IMcpProvider;
  private toolRegistry: McpToolRegistry;
  private isInitialized: boolean = false;
  private sseConfig?: SseTransportConfig;

  /**
   * Get the singleton instance of the McpToolExecutor
   * @param provider The MCP provider to use
   * @param config Optional SSE transport configuration
   */
  public static getInstance(provider: IMcpProvider, config?: SseTransportConfig): McpToolExecutor {
    if (!McpToolExecutor.instance) {
      McpToolExecutor.instance = new McpToolExecutor(provider, config);
    } else if (config) {
      // Update config if provided
      McpToolExecutor.instance.sseConfig = config;
    }
    return McpToolExecutor.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   * @param provider The MCP provider to use
   * @param config Optional SSE transport configuration
   */
  private constructor(provider: IMcpProvider, config?: SseTransportConfig) {
    super();
    this.sseConfig = config;
    this.mcpProvider = provider;
    this.toolRegistry = McpToolRegistry.getInstance();

    // Forward events from the MCP provider
    if (this.mcpProvider instanceof EventEmitter) {
      this.mcpProvider.on('tool-registered', (name) => this.emit('tool-registered', name));
      this.mcpProvider.on('tool-unregistered', (name) => this.emit('tool-unregistered', name));
      this.mcpProvider.on('started', (info) => this.emit('started', info));
      this.mcpProvider.on('stopped', () => this.emit('stopped'));
    }
  }

  /**
   * Initialize the unified tool system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Start the MCP provider
    await this.mcpProvider.start();
    this.isInitialized = true;
  }

  /**
   * Shutdown the unified tool system
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Stop the MCP provider
    await this.mcpProvider.stop();
    this.isInitialized = false;
  }

  /**
   * Register a tool with the unified tool system
   * @param definition The tool definition
   */
  public registerTool(definition: ToolDefinition): void {
    // Register with both the MCP provider and the tool registry
    this.mcpProvider.registerToolDefinition(definition);
    this.toolRegistry.registerTool(definition);
  }

  /**
   * Unregister a tool from the unified tool system
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  public unregisterTool(name: string): boolean {
    // Unregister from both the MCP provider and the tool registry
    const mcpResult = this.mcpProvider.unregisterTool(name);
    const registryResult = this.toolRegistry.unregisterTool(name);

    return mcpResult && registryResult;
  }

  // ... rest of the implementation with updated references
}
## Provider Components

### EmbeddedMcpProvider.ts

```typescript
// src/services/mcp/providers/EmbeddedMcpProvider.ts

import { EventEmitter } from "events";
import {
  ToolCallResult,
  ToolDefinition,
  ResourceDefinition,
  ResourceTemplateDefinition,
  IMcpProvider
} from "../types/McpProviderTypes";
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "../transport/config/SseTransportConfig";
import { IMcpTransport } from "../types/McpTransportTypes";
import { SseTransport } from "../transport/SseTransport";
import { StdioTransport } from "../transport/StdioTransport";

/**
 * EmbeddedMcpProvider provides a local MCP server implementation that hosts tools
 * from various sources including XML and JSON tool definitions.
 *
 * This provider acts as a unified tool system that can be used by models
 * regardless of whether they use XML or JSON formats for tool calls.
 */
export class EmbeddedMcpProvider extends EventEmitter implements IMcpProvider {
  private server: any;
  private tools: Map<string, ToolDefinition> = new Map();
  private resources: Map<string, ResourceDefinition> = new Map();
  private resourceTemplates: Map<string, ResourceTemplateDefinition> = new Map();
  private isStarted: boolean = false;
  private transport?: IMcpTransport;
  private sseConfig: SseTransportConfig;
  private serverUrl?: URL;

  /**
   * Create a new embedded MCP provider
   * @param config Optional SSE transport configuration
   */
  constructor(config?: SseTransportConfig) {
    super();

    this.sseConfig = { ...DEFAULT_SSE_CONFIG, ...config };

    try {
      // Try to import the MCP SDK dynamically
      const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
      this.server = new McpServer({
        name: "EmbeddedMcpProvider",
        version: "1.0.0"
      });
    } catch (error) {
      // If the MCP SDK is not installed, use the mock implementation
      console.warn("MCP SDK not found, using mock implementation");
      this.server = new MockMcpServer({
        name: "EmbeddedMcpProvider",
        version: "1.0.0"
      });
    }
  }

  /**
   * Register all tools, resources, and resource templates with the server
   */
  private registerHandlers(): void {
    // Register all tools
    for (const [name, definition] of this.tools.entries()) {
      try {
        this.server.tool(
          name,
          definition.description || "",
          definition.paramSchema || {},
          async (args: any) => {
            try {
              return await definition.handler(args);
            } catch (error) {
              return {
                content: [{
                  type: "text",
                  text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
              };
            }
          }
        );
      } catch (error) {
        console.error(`Failed to register tool ${name}:`, error);
      }
    }

    // Register resource handlers as tools
    for (const [uri, definition] of this.resources.entries()) {
      const resourceName = `resource:${uri}`;

      try {
        this.server.tool(
          resourceName,
          `Access resource: ${definition.description || uri}`,
          {},
          async () => {
            try {
              const content = await definition.handler();
              return {
                content: [{
                  type: "text",
                  text: content instanceof Buffer ? content.toString("utf-8") : content
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: "text",
                  text: `Error accessing resource '${uri}': ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
              };
            }
          }
        );
      } catch (error) {
        console.error(`Failed to register resource ${uri}:`, error);
      }
    }

    // Register resource template handlers
    for (const [uriTemplate, definition] of this.resourceTemplates.entries()) {
      const templateName = `template:${uriTemplate}`;

      // Create a schema for the template parameters
      const paramNames = this.extractParamNames(uriTemplate);
      const paramSchema: Record<string, any> = {};

      for (const param of paramNames) {
        paramSchema[param] = { type: "string" };
      }

      try {
        this.server.tool(
          templateName,
          `Access resource template: ${definition.description || uriTemplate}`,
          paramSchema,
          async (args: any) => {
            try {
              const content = await definition.handler(args as Record<string, string>);
              return {
                content: [{
                  type: "text",
                  text: content instanceof Buffer ? content.toString("utf-8") : content
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: "text",
                  text: `Error accessing resource template '${uriTemplate}': ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
              };
            }
          }
        );
      } catch (error) {
        console.error(`Failed to register resource template ${uriTemplate}:`, error);
      }
    }
  }

  /**
   * Extract parameter names from a URI template
   * @param template The URI template with {param} placeholders
   * @returns An array of parameter names
   */
  private extractParamNames(template: string): string[] {
    const paramRegex = /{([^}]+)}/g;
    const params: string[] = [];
    let match;

    while ((match = paramRegex.exec(template)) !== null) {
      params.push(match[1]);
    }

    return params;
  }

  /**
   * Match a URI against a URI template and extract parameters
   * @param template The URI template with {param} placeholders
   * @param uri The actual URI to match
   * @returns A map of parameter names to values, or null if no match
   */
  private matchUriTemplate(template: string, uri: string): Record<string, string> | null {
    // Convert template to regex by replacing {param} with named capture groups
    const regexStr = template.replace(/{([^}]+)}/g, '(?<$1>[^/]+)');
    const regex = new RegExp(`^${regexStr}$`);

    const match = regex.exec(uri);
    if (!match || !match.groups) {
      return null;
    }

    return match.groups;
  }

  /**
   * Register a tool with the embedded MCP provider using a definition object
   * @param definition The tool definition
   */
  registerToolDefinition(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
    this.emit('tool-registered', definition.name);
  }

  /**
   * Register a resource with the embedded MCP provider
   * @param definition The resource definition
   */
  registerResource(definition: ResourceDefinition): void {
    this.resources.set(definition.uri, definition);
    this.emit('resource-registered', definition.uri);
  }

  /**
   * Register a resource template with the embedded MCP provider
   * @param definition The resource template definition
   */
  registerResourceTemplate(definition: ResourceTemplateDefinition): void {
    this.resourceTemplates.set(definition.uriTemplate, definition);
    this.emit('resource-template-registered', definition.uriTemplate);
  }

  /**
   * Unregister a tool from the embedded MCP provider
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.emit('tool-unregistered', name);
    }
    return result;
  }

  /**
   * Start the embedded MCP provider
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    // Register all handlers
    this.registerHandlers();

    try {
      // Create the appropriate transport
      if (this.sseConfig.allowExternalConnections) {
        // Use SSE transport for external connections
        this.transport = new SseTransport({
          port: this.sseConfig.port,
          hostname: this.sseConfig.hostname,
          allowExternalConnections: true,
          eventsPath: this.sseConfig.eventsPath,
          apiPath: this.sseConfig.apiPath
        });
      } else {
        // Use SSE transport for localhost only
        this.transport = new SseTransport({
          port: this.sseConfig.port,
          hostname: this.sseConfig.hostname,
          allowExternalConnections: false,
          eventsPath: this.sseConfig.eventsPath,
          apiPath: this.sseConfig.apiPath
        });
      }

      // Set up error handling
      this.transport.onerror = (error) => {
        console.error("Transport error:", error);
        this.emit('error', error);
      };

      this.transport.onclose = () => {
        this.isStarted = false;
        this.serverUrl = undefined;
        this.emit('stopped');
      };

      // Connect the server to the transport
      await this.server.connect(this.transport);

      // Store the server URL for clients to connect to
      const port = this.transport.getPort ? this.transport.getPort() : 0;
      this.serverUrl = new URL(`http://${this.sseConfig.hostname}:${port}`);

      this.isStarted = true;
      this.emit('started', { url: this.serverUrl.toString() });
      console.log(`MCP server started at ${this.serverUrl.toString()}`);
    } catch (error) {
      console.error("Failed to start MCP server:", error);

      // Fall back to mock transport in case of error
      this.serverUrl = new URL(`http://localhost:0`);
      this.isStarted = true;
      this.emit('started', { url: this.serverUrl.toString() });
    }
  }

  /**
   * Stop the embedded MCP provider
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      // Close the server connection
      if (this.transport) {
        await this.transport.close();
      }
    } catch (error) {
      console.error("Error stopping MCP server:", error);
    } finally {
      // Clean up resources
      this.transport = undefined;
      this.serverUrl = undefined;
      this.isStarted = false;
      this.emit('stopped');
    }
  }

  /**
   * Get the URL of the running MCP server
   * @returns The URL of the server, or undefined if not started
   */
  getServerUrl(): URL | undefined {
    return this.serverUrl;
  }

  /**
   * Check if the server is started
   * @returns true if the server is started, false otherwise
   */
  isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Execute a tool directly (without going through the MCP protocol)
   * @param name The name of the tool to execute
   * @param args The arguments to pass to the tool
   * @returns The result of the tool execution
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        content: [{
          type: "text",
          text: `Tool '${name}' not found`
        }],
        isError: true
      };
    }

    try {
      return await tool.handler(args || {});
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
}

/**
 * Mock implementation of the MCP Server for type compatibility
 * This will be replaced with the actual implementation when the MCP SDK is installed
 */
class MockMcpServer {
  constructor(_options: any) {}

  tool(_name: string, _description: string, _schema: any, _handler: any) {}

  connect(_transport: any): Promise<void> {
    return Promise.resolve();
  }
}
````

````
/**
### MockMcpProvider.ts

```typescript
// src/services/mcp/providers/MockMcpProvider.ts

import { EventEmitter } from "events";
import {
  ToolCallResult,
  ToolDefinition,
  IMcpProvider
} from "../types/McpProviderTypes";

/**
 * MockMcpProvider provides a mock implementation of the MCP provider for testing.
 */
export class MockMcpProvider extends EventEmitter implements IMcpProvider {
  private tools: Map<string, ToolDefinition> = new Map();
  private isStarted: boolean = false;
  private serverUrl?: URL;

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.serverUrl = new URL('http://localhost:0');
    this.emit('started', { url: this.serverUrl.toString() });
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;
    this.serverUrl = undefined;
    this.emit('stopped');
  }

  registerToolDefinition(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
    this.emit('tool-registered', definition.name);
  }

  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.emit('tool-unregistered', name);
    }
    return result;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        content: [{
          type: "text",
          text: `Tool '${name}' not found`
        }],
        isError: true
      };
    }

    try {
      return await tool.handler(args || {});
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  getServerUrl(): URL | undefined {
    return this.serverUrl;
  }

  isRunning(): boolean {
    return this.isStarted;
  }
}
````

### RemoteMcpProvider.ts

```typescript
// src/services/mcp/providers/RemoteMcpProvider.ts

import { EventEmitter } from "events"
import { ToolCallResult, ToolDefinition, IMcpProvider } from "../types/McpProviderTypes"
import { SseClientFactory } from "../client/SseClientFactory"

/**
 * RemoteMcpProvider provides a provider for connecting to external MCP servers.
 */
export class RemoteMcpProvider extends EventEmitter implements IMcpProvider {
	private tools: Map<string, ToolDefinition> = new Map()
	private isStarted: boolean = false
	private serverUrl?: URL
	private client?: any

	constructor(private readonly url: URL) {
		super()
		this.serverUrl = url
	}

	async start(): Promise<void> {
		if (this.isStarted) {
			return
		}

		try {
			this.client = await SseClientFactory.createClient(this.serverUrl!)
			this.isStarted = true
			this.emit("started", { url: this.serverUrl!.toString() })
		} catch (error) {
			throw new Error(
				`Failed to connect to remote MCP server: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	async stop(): Promise<void> {
		if (!this.isStarted) {
			return
		}

		try {
			if (this.client) {
				await this.client.close()
			}
		} catch (error) {
			console.error("Error stopping remote MCP client:", error)
		} finally {
			this.client = undefined
			this.isStarted = false
			this.emit("stopped")
		}
	}

	registerToolDefinition(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition)
		this.emit("tool-registered", definition.name)
	}

	unregisterTool(name: string): boolean {
		const result = this.tools.delete(name)
		if (result) {
			this.emit("tool-unregistered", name)
		}
		return result
	}

	async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
		if (!this.isStarted || !this.client) {
			throw new Error("Remote MCP provider not started")
		}

		try {
			const result = await this.client.callTool({
				name,
				arguments: args,
			})

			return {
				content: result.content,
				isError: result.status === "error",
			}
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

	getServerUrl(): URL | undefined {
		return this.serverUrl
	}

	isRunning(): boolean {
		return this.isStarted
	}
}
```

## Transport Components

### SseTransport.ts

````typescript
// src/services/mcp/transport/SseTransport.ts

import { IMcpTransport } from "../types/McpTransportTypes";
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig";

/**
 * SseTransport provides an implementation of the MCP transport using SSE.
 */
export class SseTransport implements IMcpTransport {
  private transport: any;
  private config: SseTransportConfig;

  constructor(config?: SseTransportConfig) {
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };

    try {
      // Try to import the MCP SDK dynamically
      const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
      this.transport = new SSEServerTransport({
        port: this.config.port,
        hostname: this.config.hostname,
        cors: this.config.allowExternalConnections ? { origin: '*' } : { origin: 'localhost' },
        eventsPath: this.config.eventsPath,
        apiPath: this.config.apiPath
      });
    } catch (error) {
      // If the MCP SDK is not installed, use the mock implementation
      console.warn("MCP SDK not found, using mock implementation");
      this.transport = new MockSseServerTransport();
    }
  }

  async start(): Promise<void> {
    // No explicit start method for SSE transport
    return Promise.resolve();
  }

  async close(): Promise<void> {
    if (this.transport && typeof this.transport.close === 'function') {
      await this.transport.close();
    }
  }

  getPort(): number {
    return this.transport.getPort();
  }

  set onerror(handler: (error: Error) => void) {
    if (this.transport && typeof this.transport.onerror === 'function') {
      this.transport.onerror = handler;
    }
  }

  set onclose(handler: () => void) {
### StdioTransport.ts

```typescript
// src/services/mcp/transport/StdioTransport.ts

import { IMcpTransport } from "../types/McpTransportTypes";

/**
 * StdioTransport provides an implementation of the MCP transport using stdio.
 */
export class StdioTransport implements IMcpTransport {
  private transport: any;
  private _stderr?: any;

  constructor(options: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }) {
    try {
      // Try to import the MCP SDK dynamically
      const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
      this.transport = new StdioServerTransport({
        command: options.command,
        args: options.args,
        env: {
          ...options.env,
          ...(process.env.PATH ? { PATH: process.env.PATH } : {})
        },
        stderr: "pipe"
      });
    } catch (error) {
      // If the MCP SDK is not installed, use the mock implementation
      console.warn("MCP SDK not found, using mock implementation");
      this.transport = new MockStdioServerTransport();
    }
  }

  async start(): Promise<void> {
    if (this.transport && typeof this.transport.start === 'function') {
      await this.transport.start();
      this._stderr = this.transport.stderr;
    }
  }

  async close(): Promise<void> {
    if (this.transport && typeof this.transport.close === 'function') {
      await this.transport.close();
    }
  }

  get stderr(): any {
    return this._stderr;
  }

  set onerror(handler: (error: Error) => void) {
    if (this.transport && typeof this.transport.onerror === 'function') {
      this.transport.onerror = handler;
    }
  }

  set onclose(handler: () => void) {
    if (this.transport && typeof this.transport.onclose === 'function') {
      this.transport.onclose = handler;
    }
  }
}

/**
 * Mock implementation of the StdioServerTransport for type compatibility
 * This will be replaced with the actual implementation when the MCP SDK is installed
 */
class MockStdioServerTransport {
  constructor() {}

  start(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  get stderr(): any {
    return undefined;
  }
}
````

## Client Components

### McpClient.ts

```typescript
// src/services/mcp/client/McpClient.ts

/**
 * Base client class for MCP
 */
export abstract class McpClient {
	constructor(protected readonly clientInfo: any) {}

	abstract connect(transport: any): Promise<void>

	abstract close(): Promise<void>

	abstract listTools(): Promise<any>

	abstract callTool(params: any): Promise<any>
}
```

### SseClientFactory.ts

```typescript
// src/services/mcp/client/SseClientFactory.ts

import { McpClient } from "./McpClient"

/**
 * SseClient implementation
 */
class SseClient extends McpClient {
	private client: any

	constructor(clientInfo: any) {
		super(clientInfo)
	}

	async connect(transport: any): Promise<void> {
		this.client = new Client(this.clientInfo)
		await this.client.connect(transport)
	}

	async close(): Promise<void> {
		if (this.client) {
			await this.client.close()
		}
	}

	async listTools(): Promise<any> {
		if (!this.client) {
			throw new Error("Client not connected")
		}
		return this.client.listTools()
	}

	async callTool(params: any): Promise<any> {
		if (!this.client) {
			throw new Error("Client not connected")
		}
		return this.client.callTool(params)
	}
}

/**
 * Factory for creating MCP clients that connect to an SSE server
 */
export class SseClientFactory {
	/**
	 * Create a new MCP client that connects to the specified server URL
	 * @param serverUrl The URL of the MCP server to connect to
	 * @returns A new MCP client
	 */
	public static async createClient(serverUrl: URL): Promise<McpClient> {
		try {
			// Try to import the MCP SDK dynamically
			const { Client } = require("@modelcontextprotocol/sdk/client")
			const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse")

			// Create the client
			const client = new SseClient({
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

/**
 * Mock implementation of the Client class
 */
class MockClient extends McpClient {
	constructor(clientInfo: any) {
		super(clientInfo)
	}

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

// For type compatibility
class Client {
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

## Integration Components

### McpIntegration.ts

````typescript
// src/services/mcp/integration/McpIntegration.ts

import { EventEmitter } from "events";
import { McpToolExecutor } from "../core/McpToolExecutor";
import { McpToolRouter, ToolUseFormat } from "../core/McpToolRouter";
import { ToolDefinition } from "../types/McpProviderTypes";
import { SseTransportConfig } from "../transport/config/SseTransportConfig";
import { EmbeddedMcpProvider } from "../providers/EmbeddedMcpProvider";

/**
 * McpIntegration provides a facade for the MCP integration system.
 * It initializes all the necessary components and provides a simple interface
 * for the rest of the application to interact with the MCP system.
 */
export class McpIntegration extends EventEmitter {
  private static instance: McpIntegration;
  private mcpToolRouter: McpToolRouter;
  private mcpToolExecutor: McpToolExecutor;
  private mcpProvider: EmbeddedMcpProvider;
  private isInitialized: boolean = false;
  private sseConfig?: SseTransportConfig;

  /**
   * Get the singleton instance of the McpIntegration
   * @param config Optional SSE transport configuration
   */
  public static getInstance(config?: SseTransportConfig): McpIntegration {
    if (!McpIntegration.instance) {
      McpIntegration.instance = new McpIntegration(config);
    } else if (config) {
      // Update config if provided
      McpIntegration.instance.sseConfig = config;
    }
    return McpIntegration.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   * @param config Optional SSE transport configuration
   */
  private constructor(config?: SseTransportConfig) {
    super();
    this.sseConfig = config;
    this.mcpProvider = new EmbeddedMcpProvider(config);
    this.mcpToolExecutor = McpToolExecutor.getInstance(this.mcpProvider, config);
    this.mcpToolRouter = McpToolRouter.getInstance(config);

    // Forward events from the MCP tool router
    this.mcpToolRouter.on('tool-registered', (name) => this.emit('tool-registered', name));
    this.mcpToolRouter.on('tool-unregistered', (name) => this.emit('tool-unregistered', name));
    this.mcpToolRouter.on('started', (info) => this.emit('started', info));
    this.mcpToolRouter.on('stopped', () => this.emit('stopped'));
  }

  /**
   * Initialize the MCP integration
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize the MCP tool router
    await this.mcpToolRouter.initialize();
    this.isInitialized = true;
  }

  /**
   * Shutdown the MCP integration
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Shutdown the MCP tool router
    await this.mcpToolRouter.shutdown();
    this.isInitialized = false;
  }

  /**
   * Register a tool with the MCP integration
   * @param definition The tool definition
   */
  public registerTool(definition: ToolDefinition): void {
    this.mcpToolExecutor.registerTool(definition);
  }

  /**
   * Unregister a tool from the MCP integration
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  public unregisterTool(name: string): boolean {
    return this.mcpToolExecutor.unregisterTool(name);
  }

  /**
   * Process a tool use request in XML format
   * @param xmlContent The XML content containing the tool use request
   * @returns The tool result in XML format
   */
  public async processXmlToolUse(xmlContent: string): Promise<string> {
    return this.mcpToolExecutor.processXmlToolUse(xmlContent);
  }

  /**
   * Process a tool use request in JSON format
   * @param jsonContent The JSON content containing the tool use request
   * @returns The tool result in JSON format
   */
  public async processJsonToolUse(jsonContent: string | Record<string, unknown>): Promise<string> {
    return this.mcpToolExecutor.processJsonToolUse(jsonContent);
  }

  /**
   * Process a tool use request in OpenAI function call format
   * @param functionCall The OpenAI function call object
   * @returns The tool result in OpenAI tool result format
   */
  public async processOpenAiFunctionCall(functionCall: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.mcpToolExecutor.processOpenAiFunctionCall(functionCall);
  }

  /**
   * Route a tool use request based on its format
   * @param content The tool use request content
   * @returns The tool result
   */
  public async routeToolUse(content: string | Record<string, unknown>): Promise<string | Record<string, unknown>> {
    // Detect the format
    const format = this.mcpToolRouter.detectFormat(content);

    // Route the request
    const result = await this.mcpToolRouter.routeToolUse({
      format,
      content
    });

    // Return the result
    return result.content;
  }

  /**
   * Get the tool registry
   * @returns The tool registry
   */
  public getToolRegistry(): any {
    return this.mcpToolExecutor.getToolRegistry();
  }

### ProviderIntegration.ts

```typescript
// src/services/mcp/integration/ProviderIntegration.ts

import { EventEmitter } from "events";
import { IMcpProvider } from "../types/McpProviderTypes";
import { McpToolExecutor } from "../core/McpToolExecutor";
import { SseTransportConfig } from "../transport/config/SseTransportConfig";

/**
 * ProviderIntegration provides an integration layer for MCP providers.
 */
export class ProviderIntegration extends EventEmitter {
  private static instance: ProviderIntegration;
  private providers: Map<string, IMcpProvider> = new Map();
  private mcpToolExecutors: Map<string, McpToolExecutor> = new Map();
  private isInitialized: boolean = false;
  private sseConfig?: SseTransportConfig;

  /**
   * Get the singleton instance of the ProviderIntegration
   * @param config Optional SSE transport configuration
   */
  public static getInstance(config?: SseTransportConfig): ProviderIntegration {
    if (!ProviderIntegration.instance) {
      ProviderIntegration.instance = new ProviderIntegration(config);
    } else if (config) {
      // Update config if provided
      ProviderIntegration.instance.sseConfig = config;
    }
    return ProviderIntegration.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   * @param config Optional SSE transport configuration
   */
  private constructor(config?: SseTransportConfig) {
    super();
    this.sseConfig = config;
  }

  /**
   * Initialize the provider integration
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize all providers
    for (const [name, provider] of this.providers.entries()) {
      await provider.start();

      // Create a tool executor for the provider if it doesn't exist
      if (!this.mcpToolExecutors.has(name)) {
        const executor = McpToolExecutor.getInstance(provider, this.sseConfig);
        this.mcpToolExecutors.set(name, executor);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Shutdown the provider integration
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Shutdown all providers
    for (const provider of this.providers.values()) {
      await provider.stop();
    }

    this.isInitialized = false;
  }

  /**
   * Register a provider with the integration
   * @param name The name of the provider
   * @param provider The provider to register
   */
  public registerProvider(name: string, provider: IMcpProvider): void {
    this.providers.set(name, provider);

    // Forward events from the provider
    if (provider instanceof EventEmitter) {
      provider.on('tool-registered', (toolName) => this.emit('tool-registered', name, toolName));
      provider.on('tool-unregistered', (toolName) => this.emit('tool-unregistered', name, toolName));
      provider.on('started', (info) => this.emit('provider-started', name, info));
      provider.on('stopped', () => this.emit('provider-stopped', name));
    }

    // Create a tool executor for the provider if it doesn't exist
    if (!this.mcpToolExecutors.has(name) && provider) {
      const executor = McpToolExecutor.getInstance(provider, this.sseConfig);
      this.mcpToolExecutors.set(name, executor);

      // Forward events from the tool executor
      executor.on('tool-registered', (toolName) => this.emit('tool-registered', name, toolName));
      executor.on('tool-unregistered', (toolName) => this.emit('tool-unregistered', name, toolName));
    }
  }

  /**
   * Unregister a provider from the integration
   * @param name The name of the provider to unregister
   * @returns true if the provider was unregistered, false if it wasn't found
   */
  public unregisterProvider(name: string): boolean {
    const provider = this.providers.get(name);
    if (!provider) {
      return false;
    }

    // Stop the provider if it's running
    if (provider.isRunning()) {
      provider.stop().catch((error) => {
        console.error(`Error stopping provider ${name}:`, error);
      });
    }

    // Remove the provider from the map
    this.providers.delete(name);

    // Remove the tool executor from the map
    this.mcpToolExecutors.delete(name);

    return true;
  }

  /**
   * Get a provider by name
   * @param name The name of the provider to get
   * @returns The provider, or undefined if not found
   */
  public getProvider(name: string): IMcpProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all registered providers
   * @returns A map of provider names to providers
   */
  public getAllProviders(): Map<string, IMcpProvider> {
    return new Map(this.providers);
  }

  /**
   * Get a tool executor by provider name
   * @param name The name of the provider
   * @returns The tool executor, or undefined if not found
   */
  public getToolExecutor(name: string): McpToolExecutor | undefined {
    return this.mcpToolExecutors.get(name);
  }
}
````

### WebviewIntegration.ts

```typescript
// src/services/mcp/integration/WebviewIntegration.ts

import { EventEmitter } from "events"
import { McpHub } from "../management/McpHub"

/**
 * WebviewIntegration provides an integration layer for webview.
 */
export class WebviewIntegration extends EventEmitter {
	private static instance: WebviewIntegration
	private mcpHub?: McpHub

	/**
	 * Get the singleton instance of the WebviewIntegration
	 */
	public static getInstance(): WebviewIntegration {
		if (!WebviewIntegration.instance) {
			WebviewIntegration.instance = new WebviewIntegration()
		}
		return WebviewIntegration.instance
	}

	/**
	 * Private constructor to enforce singleton pattern
	 */
	private constructor() {
		super()
	}

	/**
	 * Set the McpHub instance
	 * @param hub The McpHub instance
	 */
	public setMcpHub(hub: McpHub): void {
		this.mcpHub = hub

		// Forward events from the McpHub
		hub.on("tool-registered", (name) => this.emit("tool-registered", name))
		hub.on("tool-unregistered", (name) => this.emit("tool-unregistered", name))
		hub.on("started", (info) => this.emit("started", info))
		hub.on("stopped", () => this.emit("stopped"))
	}

	/**
	 * Get the McpHub instance
	 * @returns The McpHub instance
	 */
	public getMcpHub(): McpHub | undefined {
		return this.mcpHub
	}

	/**
	 * Get all servers
	 * @returns An array of server objects
	 */
	public getAllServers(): any[] {
		return this.mcpHub?.getAllServers() || []
	}

	/**
	 * Update server timeout
	 * @param serverName The name of the server
	 * @param timeout The timeout in seconds
	 */
	public async updateServerTimeout(serverName: string, timeout: number): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.updateServerTimeout(serverName, timeout)
		} else {
			throw new Error("McpHub not available")
		}
	}

	/**
	 * Delete a server
	 * @param serverName The name of the server
	 */
	public async deleteServer(serverName: string): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.deleteServer(serverName)
		} else {
			throw new Error("McpHub not available")
		}
	}

	/**
	 * Toggle server disabled state
	 * @param serverName The name of the server
	 * @param disabled Whether the server should be disabled
	 */
	public async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.toggleServerDisabled(serverName, disabled)
		} else {
			throw new Error("McpHub not available")
		}
	}

	/**
	 * Restart a server connection
	 * @param serverName The name of the server
	 */
	public async restartConnection(serverName: string): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.restartConnection(serverName)
		} else {
			throw new Error("McpHub not available")
		}
	}
}
```

## Management Components

### McpHub.ts

The McpHub class is quite large and complex. Here's a simplified version with the key changes:

```typescript
// src/services/mcp/management/McpHub.ts

import { EventEmitter } from "events"
import { McpConnection, ServerConfigSchema } from "../types/McpManagementTypes"
import { SseClientFactory } from "../client/SseClientFactory"

/**
 * McpHub manages MCP server connections.
 */
export class McpHub extends EventEmitter {
	private providerRef: WeakRef<any>
	private disposables: any[] = []
	private settingsWatcher?: any
	private fileWatchers: Map<string, any[]> = new Map()
	private projectMcpWatcher?: any
	private isDisposed: boolean = false
	connections: McpConnection[] = []
	isConnecting: boolean = false

	// ... rest of the implementation with updated references
}
```

### McpServerManager.ts

```typescript
// src/services/mcp/management/McpServerManager.ts

import * as vscode from "vscode"
import { McpHub } from "./McpHub"

/**
 * Singleton manager for MCP server instances.
 * Ensures only one set of MCP servers runs across all webviews.
 */
export class McpServerManager {
	private static instance: McpHub | null = null
	private static readonly GLOBAL_STATE_KEY = "mcpHubInstanceId"
	private static providers: Set<any> = new Set()
	private static initializationPromise: Promise<McpHub> | null = null

	/**
	 * Get the singleton McpHub instance.
	 * Creates a new instance if one doesn't exist.
	 * Thread-safe implementation using a promise-based lock.
	 */
	static async getInstance(context: vscode.ExtensionContext, provider: any): Promise<McpHub> {
		// Register the provider
		this.providers.add(provider)

		// If we already have an instance, return it
		if (this.instance) {
			return this.instance
		}

		// If initialization is in progress, wait for it
		if (this.initializationPromise) {
			return this.initializationPromise
		}

		// Create a new initialization promise
		this.initializationPromise = (async () => {
			try {
				// Double-check instance in case it was created while we were waiting
				if (!this.instance) {
					this.instance = new McpHub(provider)
					// Store a unique identifier in global state to track the primary instance
					await context.globalState.update(this.GLOBAL_STATE_KEY, Date.now().toString())
				}
				return this.instance
			} finally {
				// Clear the initialization promise after completion or error
				this.initializationPromise = null
			}
		})()

		return this.initializationPromise
	}

	/**
	 * Remove a provider from the tracked set.
	 * This is called when a webview is disposed.
	 */
	static unregisterProvider(provider: any): void {
		this.providers.delete(provider)
	}

	/**
	 * Notify all registered providers of server state changes.
	 */
	static notifyProviders(message: any): void {
		this.providers.forEach((provider) => {
			provider.postMessageToWebview(message).catch((error: any) => {
				console.error("Failed to notify provider:", error)
			})
		})
	}

	/**
	 * Clean up the singleton instance and all its resources.
	 */
	static async cleanup(context: vscode.ExtensionContext): Promise<void> {
		if (this.instance) {
			await this.instance.dispose()
			this.instance = null
			await context.globalState.update(this.GLOBAL_STATE_KEY, undefined)
		}
		this.providers.clear()
	}
}
```

## External References

### TheaMcpManager.ts

```typescript
// src/core/webview/mcp/TheaMcpManager.ts

import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import fs from "fs/promises"

import { McpHub } from "../../../services/mcp/management/McpHub"
import { WebviewIntegration } from "../../../services/mcp/integration/WebviewIntegration"

/**
 * Manages interactions with the McpHub for Model Control Protocol services.
 */
export class TheaMcpManager {
	private webviewIntegration: WebviewIntegration

	constructor(private readonly context: vscode.ExtensionContext) {
		this.webviewIntegration = WebviewIntegration.getInstance()
	}

	/**
	 * Sets the shared McpHub instance. Called by TheaProvider.
	 */
	setMcpHub(hub: McpHub | undefined): void {
		if (hub) {
			this.webviewIntegration.setMcpHub(hub)
		}
	}

	/**
	 * Gets the McpHub instance.
	 */
	getMcpHub(): McpHub | undefined {
		return this.webviewIntegration.getMcpHub()
	}

	// ... rest of the implementation with updated references
}
```

## Test Updates

### McpToolExecutor.test.ts

```typescript
// src/services/mcp/__tests__/McpToolExecutor.test.ts

import { McpToolExecutor } from "../core/McpToolExecutor"
import { MockMcpProvider } from "../providers/MockMcpProvider"

describe("McpToolExecutor", () => {
	let mcpToolExecutor: McpToolExecutor
	let mockProvider: MockMcpProvider

	beforeEach(() => {
		mockProvider = new MockMcpProvider()
		mcpToolExecutor = McpToolExecutor.getInstance(mockProvider)
	})

	// ... test implementations
})
```

### EmbeddedMcpProvider.test.ts

```typescript
// src/services/mcp/__tests__/EmbeddedMcpProvider.test.ts

import { EmbeddedMcpProvider } from "../providers/EmbeddedMcpProvider"

describe("EmbeddedMcpProvider", () => {
	let provider: EmbeddedMcpProvider

	beforeEach(() => {
		provider = new EmbeddedMcpProvider()
	})

	// ... test implementations
})
```

### McpIntegration.test.ts

```typescript
// src/services/mcp/__tests__/McpIntegration.test.ts

import { McpIntegration } from "../integration/McpIntegration"

describe("McpIntegration", () => {
	let mcpIntegration: McpIntegration

	beforeEach(() => {
		mcpIntegration = McpIntegration.getInstance()
	})

	// ... test implementations
})
```

/\*\*

- Get the server URL if the MCP server is running
- @returns The URL of the server, or undefined if not started
  \*/
  public getServerUrl(): URL | undefined {
  return this.mcpToolExecutor.getServerUrl();
  }
  }

```
    if (this.transport && typeof this.transport.onclose === 'function') {
      this.transport.onclose = handler;
    }
  }
}

/**
 * Mock implementation of the SSEServerTransport for type compatibility
 * This will be replaced with the actual implementation when the MCP SDK is installed
 */
class MockSseServerTransport {
  constructor(_options?: any) {}

  getPort(): number {
    return 0;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
```

- Interface for transport
  \*/
  export interface IMcpTransport {
  start(): Promise<void>;
  close(): Promise<void>;
  getPort?(): number;
  onerror?: (error: Error) => void;
  onclose?: () => void;
  }

```
/**
 * Interface for tool result with format information
 */
export interface ToolResultWithFormat {
  format: ToolUseFormat;
  content: string | Record<string, unknown>;
}
```
