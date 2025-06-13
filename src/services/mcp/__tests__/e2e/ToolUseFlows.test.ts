/**
 * End-to-end tests for complete tool use flows
 * Tests the full pipeline from tool request to execution and response
 */
import { McpIntegration } from '../../integration/McpIntegration';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports, @typescript-eslint/require-await, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions */
import { McpToolExecutor } from '../../core/McpToolExecutor';
import { McpToolRouter } from '../../core/McpToolRouter';
import { McpConverters } from '../../core/McpConverters';
import { ToolDefinition } from '../../types/McpProviderTypes';
import { ToolUseFormat, NeutralToolUseRequest } from '../../types/McpToolTypes';

// Mock the EmbeddedMcpProvider for E2E tests
jest.mock('../../providers/EmbeddedMcpProvider', () => {
  const { EventEmitter } = require('events');
  
  const MockEmbeddedMcpProvider = jest.fn().mockImplementation(() => {
    const instance = new EventEmitter();
    const tools = new Map();
    
    instance.start = jest.fn().mockImplementation(() => Promise.resolve());
    instance.stop = jest.fn().mockImplementation(() => Promise.resolve());
    instance.getServerUrl = jest.fn().mockReturnValue(new URL("http://localhost:3000"));
    instance.isRunning = jest.fn().mockReturnValue(true);
    
    instance.registerToolDefinition = jest.fn().mockImplementation((tool) => {
      tools.set(tool.name, tool);
      instance.emit('tool-registered', tool.name);
    });
    
    instance.unregisterTool = jest.fn().mockImplementation((name) => {
      const result = tools.delete(name);
      if (result) {
        instance.emit('tool-unregistered', name);
      }
      return result;
    });
    
    instance.executeTool = jest.fn().mockImplementation(async (name, args) => {
      const tool = tools.get(name);
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
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
    
    return instance;
  });
  
  const MockedProviderClass = MockEmbeddedMcpProvider as any;
  MockedProviderClass.create = jest.fn().mockImplementation(async () => {
    return new MockEmbeddedMcpProvider();
  });
  
  return {
    EmbeddedMcpProvider: MockEmbeddedMcpProvider
  };
});

// Mock McpToolRegistry
jest.mock('../../core/McpToolRegistry', () => {
  const mockRegistry = {
    registerTool: jest.fn(),
    unregisterTool: jest.fn().mockReturnValue(true),
    getTool: jest.fn(),
    getAllTools: jest.fn(),
    hasTool: jest.fn(),
    executeTool: jest.fn()
  };
  
  return {
    McpToolRegistry: {
      getInstance: jest.fn().mockReturnValue(mockRegistry)
    }
  };
});

describe('MCP End-to-End Tool Use Flows', () => {
  let mcpIntegration: McpIntegration;
  let mcpToolExecutor: McpToolExecutor;
  let mcpToolRouter: McpToolRouter;

  beforeEach(async () => {
    // Reset singletons
    (McpIntegration as any).instance = undefined;
    (McpToolExecutor as any).instance = undefined;
    (McpToolRouter as any).instance = undefined;

    mcpIntegration = McpIntegration.getInstance();
    mcpToolExecutor = McpToolExecutor.getInstance();
    mcpToolRouter = McpToolRouter.getInstance();

    await mcpIntegration.initialize();
  });

  afterEach(async () => {
    if (mcpToolExecutor) {
      await mcpToolExecutor.shutdown();
    }
  });

  describe('XML Tool Use Flow', () => {
    const testTool: ToolDefinition = {
      name: 'read_file',
      description: 'Read file contents',
      paramSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start_line: { type: 'number' },
          end_line: { type: 'number' }
        },
        required: ['path']
      },
      handler: async (args) => ({
        content: [{ 
          type: 'text', 
          text: `File content from ${args.path}, lines ${args.start_line}-${args.end_line}` 
        }],
        isError: false
      })
    };

    beforeEach(() => {
      mcpIntegration.registerTool(testTool);
    });

    it('should complete full XML tool use flow', async () => {
      const xmlRequest = `
        <read_file>
          <path>src/main.ts</path>
          <start_line>10</start_line>
          <end_line>20</end_line>
        </read_file>
      `;

      // Step 1: Detect format
      const format = mcpToolRouter.detectFormat(xmlRequest);
      expect(format).toBe(ToolUseFormat.XML);

      // Step 2: Convert to neutral format
      const neutralRequest = McpConverters.xmlToMcp(xmlRequest);
      expect(neutralRequest.type).toBe('tool_use');
      expect(neutralRequest.name).toBe('read_file');
      expect(neutralRequest.input.path).toBe('src/main.ts');
      expect(neutralRequest.input.start_line).toBe(10);
      expect(neutralRequest.input.end_line).toBe(20);

      // Step 3: Execute tool
      const result = await mcpToolExecutor.executeToolFromNeutralFormat(neutralRequest);
      expect(result.type).toBe('tool_result');
      expect(result.status).toBe('success');
      expect(result.content[0].text).toContain('File content from src/main.ts, lines 10-20');

      // Step 4: Convert result back to XML
      const xmlResult = McpConverters.mcpToXml(result);
      expect(xmlResult).toContain('<tool_result');
      expect(xmlResult).toContain('status="success"');
      expect(xmlResult).toContain('File content from src/main.ts, lines 10-20');
    });

    it('should handle XML tool use errors gracefully', async () => {
      const xmlRequest = `
        <non_existent_tool>
          <param>value</param>
        </non_existent_tool>
      `;

      const neutralRequest = McpConverters.xmlToMcp(xmlRequest);
      const result = await mcpToolExecutor.executeToolFromNeutralFormat(neutralRequest);

      expect(result.type).toBe('tool_result');
      expect(result.status).toBe('error');
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('JSON Tool Use Flow', () => {
    const calculatorTool: ToolDefinition = {
      name: 'calculator',
      description: 'Perform calculations',
      paramSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string' },
          operands: { type: 'array', items: { type: 'number' } }
        },
        required: ['operation', 'operands']
      },
      handler: async (args) => {
        const { operation, operands } = args;
        let result: number;
        
        switch (operation) {
          case 'add':
            result = (operands as number[]).reduce((sum: number, num: number) => sum + num, 0);
            break;
          case 'multiply':
            result = (operands as number[]).reduce((product: number, num: number) => product * num, 1);
            break;
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }
        
        return {
          content: [{ type: 'text', text: `Result: ${result}` }],
          isError: false
        };
      }
    };

    beforeEach(() => {
      mcpIntegration.registerTool(calculatorTool);
    });

    it('should complete full JSON tool use flow', async () => {
      const jsonRequest = {
        type: 'tool_use',
        id: 'calc-001',
        name: 'calculator',
        input: {
          operation: 'add',
          operands: [10, 20, 30]
        }
      };

      // Step 1: Detect format
      const format = mcpToolRouter.detectFormat(JSON.stringify(jsonRequest));
      expect(format).toBe(ToolUseFormat.NEUTRAL);

      // Step 2: Convert to neutral format (already neutral)
      const neutralRequest = McpConverters.jsonToMcp(jsonRequest);
      expect(neutralRequest.type).toBe('tool_use');
      expect(neutralRequest.name).toBe('calculator');

      // Step 3: Execute tool
      const result = await mcpToolExecutor.executeToolFromNeutralFormat(neutralRequest);
      expect(result.type).toBe('tool_result');
      expect(result.status).toBe('success');
      expect(result.content[0].text).toBe('Result: 60');

      // Step 4: Convert result to JSON
      const jsonResult = McpConverters.mcpToJson(result);
      const parsedResult = JSON.parse(jsonResult);
      expect(parsedResult.type).toBe('tool_result');
      expect(parsedResult.status).toBe('success');
    });
  });

  describe('OpenAI Function Call Flow', () => {
    const weatherTool: ToolDefinition = {
      name: 'get_weather',
      description: 'Get weather information',
      paramSchema: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
        },
        required: ['location']
      },
      handler: async (args) => ({
        content: [{ 
          type: 'text', 
          text: `Weather in ${args.location}: 22°${args.unit === 'fahrenheit' ? 'F' : 'C'}, sunny` 
        }],
        isError: false
      })
    };

    beforeEach(() => {
      mcpIntegration.registerTool(weatherTool);
    });

    it('should complete OpenAI function call flow', async () => {
      const openAiRequest = {
        function_call: {
          name: 'get_weather',
          arguments: JSON.stringify({
            location: 'New York',
            unit: 'celsius'
          })
        }
      };

      // Step 1: Detect format
      const format = mcpToolRouter.detectFormat(JSON.stringify(openAiRequest));
      expect(format).toBe(ToolUseFormat.OPENAI);

      // Step 2: Convert to neutral format
      const neutralRequest = McpConverters.openAiToMcp(openAiRequest);
      expect(neutralRequest.type).toBe('tool_use');
      expect(neutralRequest.name).toBe('get_weather');

      // Step 3: Execute tool
      const result = await mcpToolExecutor.executeToolFromNeutralFormat(neutralRequest);
      expect(result.type).toBe('tool_result');
      expect(result.status).toBe('success');
      expect(result.content[0].text).toContain('Weather in New York: 22°C, sunny');

      // Step 4: Convert result to OpenAI format
      const openAiResult = McpConverters.mcpToOpenAi(result);
      expect(openAiResult.role).toBe('tool');
      expect(openAiResult.content).toContain('Weather in New York');
    });
  });

  describe('Multiple Tool Execution Flow', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'list_files',
        description: 'List files in directory',
        handler: async (args) => ({
          content: [{ type: 'text', text: `Files in ${args.directory}: file1.ts, file2.ts` }]
        })
      },
      {
        name: 'count_lines',
        description: 'Count lines in file',
        handler: async (args) => ({
          content: [{ type: 'text', text: `${args.file} has 42 lines` }]
        })
      }
    ];

    beforeEach(() => {
      tools.forEach(tool => mcpIntegration.registerTool(tool));
    });

    it('should handle multiple tool executions in sequence', async () => {
      // Execute first tool
      const listRequest: NeutralToolUseRequest = {
        type: 'tool_use',
        id: 'list-001',
        name: 'list_files',
        input: { directory: 'src' }
      };

      const listResult = await mcpToolExecutor.executeToolFromNeutralFormat(listRequest);
      expect(listResult.status).toBe('success');
      expect(listResult.content[0].text).toContain('Files in src');

      // Execute second tool
      const countRequest: NeutralToolUseRequest = {
        type: 'tool_use',
        id: 'count-001',
        name: 'count_lines',
        input: { file: 'file1.ts' }
      };

      const countResult = await mcpToolExecutor.executeToolFromNeutralFormat(countRequest);
      expect(countResult.status).toBe('success');
      expect(countResult.content[0].text).toContain('42 lines');
    });

    it('should handle tool registration and unregistration during execution', async () => {
      // Verify tool is available
      const request: NeutralToolUseRequest = {
        type: 'tool_use',
        id: 'test-001',
        name: 'list_files',
        input: { directory: 'test' }
      };

      const result1 = await mcpToolExecutor.executeToolFromNeutralFormat(request);
      expect(result1.status).toBe('success');

      // Unregister tool
      mcpIntegration.unregisterTool('list_files');

      // Tool should no longer be available
      const result2 = await mcpToolExecutor.executeToolFromNeutralFormat(request);
      expect(result2.status).toBe('error');
      expect(result2.content[0].text).toContain('not found');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed XML gracefully', async () => {
      const malformedXml = 'not xml at all';
      
      // The XML converter should try to convert and then fail during validation
      expect(() => {
        McpConverters.xmlToMcp(malformedXml);
      }).toThrow('Failed to convert XML to MCP format');
    });

    it('should handle malformed JSON gracefully', async () => {
      const malformedJson = '{"type": "tool_use", "invalid": }';
      
      expect(() => {
        McpConverters.jsonToMcp(malformedJson);
      }).toThrow();
    });

    it('should handle tool execution timeouts', async () => {
      const timeoutTool: ToolDefinition = {
        name: 'timeout_tool',
        description: 'Tool that simulates timeout',
        handler: async () => {
          // Simulate a long-running operation
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                content: [{ type: 'text', text: 'Finally completed' }],
                isError: false
              });
            }, 100); // Short timeout for testing
          });
        }
      };

      mcpIntegration.registerTool(timeoutTool);

      const request: NeutralToolUseRequest = {
        type: 'tool_use',
        id: 'timeout-001',
        name: 'timeout_tool',
        input: {}
      };

      const result = await mcpToolExecutor.executeToolFromNeutralFormat(request);
      expect(result.content[0].text).toBe('Finally completed');
    });
  });
});