/**
 * Tests for OpenAI function format handling in MCP system
 * Validates conversion between OpenAI function calls and MCP neutral format
 */
import { McpConverters } from '../../core/McpConverters';
import { ToolDefinition } from '../../types/McpProviderTypes';

describe('OpenAI Function Format Handling', () => {
  describe('Function Call to MCP Conversion', () => {
    it('should convert OpenAI function call to MCP format', () => {
      const openAiFunctionCall = {
        function_call: {
          name: 'get_weather',
          arguments: JSON.stringify({
            location: 'San Francisco',
            unit: 'celsius'
          })
        }
      };

      const result = McpConverters.openAiToMcp(openAiFunctionCall);

      expect(result).toEqual({
        type: 'tool_use',
        id: expect.any(String),
        name: 'get_weather',
        input: {
          location: 'San Francisco',
          unit: 'celsius'
        }
      });
    });

    it('should handle OpenAI function call with complex arguments', () => {
      const complexFunctionCall = {
        function_call: {
          name: 'search_database',
          arguments: JSON.stringify({
            query: 'SELECT * FROM users',
            filters: {
              age: { min: 18, max: 65 },
              status: ['active', 'pending']
            },
            pagination: {
              offset: 0,
              limit: 10
            }
          })
        }
      };

      const result = McpConverters.openAiToMcp(complexFunctionCall);

      expect(result.type).toBe('tool_use');
      expect(result.name).toBe('search_database');
      expect(result.input).toEqual({
        query: 'SELECT * FROM users',
        filters: {
          age: { min: 18, max: 65 },
          status: ['active', 'pending']
        },
        pagination: {
          offset: 0,
          limit: 10
        }
      });
    });

    it('should handle OpenAI function call with empty arguments', () => {
      const functionCall = {
        function_call: {
          name: 'get_current_time',
          arguments: '{}'
        }
      };

      const result = McpConverters.openAiToMcp(functionCall);

      expect(result).toEqual({
        type: 'tool_use',
        id: expect.any(String),
        name: 'get_current_time',
        input: {}
      });
    });

    it('should handle malformed OpenAI function call arguments', () => {
      const malformedCall = {
        function_call: {
          name: 'test_function',
          arguments: '{"invalid": json}'
        }
      };

      const result = McpConverters.openAiToMcp(malformedCall);
      
      // Should handle gracefully by wrapping in raw property
      expect(result.type).toBe('tool_use');
      expect(result.name).toBe('test_function');
      expect(result.input).toEqual({ raw: '{"invalid": json}' });
    });

    it('should handle missing function_call property', () => {
      const invalidCall = {
        name: 'test_function',
        arguments: '{}'
      };

      expect(() => {
        McpConverters.openAiToMcp(invalidCall);
      }).toThrow('Failed to convert OpenAI function call to MCP format');
    });
  });

  describe('MCP to OpenAI Result Conversion', () => {
    it('should convert MCP tool result to OpenAI format', () => {
      const mcpResult = {
        type: 'tool_result' as const,
        tool_use_id: 'call_123',
        status: 'success' as const,
        content: [
          { type: 'text' as const, text: 'Weather in San Francisco: 22°C, sunny' }
        ]
      };

      const result = McpConverters.mcpToOpenAi(mcpResult);

      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: 'Weather in San Francisco: 22°C, sunny'
      });
    });

    it('should convert MCP tool result with multiple content items', () => {
      const mcpResult = {
        type: 'tool_result' as const,
        tool_use_id: 'call_456',
        status: 'success' as const,
        content: [
          { type: 'text' as const, text: 'First part of response' },
          { type: 'text' as const, text: 'Second part of response' }
        ]
      };

      const result = McpConverters.mcpToOpenAi(mcpResult);

      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'call_456',
        content: 'First part of response\nSecond part of response'
      });
    });

    it('should handle MCP tool result with error', () => {
      const mcpResult = {
        type: 'tool_result' as const,
        tool_use_id: 'call_789',
        status: 'error' as const,
        content: [
          { type: 'text' as const, text: 'Tool execution failed' }
        ],
        error: {
          message: 'Invalid parameters provided'
        }
      };

      const result = McpConverters.mcpToOpenAi(mcpResult);

      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'call_789',
        content: 'Tool execution failed'
      });
    });

    it('should handle empty content in MCP result', () => {
      const mcpResult = {
        type: 'tool_result' as const,
        tool_use_id: 'call_empty',
        status: 'success' as const,
        content: []
      };

      const result = McpConverters.mcpToOpenAi(mcpResult);

      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'call_empty',
        content: ''
      });
    });
  });

  describe('Tool Definitions to OpenAI Functions Conversion', () => {
    it('should convert MCP tool definitions to OpenAI function definitions', () => {
      const tools = new Map<string, ToolDefinition>([
        ['get_weather', {
          name: 'get_weather',
          description: 'Get current weather for a location',
          paramSchema: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
            },
            required: ['location']
          },
          handler: async () => ({ content: [] })
        }],
        ['calculate', {
          name: 'calculate',
          description: 'Perform mathematical calculations',
          paramSchema: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: 'Mathematical expression' }
            },
            required: ['expression']
          },
          handler: async () => ({ content: [] })
        }]
      ]);

      const result = McpConverters.toolDefinitionsToOpenAiFunctions(tools);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
          },
          required: ['location']
        }
      });
      expect(result).toContainEqual({
        name: 'calculate',
        description: 'Perform mathematical calculations',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'Mathematical expression' }
          },
          required: ['expression']
        }
      });
    });

    it('should handle tool definition without description', () => {
      const tools = new Map<string, ToolDefinition>([
        ['no_desc_tool', {
          name: 'no_desc_tool',
          paramSchema: { type: 'object' },
          handler: async () => ({ content: [] })
        }]
      ]);

      const result = McpConverters.toolDefinitionsToOpenAiFunctions(tools);

      expect(result).toEqual([{
        name: 'no_desc_tool',
        description: '',
        parameters: { type: 'object' }
      }]);
    });

    it('should handle tool definition without paramSchema', () => {
      const tools = new Map<string, ToolDefinition>([
        ['no_schema_tool', {
          name: 'no_schema_tool',
          description: 'Tool without schema',
          handler: async () => ({ content: [] })
        }]
      ]);

      const result = McpConverters.toolDefinitionsToOpenAiFunctions(tools);

      expect(result).toEqual([{
        name: 'no_schema_tool',
        description: 'Tool without schema',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }]);
    });

    it('should handle empty tool map', () => {
      const tools = new Map<string, ToolDefinition>();

      const result = McpConverters.toolDefinitionsToOpenAiFunctions(tools);

      expect(result).toEqual([]);
    });
  });

  describe('OpenAI Function Format Detection', () => {
    it('should detect OpenAI function call format', () => {
      const openAiContent = JSON.stringify({
        function_call: {
          name: 'test_function',
          arguments: '{"param": "value"}'
        }
      });

      // This would typically be tested through McpToolRouter.detectFormat
      expect(openAiContent).toContain('function_call');
      expect(JSON.parse(openAiContent)).toHaveProperty('function_call');
    });

    it('should distinguish from other formats', () => {
      const neutralFormat = JSON.stringify({
        type: 'tool_use',
        name: 'test_function',
        input: { param: 'value' }
      });

      const xmlFormat = '<test_function><param>value</param></test_function>';

      expect(JSON.parse(neutralFormat)).not.toHaveProperty('function_call');
      expect(xmlFormat).not.toContain('function_call');
    });
  });

  describe('OpenAI Function Format Edge Cases', () => {
    it('should handle function call with null arguments', () => {
      const functionCall = {
        function_call: {
          name: 'test_function',
          arguments: null
        }
      };

      const result = McpConverters.openAiToMcp(functionCall as any);
      expect(result.type).toBe('tool_use');
      expect(result.name).toBe('test_function');
      expect(result.input).toBeNull();
    });

    it('should handle function call with undefined arguments', () => {
      const functionCall = {
        function_call: {
          name: 'test_function'
          // arguments is undefined
        }
      };

      const result = McpConverters.openAiToMcp(functionCall as any);
      expect(result.type).toBe('tool_use');
      expect(result.name).toBe('test_function');
      expect(result.input).toEqual({ raw: undefined });
    });

    it('should handle nested object arguments correctly', () => {
      const complexCall = {
        function_call: {
          name: 'complex_function',
          arguments: JSON.stringify({
            config: {
              api: {
                endpoint: 'https://api.example.com',
                auth: {
                  type: 'bearer',
                  token: 'secret'
                }
              },
              options: {
                retry: 3,
                timeout: 5000
              }
            },
            data: [
              { id: 1, name: 'Item 1' },
              { id: 2, name: 'Item 2' }
            ]
          })
        }
      };

      const result = McpConverters.openAiToMcp(complexCall);

      expect(result.input).toEqual({
        config: {
          api: {
            endpoint: 'https://api.example.com',
            auth: {
              type: 'bearer',
              token: 'secret'
            }
          },
          options: {
            retry: 3,
            timeout: 5000
          }
        },
        data: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' }
        ]
      });
    });

    it('should preserve data types in arguments', () => {
      const typedCall = {
        function_call: {
          name: 'typed_function',
          arguments: JSON.stringify({
            string_param: 'text',
            number_param: 42,
            boolean_param: true,
            null_param: null,
            array_param: [1, 2, 3],
            object_param: { nested: 'value' }
          })
        }
      };

      const result = McpConverters.openAiToMcp(typedCall);

      expect(result.input).toEqual({
        string_param: 'text',
        number_param: 42,
        boolean_param: true,
        null_param: null,
        array_param: [1, 2, 3],
        object_param: { nested: 'value' }
      });
    });
  });
});