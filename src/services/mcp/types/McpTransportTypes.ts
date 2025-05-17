// src/services/mcp/types/McpTransportTypes.ts

/**
 * Configuration options for the SSE transport
 * (Moved from config/SseTransportConfig.ts during refactoring)
 */
export interface SseTransportConfig {
  port?: number;
  hostname?: string;
  allowExternalConnections?: boolean;
  eventsPath?: string;
  apiPath?: string;
}

/**
 * Interface for MCP transport layer
 */
export interface IMcpTransport {
  start(): Promise<void>;
  close(): Promise<void>;
  getPort?(): number; // Optional as StdioTransport might not have a port
  onerror?: (error: Error) => void;
  onclose?: () => void;
  // Add other transport-specific methods/properties if needed
}

// Add StdioTransportConfig if needed
export interface StdioTransportConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}