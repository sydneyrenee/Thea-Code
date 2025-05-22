import { EventEmitter } from "events";
import {
  ToolCallResult,
  ToolDefinition,
  IMcpProvider,
} from "../types/McpProviderTypes";

/**
 * MockMcpProvider provides a mock implementation of the MCP provider for testing.
 */
export class MockMcpProvider extends EventEmitter implements IMcpProvider {
  private tools: Map<string, ToolDefinition> = new Map();
  private isStarted = false;
  private serverUrl?: URL;

  constructor() {
    super();
  }

  start(): void {
    if (this.isStarted) {
      return;
    }
    this.isStarted = true;
    this.serverUrl = new URL("http://localhost:0");
    this.emit("started", { url: this.serverUrl.toString() });
  }

  stop(): void {
    if (!this.isStarted) {
      return;
    }
    this.isStarted = false;
    this.serverUrl = undefined;
    this.emit("stopped");
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
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool '${name}' not found` }],
        isError: true,
      };
    }
    try {
      return await tool.handler(args || {});
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
