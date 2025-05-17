import { EventEmitter } from "events"
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig";

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
 * EmbeddedMcpServer provides a local MCP server implementation that hosts tools
 * from various sources including XML and JSON tool definitions.
 * 
 * This server acts as a unified tool system that can be used by models
 * regardless of whether they use XML or JSON formats for tool calls.
 */
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

/**
 * Mock implementation of the StdioServerTransport for type compatibility
 * This will be replaced with the actual implementation when the MCP SDK is installed
 */
class MockStdioServerTransport {
  constructor() {}
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

export class EmbeddedMcpServer extends EventEmitter {
  private server: any
  private tools: Map<string, ToolDefinition> = new Map()
  private resources: Map<string, ResourceDefinition> = new Map()
  private resourceTemplates: Map<string, ResourceTemplateDefinition> = new Map()
  private isStarted: boolean = false
  private transport?: any
  private sseConfig: SseTransportConfig
  private serverUrl?: URL

  /**
   * Create a new embedded MCP server
   * @param config Optional SSE transport configuration
   */
  constructor(config?: SseTransportConfig) {
    super()
    
    this.sseConfig = { ...DEFAULT_SSE_CONFIG, ...config };
    
    try {
      // Try to import the MCP SDK dynamically
      const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
      this.server = new McpServer({
        name: "EmbeddedMcpServer",
        version: "1.0.0"
      });
    } catch (error) {
      // If the MCP SDK is not installed, use the mock implementation
      console.warn("MCP SDK not found, using mock implementation");
      this.server = new MockMcpServer({
        name: "EmbeddedMcpServer",
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
    const paramRegex = /{([^}]+)}/g
    const params: string[] = []
    let match
    
    while ((match = paramRegex.exec(template)) !== null) {
      params.push(match[1])
    }
    
    return params
  }

  /**
   * Match a URI against a URI template and extract parameters
   * @param template The URI template with {param} placeholders
   * @param uri The actual URI to match
   * @returns A map of parameter names to values, or null if no match
   */
  private matchUriTemplate(template: string, uri: string): Record<string, string> | null {
    // Convert template to regex by replacing {param} with named capture groups
    const regexStr = template.replace(/{([^}]+)}/g, '(?<$1>[^/]+)')
    const regex = new RegExp(`^${regexStr}$`)
    
    const match = regex.exec(uri)
    if (!match || !match.groups) {
      return null
    }
    
    return match.groups
  }

  /**
   * Register a tool with the embedded MCP server using a definition object
   * @param definition The tool definition
   */
  registerToolDefinition(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition)
    this.emit('tool-registered', definition.name)
  }

  /**
   * Register a resource with the embedded MCP server
   * @param definition The resource definition
   */
  registerResource(definition: ResourceDefinition): void {
    this.resources.set(definition.uri, definition)
    this.emit('resource-registered', definition.uri)
  }

  /**
   * Register a resource template with the embedded MCP server
   * @param definition The resource template definition
   */
  registerResourceTemplate(definition: ResourceTemplateDefinition): void {
    this.resourceTemplates.set(definition.uriTemplate, definition)
    this.emit('resource-template-registered', definition.uriTemplate)
  }

  /**
   * Unregister a tool from the embedded MCP server
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name)
    if (result) {
      this.emit('tool-unregistered', name)
    }
    return result
  }

  /**
   * Unregister a resource from the embedded MCP server
   * @param uri The URI of the resource to unregister
   * @returns true if the resource was unregistered, false if it wasn't found
   */
  unregisterResource(uri: string): boolean {
    const result = this.resources.delete(uri)
    if (result) {
      this.emit('resource-unregistered', uri)
    }
    return result
  }

  /**
   * Unregister a resource template from the embedded MCP server
   * @param uriTemplate The URI template of the resource template to unregister
   * @returns true if the resource template was unregistered, false if it wasn't found
   */
  unregisterResourceTemplate(uriTemplate: string): boolean {
    const result = this.resourceTemplates.delete(uriTemplate)
    if (result) {
      this.emit('resource-template-unregistered', uriTemplate)
    }
    return result
  }

  /**
   * Start the embedded MCP server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }
    
    // Register all handlers
    this.registerHandlers();
    
    try {
      // Try to import the MCP SDK dynamically
      if (this.sseConfig.allowExternalConnections) {
        // Use SSE transport for external connections
        const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
        this.transport = new SSEServerTransport({
          port: this.sseConfig.port,
          hostname: this.sseConfig.hostname,
          cors: { origin: '*' },
          eventsPath: this.sseConfig.eventsPath,
          apiPath: this.sseConfig.apiPath
        });
      } else {
        // Use SSE transport for localhost only
        const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
        this.transport = new SSEServerTransport({
          port: this.sseConfig.port,
          hostname: this.sseConfig.hostname,
          cors: { origin: 'localhost' },
          eventsPath: this.sseConfig.eventsPath,
          apiPath: this.sseConfig.apiPath
        });
      }
      
      // Connect the server to the transport
      await this.server.connect(this.transport);
      
      // Store the server URL for clients to connect to
      const port = this.transport.getPort();
      this.serverUrl = new URL(`http://${this.sseConfig.hostname}:${port}`);
      
      this.isStarted = true;
      this.emit('started', { url: this.serverUrl.toString() });
      console.log(`MCP server started at ${this.serverUrl.toString()}`);
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      
      // Fall back to mock transport in case of error
      this.transport = new MockSseServerTransport();
      this.serverUrl = new URL(`http://localhost:0`);
      this.isStarted = true;
      this.emit('started', { url: this.serverUrl.toString() });
    }
  }

  /**
   * Stop the embedded MCP server
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }
    
    try {
      // Close the server connection
      if (this.transport && typeof this.transport.close === 'function') {
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
   * Get all registered tools
   * @returns A map of tool names to tool definitions
   */
  getTools(): Map<string, ToolDefinition> {
    return new Map(this.tools)
  }

  /**
   * Get all registered resources
   * @returns A map of resource URIs to resource definitions
   */
  getResources(): Map<string, ResourceDefinition> {
    return new Map(this.resources)
  }

  /**
   * Get all registered resource templates
   * @returns A map of resource template URIs to resource template definitions
   */
  getResourceTemplates(): Map<string, ResourceTemplateDefinition> {
    return new Map(this.resourceTemplates)
  }

  /**
   * Check if the server is started
   * @returns true if the server is started, false otherwise
   */
  isRunning(): boolean {
    return this.isStarted
  }

  /**
   * Execute a tool directly (without going through the MCP protocol)
   * @param name The name of the tool to execute
   * @param args The arguments to pass to the tool
   * @returns The result of the tool execution
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const tool = this.tools.get(name)
    
    if (!tool) {
      return {
        content: [{
          type: "text",
          text: `Tool '${name}' not found`
        }],
        isError: true
      }
    }

    try {
      return await tool.handler(args || {})
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      }
    }
  }

  /**
   * Register a tool with the embedded MCP server
   * @param name The name of the tool
   * @param description The description of the tool
   * @param paramSchema The schema for the tool's parameters
   * @param handler The function that handles the tool execution
   */
  registerTool(
    name: string,
    description: string,
    paramSchema: Record<string, any>,
    handler: (args: Record<string, unknown>) => Promise<ToolCallResult>
  ): void {
    this.tools.set(name, {
      name,
      description,
      paramSchema,
      handler
    });
    
    // If the server is already started, register the tool directly
    if (this.isStarted) {
      try {
        this.server.tool(
          name,
          description,
          paramSchema,
          async (args: any) => {
            try {
              return await handler(args);
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
    
    this.emit('tool-registered', name);
  }

  /**
   * Access a resource directly (without going through the MCP protocol)
   * @param uri The URI of the resource to access
   * @returns The resource content
   */
  async accessResource(uri: string): Promise<{
    content: string | Buffer
    mimeType?: string
  }> {
    const resource = this.resources.get(uri)
    
    if (!resource) {
      // Check if this URI matches any resource template
      for (const [template, definition] of this.resourceTemplates.entries()) {
        const match = this.matchUriTemplate(template, uri)
        if (match) {
          try {
            const content = await definition.handler(match)
            return {
              content,
              mimeType: definition.mimeType
            }
          } catch (error) {
            throw new Error(`Error reading resource template '${template}': ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      
      throw new Error(`Resource '${uri}' not found`)
    }

    try {
      const content = await resource.handler()
      return {
        content,
        mimeType: resource.mimeType
      }
    } catch (error) {
      throw new Error(`Error reading resource '${uri}': ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}