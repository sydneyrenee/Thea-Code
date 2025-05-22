import { ToolDefinition, ToolCallResult } from "../types/McpProviderTypes";
import { EventEmitter } from "events";

/**
 * McpToolRegistry serves as a central registry for all tools in the system.
 * It provides a unified interface for registering tools that can be used by
 * both the embedded MCP server and the JSON-XML bridge.
 */
export class McpToolRegistry extends EventEmitter {
  private tools: Map<string, ToolDefinition> = new Map();
  private static instance: McpToolRegistry;

  /**
   * Get the singleton instance of the McpToolRegistry
   */
  public static getInstance(): McpToolRegistry {
    if (!McpToolRegistry.instance) {
      McpToolRegistry.instance = new McpToolRegistry();
    }
    return McpToolRegistry.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
  }

  /**
   * Register a tool with the registry
   * @param definition The tool definition
   */
  public registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
    this.emit('tool-registered', definition.name);
  }

  /**
   * Unregister a tool from the registry
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  public unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.emit('tool-unregistered', name);
    }
    return result;
  }

  /**
   * Get a tool by name
   * @param name The name of the tool to get
   * @returns The tool definition, or undefined if not found
   */
  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   * @returns A map of tool names to tool definitions
   */
  public getAllTools(): Map<string, ToolDefinition> {
    return new Map(this.tools);
  }

  /**
   * Check if a tool exists
   * @param name The name of the tool to check
   * @returns true if the tool exists, false otherwise
   */
  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   * @param name The name of the tool to execute
   * @param args The arguments to pass to the tool
   * @returns The result of the tool execution
   */
  public async executeTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    try {
      return await tool.handler(args);
    } catch (error) {
      throw new Error(`Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}