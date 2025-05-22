import { IMcpTransport } from "../types/McpTransportTypes";
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig";

/**
 * SseTransport provides an implementation of the MCP transport using SSE.
 * Requires the @modelcontextprotocol/sdk package to be installed.
 */
interface SSEServerTransportLike {
  close(): Promise<void>;
  getPort(): number;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

export class SseTransport implements IMcpTransport {
  private transport?: SSEServerTransportLike;
  private readonly config: SseTransportConfig;

  constructor(config?: SseTransportConfig) {
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };
  }

  private async initTransport(): Promise<void> {
    if (this.transport) {
      return;
    }
    try {
      const { SSEServerTransport } = (await import("@modelcontextprotocol/sdk/dist/cjs/server/sse.js")) as {
        SSEServerTransport: new (opts: SseTransportConfig) => SSEServerTransportLike;
      };
      const Transport = SSEServerTransport;
      this.transport = new Transport({
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
    await this.initTransport();
  }

  async close(): Promise<void> {
    if (this.transport?.close) {
      await this.transport.close();
    }
  }

  getPort(): number {
    if (!this.transport) {
      throw new Error("Transport not initialized");
    }
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
