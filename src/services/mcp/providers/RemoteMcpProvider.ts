import { EventEmitter } from "events";
import {
  ToolCallResult,
  ToolDefinition,
  IMcpProvider,
} from "../types/McpProviderTypes";
import { SseClientFactory } from "../client/SseClientFactory";
import { McpClient } from "../client/McpClient";

/**
 * RemoteMcpProvider provides a provider for connecting to external MCP servers.
 */
export class RemoteMcpProvider extends EventEmitter implements IMcpProvider {
  private tools: Map<string, ToolDefinition> = new Map();
  private isStarted = false;
  private serverUrl?: URL;
  private client?: McpClient;

  constructor(private readonly url: URL) {
    super();
    this.serverUrl = url;
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }
    try {
      this.client = await SseClientFactory.createClient(this.serverUrl!);
      this.isStarted = true;
      this.emit("started", { url: this.serverUrl!.toString() });
    } catch (error) {
      throw new Error(`Failed to connect to remote MCP server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch (error) {
      console.error("Error stopping remote MCP client:", error);
    } finally {
      this.client = undefined;
      this.isStarted = false;
      this.emit("stopped");
    }
  }

  registerToolDefinition(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
    this.emit("tool-registered", definition.name);
  }

  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.emit("tool-unregistered", name);
    }
    return result;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (!this.isStarted || !this.client) {
      throw new Error("Remote MCP provider not started");
    }
    try {
      interface ToolCallResponse { content: Array<{ type: string; text?: string }>; status?: string }
      const result = await this.client.callTool({ name, arguments: args }) as ToolCallResponse;
      return { content: result.content, isError: result.status === "error" };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
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
