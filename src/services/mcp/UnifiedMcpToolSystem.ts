import { EventEmitter } from "events";
import { ToolDefinition, ToolCallResult, EmbeddedMcpServer } from "./EmbeddedMcpServer";
import { McpToolRegistry } from "./McpToolRegistry";
import { 
  jsonToolUseToXml, 
  xmlToolUseToJson, 
  openAiFunctionCallToNeutralToolUse,
  neutralToolUseToOpenAiFunctionCall
} from "../../utils/json-xml-bridge";
import { SseTransportConfig } from "./config/SseTransportConfig";

/**
 * Interface for tool use request in a neutral format
 */
export interface NeutralToolUseRequest {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Interface for tool result in a neutral format
 */
export interface NeutralToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  status: 'success' | 'error';
  error?: {
    message: string;
    details?: unknown;
  };
}

/**
 * UnifiedMcpToolSystem provides a unified interface for tool use across different AI models.
 * It leverages the Model Context Protocol (MCP) as the underlying mechanism for tool execution,
 * while providing converters for both XML and JSON formats.
 */
export class UnifiedMcpToolSystem extends EventEmitter {
  private static instance: UnifiedMcpToolSystem;
  private mcpServer: EmbeddedMcpServer;
  private toolRegistry: McpToolRegistry;
  private isInitialized: boolean = false;
  private sseConfig?: SseTransportConfig;

  /**
   * Get the singleton instance of the UnifiedMcpToolSystem
   * @param config Optional SSE transport configuration
   */
  public static getInstance(config?: SseTransportConfig): UnifiedMcpToolSystem {
    if (!UnifiedMcpToolSystem.instance) {
      UnifiedMcpToolSystem.instance = new UnifiedMcpToolSystem(config);
    } else if (config) {
      // Update config if provided
      UnifiedMcpToolSystem.instance.sseConfig = config;
    }
    return UnifiedMcpToolSystem.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   * @param config Optional SSE transport configuration
   */
  private constructor(config?: SseTransportConfig) {
    super();
    this.sseConfig = config;
    this.mcpServer = new EmbeddedMcpServer(config);
    this.toolRegistry = McpToolRegistry.getInstance();
    
    // Forward events from the MCP server
    this.mcpServer.on('tool-registered', (name) => this.emit('tool-registered', name));
    this.mcpServer.on('tool-unregistered', (name) => this.emit('tool-unregistered', name));
    this.mcpServer.on('started', (info) => this.emit('started', info));
    this.mcpServer.on('stopped', () => this.emit('stopped'));
  }

  /**
   * Initialize the unified tool system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Start the MCP server
    await this.mcpServer.start();
    this.isInitialized = true;
  }

  /**
   * Shutdown the unified tool system
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Stop the MCP server
    await this.mcpServer.stop();
    this.isInitialized = false;
  }

  /**
   * Register a tool with the unified tool system
   * @param definition The tool definition
   */
  public registerTool(definition: ToolDefinition): void {
    // Register with both the MCP server and the tool registry
    this.mcpServer.registerToolDefinition(definition);
    this.toolRegistry.registerTool(definition);
  }

  /**
   * Unregister a tool from the unified tool system
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  public unregisterTool(name: string): boolean {
    // Unregister from both the MCP server and the tool registry
    const mcpResult = this.mcpServer.unregisterTool(name);
    const registryResult = this.toolRegistry.unregisterTool(name);
    
    return mcpResult && registryResult;
  }

  /**
   * Process a tool use request in XML format
   * @param xmlContent The XML content containing the tool use request
   * @returns The tool result in XML format
   */
  public async processXmlToolUse(xmlContent: string): Promise<string> {
    try {
      // Convert XML to neutral format
      const jsonString = xmlToolUseToJson(xmlContent);
      const toolUseRequest = JSON.parse(jsonString) as NeutralToolUseRequest;
      
      // Execute the tool
      const result = await this.executeToolFromNeutralFormat(toolUseRequest);
      
      // Convert result back to XML
      return this.convertToolResultToXml(result);
    } catch (error) {
      // Handle errors
      const errorResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'error',
        content: [{
          type: 'text',
          text: `Error processing XML tool use: ${error instanceof Error ? error.message : String(error)}`
        }],
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      };
      
      return this.convertToolResultToXml(errorResult);
    }
  }

  /**
   * Process a tool use request in JSON format
   * @param jsonContent The JSON content containing the tool use request
   * @returns The tool result in JSON format
   */
  public async processJsonToolUse(jsonContent: string | Record<string, unknown>): Promise<string> {
    try {
      let toolUseRequest: NeutralToolUseRequest;
      
      if (typeof jsonContent === 'string') {
        toolUseRequest = JSON.parse(jsonContent) as NeutralToolUseRequest;
      } else {
        // Ensure the object has the required properties before casting
        if (!('type' in jsonContent && 'id' in jsonContent && 'name' in jsonContent && 'input' in jsonContent)) {
          throw new Error('Invalid tool use request format: missing required properties');
        }
        toolUseRequest = {
          type: 'tool_use',
          id: String(jsonContent.id),
          name: String(jsonContent.name),
          input: jsonContent.input as Record<string, unknown>
        };
      }
      
      // Execute the tool
      const result = await this.executeToolFromNeutralFormat(toolUseRequest);
      
      // Return result in JSON format
      return JSON.stringify(result);
    } catch (error) {
      // Handle errors
      const errorResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'error',
        content: [{
          type: 'text',
          text: `Error processing JSON tool use: ${error instanceof Error ? error.message : String(error)}`
        }],
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      };
      
      return JSON.stringify(errorResult);
    }
  }

  /**
   * Process a tool use request in OpenAI function call format
   * @param functionCall The OpenAI function call object
   * @returns The tool result in OpenAI tool result format
   */
  public async processOpenAiFunctionCall(functionCall: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      // Convert OpenAI function call to neutral format
      const toolUseRequest = openAiFunctionCallToNeutralToolUse(functionCall);
      
      if (!toolUseRequest) {
        throw new Error('Invalid function call format');
      }
      
      // Execute the tool
      const result = await this.executeToolFromNeutralFormat(toolUseRequest);
      
      // Convert result to OpenAI format
      return {
        role: 'tool',
        tool_call_id: result.tool_use_id,
        content: result.content.map(item => item.text).join('\n')
      };
    } catch (error) {
      // Handle errors
      return {
        role: 'tool',
        tool_call_id: 'error',
        content: `Error processing OpenAI function call: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Execute a tool from a neutral format request
   * @param request The tool use request in neutral format
   * @returns The tool result in neutral format
   */
  public async executeToolFromNeutralFormat(request: NeutralToolUseRequest): Promise<NeutralToolResult> {
    const { name, input, id } = request;
    
    try {
      // Execute the tool using the MCP server
      const result = await this.mcpServer.executeTool(name, input);
      
      // Convert the result to neutral format
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: result.content,
        status: result.isError ? 'error' : 'success',
        error: result.isError ? {
          message: result.content[0]?.text || 'Unknown error'
        } : undefined
      };
    } catch (error) {
      // Handle errors
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: [{
          type: 'text',
          text: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`
        }],
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Convert a tool result in neutral format to XML
   * @param result The tool result in neutral format
   * @returns The tool result in XML format
   */
  private convertToolResultToXml(result: NeutralToolResult): string {
    return `<tool_result tool_use_id="${result.tool_use_id}" status="${result.status}">\n${
      result.content.map(item => {
        if (item.type === 'text') {
          return item.text;
        } else if (item.type === 'image') {
          const source = (item as any).source;
          return `<image type="${source.media_type}" data="${source.data}" />`;
        }
        return '';
      }).join('\n')
    }${
      result.error ? `\n<error message="${result.error.message}"${
        result.error.details ? ` details="${JSON.stringify(result.error.details).replace(/"/g, '&quot;')}"` : ''
      } />` : ''
    }\n</tool_result>`;
  }

  /**
   * Get the tool registry
   * @returns The tool registry
   */
  public getToolRegistry(): McpToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get the server URL if the MCP server is running
   * @returns The URL of the server, or undefined if not started
   */
  public getServerUrl(): URL | undefined {
    return this.mcpServer.getServerUrl();
  }
}