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
  name: string;
  description?: string;
  paramSchema?: Record<string, any>; // JSON Schema for parameters
  handler: (args: Record<string, unknown>) => Promise<ToolCallResult>;
}

/**
 * Interface for resource definitions that can be registered with the embedded MCP server
 */
export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  handler: () => Promise<string | Buffer>;
}

/**
 * Interface for resource template definitions that can be registered with the embedded MCP server
 */
export interface ResourceTemplateDefinition {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: (params: Record<string, string>) => Promise<string | Buffer>;
}

/**
 * Interface for MCP provider (Server implementation)
 */
export interface IMcpProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerToolDefinition(definition: ToolDefinition): void;
  unregisterTool(name: string): boolean;
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  getServerUrl(): URL | undefined;
  isRunning(): boolean;
  // Add other methods as needed (e.g., for resources)
}