import { IMcpTransport } from "../types/McpTransportTypes";
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig";

/**
 * SseTransport provides an implementation of the MCP transport using SSE.
 * Requires the @modelcontextprotocol/sdk package to be installed.
 */
export class SseTransport implements IMcpTransport {
  private transport: any;
  private config: SseTransportConfig;

  constructor(config?: SseTransportConfig) {
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };

    try {
      const sdk = require("@modelcontextprotocol/sdk/dist/cjs/server/sse.js");
      if (!sdk || !sdk.SSEServerTransport) {
        throw new Error("MCP SDK SSEServerTransport not found");
      }
      
      this.transport = new sdk.SSEServerTransport({
        port: this.config.port,
        hostname: this.config.hostname,
        cors: this.config.allowExternalConnections ? { origin: "*" } : { origin: "localhost" },
        eventsPath: this.config.eventsPath,
        apiPath: this.config.apiPath,
      });
    } catch (error) {
      const msg = `Failed to initialize MCP SDK: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  async start(): Promise<void> {
    // SSE transport does not require explicit start
    return Promise.resolve();
  }

  async close(): Promise<void> {
    if (this.transport?.close) {
      await this.transport.close();
    }
  }

  getPort(): number {
    // Get the port from the SDK transport
    if (!this.transport.getPort) {
      throw new Error("MCP SDK transport does not implement getPort()");
    }

    const port = this.transport.getPort();
    if (typeof port !== 'number' || port === 0) {
      throw new Error(`Invalid port returned from MCP SDK: ${port}`);
    }

    return port;
  }

  public set onerror(handler: (error: Error) => void) {
    if (this.transport) {
      this.transport.onerror = handler;
    }
  }

  public set onclose(handler: () => void) {
    if (this.transport) {
      this.transport.onclose = handler;
    }
  }

}
