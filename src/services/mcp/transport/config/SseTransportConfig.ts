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

/**
 * Default configuration for the SSE transport
 */
export const DEFAULT_SSE_CONFIG: SseTransportConfig = {
  port: 0, // Use a random available port
  hostname: 'localhost',
  allowExternalConnections: false,
  eventsPath: '/mcp/events',
  apiPath: '/mcp/api'
};