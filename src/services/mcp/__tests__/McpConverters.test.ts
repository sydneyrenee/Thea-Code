import { McpConverters } from '../McpConverters';
import { ToolDefinition } from '../EmbeddedMcpServer';
import { NeutralToolUseRequest, NeutralToolResult } from '../UnifiedMcpToolSystem';

// Mock the json-xml-bridge utilities
jest.mock('../../../utils/json-xml-bridge', () => ({
  jsonToolUseToXml: jest.fn((json) => `<mock_xml>${json}</mock_xml>`),
  xmlToolUseToJson: jest.fn((xml) => '{"type":"tool_use","id":"test","name":"test_tool","input":{"param":"test"}}'),
  openAiFunctionCallToNeutralToolUse: jest.fn(() => ({
    type: 'tool_use',
    id: 'test',
    name: 'test_tool',
    input: { param: 'test' }
  })),
  neutralToolUseToOpenAiFunctionCall: jest.fn()
}));

describe('McpConverters', () => {
  describe('toolDefinitionsToOpenAiFunctions', () => {
    test('should convert tool definitions to OpenAI function definitions', () => {
      // Create a map of tool definitions
      const tools = new Map<string, ToolDefinition>();
      
      tools.set('test_tool', {
        name: 'test_tool',
        description: 'A test tool',
        paramSchema: {
          type: 'object',
          properties: {
            param: {
              type: 'string',
              description: 'A test parameter'
            }
          },
          required: ['param']
        },
        handler: async () => ({ content: [] })
      });
      
      tools.set('another_tool', {
        name: 'another_tool',
        description: 'Another test tool',
        paramSchema: {
          type: 'object',
          properties: {
            option: {
              type: 'boolean',
              description: 'A boolean option'
            },
            count: {
              type: 'number',
              description: 'A number parameter'
            }
          },
          required: ['option']
        },
        handler: async () => ({ content: [] })
      });
      
      // Convert to OpenAI functions
      const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools);
      
      // Verify the conversion
      expect(functions).toHaveLength(2);
      
      // Check the first function
      expect(functions[0]).toEqual({
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            param: {
              type: 'string',
              description: 'A test parameter'
            }
          },
          required: ['param']
        }
      });
      
      // Check the second function
      expect(functions[1]).toEqual({
        name: 'another_tool',
        description: 'Another test tool',
        parameters: {
          type: 'object',
          properties: {
            option: {
              type: 'boolean',
              description: 'A boolean option'
            },
            count: {
              type: 'number',
              description: 'A number parameter'
            }
          },
          required: ['option']
        }
      });
    });
    
    test('should handle tool definitions without schemas', () => {
      // Create a map of tool definitions without schemas
      const tools = new Map<string, ToolDefinition>();
      
      tools.set('simple_tool', {
        name: 'simple_tool',
        description: 'A simple tool without schema',
        handler: async () => ({ content: [] })
      });
      
      // Convert to OpenAI functions
      const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools);
      
      // Verify the conversion
      expect(functions).toHaveLength(1);
      expect(functions[0]).toEqual({
        name: 'simple_tool',
        description: 'A simple tool without schema',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      });
    });
    
    test('should handle tool definitions without descriptions', () => {
      // Create a map of tool definitions without descriptions
      const tools = new Map<string, ToolDefinition>();
      
      tools.set('no_description', {
        name: 'no_description',
        handler: async () => ({ content: [] })
      });
      
      // Convert to OpenAI functions
      const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools);
      
      // Verify the conversion
      expect(functions).toHaveLength(1);
      expect(functions[0]).toEqual({
        name: 'no_description',
        description: '',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      });
    });
    
    test('should handle empty tool map', () => {
      // Create an empty map of tool definitions
      const tools = new Map<string, ToolDefinition>();
      
      // Convert to OpenAI functions
      const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools);
      
      // Verify the conversion
      expect(functions).toHaveLength(0);
      expect(functions).toEqual([]);
    });
  });
  
  describe('format conversion', () => {
    test('should convert XML to MCP format', () => {
      const xmlContent = '<tool_use id="test" name="test_tool"><param>test</param></tool_use>';
      const result = McpConverters.xmlToMcp(xmlContent);
      
      expect(result).toEqual({
        type: 'tool_use',
        id: 'test',
        name: 'test_tool',
        input: { param: 'test' }
      });
    });
    
    test('should convert JSON to MCP format', () => {
      const jsonContent = {
        type: 'tool_use',
        id: 'test',
        name: 'test_tool',
        input: { param: 'test' }
      };
      
      const result = McpConverters.jsonToMcp(jsonContent);
      
      expect(result).toEqual({
        type: 'tool_use',
        id: 'test',
        name: 'test_tool',
        input: { param: 'test' }
      });
    });
    
    test('should convert OpenAI function call to MCP format', () => {
      const functionCall = {
        function_call: {
          name: 'test_tool',
          arguments: '{"param":"test"}'
        }
      };
      
      const result = McpConverters.openAiToMcp(functionCall);
      
      expect(result).toEqual({
        type: 'tool_use',
        id: 'test',
        name: 'test_tool',
        input: { param: 'test' }
      });
    });
    
    test('should convert MCP format to XML', () => {
      const mcpResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'test',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      };
      
      const result = McpConverters.mcpToXml(mcpResult);
      
      expect(result).toContain('tool_use_id="test"');
      expect(result).toContain('status="success"');
      expect(result).toContain('Test result');
    });
    
    test('should convert MCP format to JSON', () => {
      const mcpResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'test',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      };
      
      const result = McpConverters.mcpToJson(mcpResult);
      const parsed = JSON.parse(result);
      
      expect(parsed).toEqual(mcpResult);
    });
    
    test('should convert MCP format to OpenAI', () => {
      const mcpResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'test',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      };
      
      const result = McpConverters.mcpToOpenAi(mcpResult);
      
      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'test',
        content: 'Test result'
      });
    });
  });
});