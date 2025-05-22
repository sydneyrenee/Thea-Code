import { IMcpTransport } from "../types/McpTransportTypes";
import { StdioTransportConfig } from "../types/McpTransportTypes";

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
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

/**
 * StdioTransport provides an implementation of the MCP transport using stdio.
 */
export class StdioTransport implements IMcpTransport {
  private transport: unknown;
  private _stderr?: unknown;

  constructor(options: StdioTransportConfig) {
    try {
      const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
      this.transport = new StdioServerTransport({
        command: options.command,
        args: options.args,
        env: {
          ...options.env,
          ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
        },
        stderr: "pipe",
      });
    } catch {
      console.warn("MCP SDK not found, using mock implementation");
      this.transport = new MockStdioServerTransport();
    }
  }

  async start(): Promise<void> {
    if (this.transport && typeof (this.transport as any).start === "function") {
      await (this.transport as any).start();
      this._stderr = (this.transport as any).stderr;
    }
  }

  async close(): Promise<void> {
    if (this.transport && typeof (this.transport as any).close === "function") {
      await (this.transport as any).close();
    }
  }

  getPort(): number | undefined {
    return undefined;
  }

  get stderr(): unknown {
    return this._stderr;
  }

  set onerror(handler: (error: Error) => void) {
    if (this.transport) {
      (this.transport as any).onerror = handler;
    }
  }

  set onclose(handler: () => void) {
    if (this.transport) {
      (this.transport as any).onclose = handler;
    }
  }
}
