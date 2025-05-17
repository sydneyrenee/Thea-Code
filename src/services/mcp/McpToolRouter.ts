import { EventEmitter } from "events";
import { UnifiedMcpToolSystem, NeutralToolUseRequest, NeutralToolResult } from "./UnifiedMcpToolSystem";
import { McpConverters } from "./McpConverters";
import { SseTransportConfig } from "./transport/config/SseTransportConfig";

/**
 * Enum for supported tool use formats
 */
export enum ToolUseFormat {
  XML = 'xml',
  JSON = 'json',
  OPENAI = 'openai',
  NEUTRAL = 'neutral'
}

/**
 * Interface for tool use request with format information
 */
export interface ToolUseRequestWithFormat {
  format: ToolUseFormat;
  content: string | Record<string, unknown>;
}

/**
 * Interface for tool result with format information
 */
export interface ToolResultWithFormat {
  format: ToolUseFormat;
  content: string | Record<string, unknown>;
}

/**
 * McpToolRouter provides a routing system for tool execution through the MCP server.
 * It handles the conversion between different formats and routes all tool execution
 * through the unified MCP tool system.
 */
export class McpToolRouter extends EventEmitter {
  private static instance: McpToolRouter;
  private mcpToolSystem: UnifiedMcpToolSystem;
  private sseConfig?: SseTransportConfig;
  
  /**
   * Get the singleton instance of the McpToolRouter
   * @param config Optional SSE transport configuration
   */
  public static getInstance(config?: SseTransportConfig): McpToolRouter {
    if (!McpToolRouter.instance) {
      McpToolRouter.instance = new McpToolRouter(config);
    } else if (config) {
      // Update config if provided
      McpToolRouter.instance.sseConfig = config;
    }
    return McpToolRouter.instance;
  }
  
  /**
   * Private constructor to enforce singleton pattern
   * @param config Optional SSE transport configuration
   */
  private constructor(config?: SseTransportConfig) {
    super();
    this.sseConfig = config;
    this.mcpToolSystem = UnifiedMcpToolSystem.getInstance(config);
    
    // Forward events from the MCP tool system
    this.mcpToolSystem.on('tool-registered', (name) => this.emit('tool-registered', name));
    this.mcpToolSystem.on('tool-unregistered', (name) => this.emit('tool-unregistered', name));
    this.mcpToolSystem.on('started', (info) => this.emit('started', info));
    this.mcpToolSystem.on('stopped', () => this.emit('stopped'));
  }
  
  /**
   * Initialize the router
   */
  public async initialize(): Promise<void> {
    await this.mcpToolSystem.initialize();
  }
  
  /**
   * Shutdown the router
   */
  public async shutdown(): Promise<void> {
    await this.mcpToolSystem.shutdown();
  }
  
  /**
   * Detect the format of a tool use request
   * @param content The tool use request content
   * @returns The detected format
   */
  public detectFormat(content: string | Record<string, unknown>): ToolUseFormat {
    if (typeof content === 'string') {
      // Check for XML format
      if (content.includes('<') && content.includes('>')) {
        return ToolUseFormat.XML;
      }
      
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(content);
        
        // Check for OpenAI format
        if (parsed.function_call || parsed.tool_calls) {
          return ToolUseFormat.OPENAI;
        }
        
        // Check for neutral format
        if (parsed.type === 'tool_use') {
          return ToolUseFormat.NEUTRAL;
        }
        
        // Default to JSON
        return ToolUseFormat.JSON;
      } catch (error) {
        // If parsing fails, assume it's XML
        return ToolUseFormat.XML;
      }
    } else {
      // Object is already parsed
      
      // Check for OpenAI format
      if ('function_call' in content || 'tool_calls' in content) {
        return ToolUseFormat.OPENAI;
      }
      
      // Check for neutral format
      if ('type' in content && content.type === 'tool_use') {
        return ToolUseFormat.NEUTRAL;
      }
      
      // Default to JSON
      return ToolUseFormat.JSON;
    }
  }
  
  /**
   * Route a tool use request to the appropriate handler based on its format
   * @param request The tool use request with format information
   * @returns The tool result with format information
   */
  public async routeToolUse(request: ToolUseRequestWithFormat): Promise<ToolResultWithFormat> {
    try {
      // Convert the request to MCP format
      const mcpRequest = this.convertToMcp(request);
      
      // Execute the tool through the MCP system
      const mcpResult = await this.executeTool(mcpRequest);
      
      // Convert the result back to the original format
      return this.convertFromMcp(mcpResult, request.format);
    } catch (error) {
      // Handle errors
      const errorResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'error',
        content: [{
          type: 'text',
          text: `Error routing tool use: ${error instanceof Error ? error.message : String(error)}`
        }],
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      };
      
      // Convert the error result to the original format
      return this.convertFromMcp(errorResult, request.format);
    }
  }
  
  /**
   * Convert a tool use request to MCP format
   * @param request The tool use request with format information
   * @returns The tool use request in MCP format
   */
  private convertToMcp(request: ToolUseRequestWithFormat): NeutralToolUseRequest {
    switch (request.format) {
      case ToolUseFormat.XML:
        return McpConverters.xmlToMcp(request.content as string);
      
      case ToolUseFormat.JSON:
        return McpConverters.jsonToMcp(request.content);
      
      case ToolUseFormat.OPENAI:
        return McpConverters.openAiToMcp(request.content as Record<string, unknown>);
      
      case ToolUseFormat.NEUTRAL:
        if (typeof request.content === 'string') {
          return JSON.parse(request.content) as NeutralToolUseRequest;
        } else {
          // Ensure the object has the required properties before casting
          if (!('type' in request.content && 'id' in request.content && 'name' in request.content && 'input' in request.content)) {
            throw new Error('Invalid tool use request format: missing required properties');
          }
          return {
            type: 'tool_use',
            id: String(request.content.id),
            name: String(request.content.name),
            input: request.content.input as Record<string, unknown>
          };
        }
      
      default:
        throw new Error(`Unsupported format: ${request.format}`);
    }
  }
  
  /**
   * Convert a tool result from MCP format to the specified format
   * @param result The tool result in MCP format
   * @param format The target format
   * @returns The tool result with format information
   */
  private convertFromMcp(result: NeutralToolResult, format: ToolUseFormat): ToolResultWithFormat {
    switch (format) {
      case ToolUseFormat.XML:
        return {
          format: ToolUseFormat.XML,
          content: McpConverters.mcpToXml(result)
        };
      
      case ToolUseFormat.JSON:
        return {
          format: ToolUseFormat.JSON,
          content: McpConverters.mcpToJson(result)
        };
      
      case ToolUseFormat.OPENAI:
        return {
          format: ToolUseFormat.OPENAI,
          content: McpConverters.mcpToOpenAi(result)
        };
      
      case ToolUseFormat.NEUTRAL:
        return {
          format: ToolUseFormat.NEUTRAL,
          content: result as unknown as Record<string, unknown>
        };
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  /**
   * Execute a tool through the MCP system
   * @param request The tool use request in MCP format
   * @returns The tool result in MCP format
   */
  private async executeTool(request: NeutralToolUseRequest): Promise<NeutralToolResult> {
    const { name, input, id } = request;
    
    try {
      // Execute the tool using the MCP server
      const result = await this.mcpToolSystem.executeToolFromNeutralFormat(request);
      return result;
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
}