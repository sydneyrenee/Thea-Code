import { 
  jsonToolUseToXml, 
  xmlToolUseToJson, 
  openAiFunctionCallToNeutralToolUse,
  neutralToolUseToOpenAiFunctionCall
} from "../../../utils/json-xml-bridge";
import { NeutralToolUseRequest, NeutralToolResult } from "../types/McpToolTypes";
import { ToolDefinition } from "../types/McpProviderTypes";

/**
 * McpConverters provides utility functions for converting between different tool use formats
 * and the MCP protocol. This serves as the bridge between the JSON-XML formats and the
 * underlying MCP protocol.
 */
export class McpConverters {
  /**
   * Convert XML tool use format to MCP protocol format
   * @param xmlContent XML string with tool use tags
   * @returns MCP protocol compatible tool use request
   */
  public static xmlToMcp(xmlContent: string): NeutralToolUseRequest {
    // First convert XML to JSON format
    const jsonString = xmlToolUseToJson(xmlContent);
    
    try {
      // Parse the JSON string to get the tool use request
      const toolUseRequest = JSON.parse(jsonString) as NeutralToolUseRequest;
      
      // Validate the tool use request
      if (!toolUseRequest.type || toolUseRequest.type !== 'tool_use' || 
          !toolUseRequest.name || !toolUseRequest.id || !toolUseRequest.input) {
        throw new Error('Invalid tool use request format');
      }
      
      return toolUseRequest;
    } catch (error) {
      throw new Error(`Failed to convert XML to MCP format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Convert JSON tool use format to MCP protocol format
   * @param jsonContent JSON object or string with tool use content
   * @returns MCP protocol compatible tool use request
   */
  public static jsonToMcp(jsonContent: string | Record<string, unknown>): NeutralToolUseRequest {
    try {
      let toolUseRequest: Record<string, unknown>;
      
      if (typeof jsonContent === 'string') {
        toolUseRequest = JSON.parse(jsonContent);
      } else {
        toolUseRequest = jsonContent;
      }
      
      // Validate the tool use request
      if (!('type' in toolUseRequest) || toolUseRequest.type !== 'tool_use' || 
          !('name' in toolUseRequest) || !('id' in toolUseRequest) || !('input' in toolUseRequest)) {
        throw new Error('Invalid tool use request format: missing required properties');
      }
      
      return {
        type: 'tool_use',
        id: String(toolUseRequest.id),
        name: String(toolUseRequest.name),
        input: toolUseRequest.input as Record<string, unknown>
      };
    } catch (error) {
      throw new Error(`Failed to convert JSON to MCP format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Convert OpenAI function call format to MCP protocol format
   * @param functionCall OpenAI function call object
   * @returns MCP protocol compatible tool use request
   */
  public static openAiToMcp(functionCall: Record<string, unknown>): NeutralToolUseRequest {
    try {
      const toolUseRequest = openAiFunctionCallToNeutralToolUse(functionCall);
      
      if (!toolUseRequest) {
        throw new Error('Invalid function call format');
      }
      
      return toolUseRequest as NeutralToolUseRequest;
    } catch (error) {
      throw new Error(`Failed to convert OpenAI function call to MCP format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Convert MCP protocol format to XML tool result format
   * @param result MCP protocol tool result
   * @returns XML string with tool result tags
   */
  public static mcpToXml(result: NeutralToolResult): string {
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
   * Convert MCP protocol format to JSON tool result format
   * @param result MCP protocol tool result
   * @returns JSON string with tool result content
   */
  public static mcpToJson(result: NeutralToolResult): string {
    return JSON.stringify(result);
  }
  
  /**
   * Convert MCP protocol format to OpenAI tool result format
   * @param result MCP protocol tool result
   * @returns OpenAI compatible tool result object
   */
  public static mcpToOpenAi(result: NeutralToolResult): Record<string, unknown> {
    return {
      role: 'tool',
      tool_call_id: result.tool_use_id,
      content: result.content.map(item => item.text).join('\n')
    };
  }

  /**
   * Convert MCP tool definitions to OpenAI function definitions
   * @param tools Map of tool names to tool definitions
   * @returns Array of OpenAI function definitions
   */
  public static toolDefinitionsToOpenAiFunctions(tools: Map<string, ToolDefinition>): any[] {
    const functions = [];
    
    for (const [name, definition] of tools.entries()) {
      functions.push({
        name: definition.name,
        description: definition.description || '',
        parameters: definition.paramSchema || {
          type: 'object',
          properties: {},
          required: []
        }
      });
    }
    
    return functions;
  }
}