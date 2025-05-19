import { IMcpTransport } from "../types/McpTransportTypes";
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig";

/**
 * Mock implementation of the SSEServerTransport for type compatibility
 * This will be replaced with the actual implementation when the MCP SDK is installed
 */
class MockSseServerTransport {
  private port: number
  constructor(_options?: any) {
    this.port = Math.floor(Math.random() * 50000) + 10000
  }
  getPort(): number {
    return this.port
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

/**
 * SseTransport provides an implementation of the MCP transport using SSE.
 */
export class SseTransport implements IMcpTransport {
  private transport: any;
  private config: SseTransportConfig;

  constructor(config?: SseTransportConfig) {
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };

    try {
      const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
      this.transport = new SSEServerTransport({
        port: this.config.port,
        hostname: this.config.hostname,
        cors: this.config.allowExternalConnections ? { origin: "*" } : { origin: "localhost" },
        eventsPath: this.config.eventsPath,
        apiPath: this.config.apiPath,
      });
    } catch {
      console.warn("MCP SDK not found, using mock implementation");
      this.transport = new MockSseServerTransport();
    }
  }

  async start(): Promise<void> {
    // SSE transport does not require explicit start
    return Promise.resolve();
  }

  async close(): Promise<void> {
    if (this.transport && typeof this.transport.close === "function") {
      await this.transport.close();
    }
  }

  getPort(): number {
    return this.transport.getPort();
  }

  set onerror(handler: (error: Error) => void) {
    if (this.transport) {
      this.transport.onerror = handler;
    }
  }

  set onclose(handler: () => void) {
    if (this.transport) {
      this.transport.onclose = handler;
    }
  }
}
