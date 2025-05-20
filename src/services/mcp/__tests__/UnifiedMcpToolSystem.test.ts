import { EventEmitter } from 'events';
import { McpToolExecutor } from '../core/McpToolExecutor';
import { NeutralToolUseRequest, NeutralToolResult, ToolUseFormat } from '../types/McpToolTypes';
import { McpConverters } from '../core/McpConverters';
import { McpToolRouter } from '../core/McpToolRouter';
import { EmbeddedMcpProvider } from '../providers/EmbeddedMcpProvider';
import { McpToolRegistry } from '../core/McpToolRegistry';
import { ToolDefinition } from '../types/McpProviderTypes';

interface MockServerInterface extends EventEmitter {
  start: jest.Mock;
  stop: jest.Mock;
  registerToolDefinition: jest.Mock;
  unregisterTool: jest.Mock;
  executeTool: jest.Mock;
}

interface MockToolRegistry {
  registerTool: jest.Mock;
  unregisterTool: jest.Mock;
  getTool: jest.Mock;
  getAllTools: jest.Mock;
  hasTool: jest.Mock;
  executeTool: jest.Mock;
}

// Create mock registry
const createMockToolRegistry = (): MockToolRegistry => ({
  registerTool: jest.fn(),
  unregisterTool: jest.fn().mockReturnValue(true),
  getTool: jest.fn(),
  getAllTools: jest.fn(),
  hasTool: jest.fn(),
  executeTool: jest.fn()
});

describe('McpToolExecutor', () => {
  let mcpToolSystem: McpToolExecutor;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Get a fresh instance for each test
    // @ts-ignore - Reset the singleton instance
    (McpToolExecutor as any).instance = undefined;
    mcpToolSystem = McpToolExecutor.getInstance();
  });
  
  describe('initialization', () => {
    it('should initialize the MCP server', async () => {
      await mcpToolSystem.initialize();
      
      const mcpProvider = (mcpToolSystem as any).mcpProvider;
      expect(mcpProvider.start).toHaveBeenCalled();
    });
    
    it('should not initialize the MCP server if already initialized', async () => {
      // Initialize once
      await mcpToolSystem.initialize();
      
      // Clear the mock
      const mcpProvider = (mcpToolSystem as any).mcpProvider;
      mcpProvider.start.mockClear();
      
      // Initialize again
      await mcpToolSystem.initialize();
      
      // Should not call start again
      expect(mcpProvider.start).not.toHaveBeenCalled();
    });
  });
  
  describe('tool registration', () => {
    it('should register a tool with both the MCP server and the tool registry', () => {
      const toolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        paramSchema: { type: 'object' },
        handler: async () => ({ content: [], isError: false })
      };
      
      mcpToolSystem.registerTool(toolDefinition);
      
      const mcpProvider = (mcpToolSystem as any).mcpProvider;
      const toolRegistry = (mcpToolSystem as any).toolRegistry;

      expect(mcpProvider.registerToolDefinition).toHaveBeenCalledWith(toolDefinition);
      expect(toolRegistry.registerTool).toHaveBeenCalledWith(toolDefinition);
    });
    
    it('should unregister a tool from both the MCP server and the tool registry', () => {
      const result = mcpToolSystem.unregisterTool('test_tool');
      
      const mcpProvider = (mcpToolSystem as any).mcpProvider;
      const toolRegistry = (mcpToolSystem as any).toolRegistry;

      expect(mcpProvider.unregisterTool).toHaveBeenCalledWith('test_tool');
      expect(toolRegistry.unregisterTool).toHaveBeenCalledWith('test_tool');
      expect(result).toBe(true);
    });
  });
  
  });

describe('McpConverters', () => {
  describe('XML conversion', () => {
    it('should convert XML to MCP format', () => {
      const xmlContent = '<test_tool>\n<param1>value1</param1>\n<param2>value2</param2>\n</test_tool>';
      
      const result = McpConverters.xmlToMcp(xmlContent);
      
      expect(result.type).toBe('tool_use');
      expect(result.name).toBe('test_tool');
      expect(result.input.param1).toBe('value1');
      expect(result.input.param2).toBe('value2');
    });
    
    it('should convert MCP format to XML', () => {
      const mcpResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'test-123',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      };
      
      const result = McpConverters.mcpToXml(mcpResult);
      
      expect(result).toContain('tool_use_id="test-123"');
      expect(result).toContain('status="success"');
      expect(result).toContain('Test result');
    });
  });
  
  describe('JSON conversion', () => {
    it('should convert JSON to MCP format', () => {
      const jsonContent = {
        type: 'tool_use',
        id: 'test-123',
        name: 'test_tool',
        input: {
          param1: 'value1',
          param2: 'value2'
        }
      };
      
      const result = McpConverters.jsonToMcp(jsonContent);
      
      expect(result.type).toBe('tool_use');
      expect(result.id).toBe('test-123');
      expect(result.name).toBe('test_tool');
      expect(result.input.param1).toBe('value1');
      expect(result.input.param2).toBe('value2');
    });
    
    it('should convert MCP format to JSON', () => {
      const mcpResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'test-123',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      };
      
      const result = McpConverters.mcpToJson(mcpResult);
      const parsed = JSON.parse(result);
      
      expect(parsed.type).toBe('tool_result');
      expect(parsed.tool_use_id).toBe('test-123');
      expect(parsed.status).toBe('success');
      expect(parsed.content[0].text).toBe('Test result');
    });
  });
  
  describe('OpenAI conversion', () => {
    it('should convert OpenAI function call to MCP format', () => {
      const functionCall = {
        function_call: {
          name: 'test_tool',
          arguments: '{"param1":"value1","param2":"value2"}',
          id: 'call_abc123'
        }
      };
      
      const result = McpConverters.openAiToMcp(functionCall);
      
      expect(result.type).toBe('tool_use');
      expect(result.id).toBe('call_abc123');
      expect(result.name).toBe('test_tool');
      expect(result.input.param1).toBe('value1');
      expect(result.input.param2).toBe('value2');
    });
    
    it('should convert MCP format to OpenAI tool result', () => {
      const mcpResult: NeutralToolResult = {
        type: 'tool_result',
        tool_use_id: 'call_abc123',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      };
      
      const result = McpConverters.mcpToOpenAi(mcpResult);
      
      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('call_abc123');
      expect(result.content).toBe('Test result');
    });
  });
});

describe('McpToolRouter', () => {
  let mcpToolRouter: McpToolRouter;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Get a fresh instance for each test
    // @ts-ignore - Reset the singleton instance
    McpToolRouter['instance'] = undefined;
    mcpToolRouter = McpToolRouter.getInstance();
  });
  
  describe('format detection', () => {
    it('should detect XML format', () => {
      const content = '<test_tool>\n<param1>value1</param1>\n</test_tool>';
      
      const format = mcpToolRouter.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.XML);
    });
    
    it('should detect JSON format', () => {
      const content = '{"type":"tool_use","name":"test_tool","input":{"param1":"value1"}}';
      
      const format = mcpToolRouter.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.NEUTRAL);
    });
    
    it('should detect OpenAI format', () => {
      const content = '{"function_call":{"name":"test_tool","arguments":"{\\"param1\\":\\"value1\\"}"}}';
      
      const format = mcpToolRouter.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.OPENAI);
    });
  });
  
  describe('tool routing', () => {
    beforeEach(async () => {
      await mcpToolRouter.initialize();
    });
    
    it('should route XML tool use requests', async () => {
      // Mock the McpToolExecutor's executeToolFromNeutralFormat method
      const mockExecute = jest.fn().mockResolvedValue({
        type: 'tool_result',
        tool_use_id: 'test-123',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      });
      
      // @ts-ignore - Replace the method
      (mcpToolRouter as any).mcpToolSystem.executeToolFromNeutralFormat = mockExecute;
      
      const request = {
        format: ToolUseFormat.XML,
        content: '<test_tool>\n<param1>value1</param1>\n</test_tool>'
      };
      
      const result = await mcpToolRouter.routeToolUse(request);
      
      expect(result.format).toBe(ToolUseFormat.XML);
      expect(result.content).toContain('tool_use_id="test-123"');
      expect(result.content).toContain('status="success"');
      expect(result.content).toContain('Test result');
      expect(mockExecute).toHaveBeenCalled();
    });
    
    it('should route JSON tool use requests', async () => {
      // Mock the McpToolExecutor's executeToolFromNeutralFormat method
      const mockExecute = jest.fn().mockResolvedValue({
        type: 'tool_result',
        tool_use_id: 'test-123',
        content: [{ type: 'text', text: 'Test result' }],
        status: 'success'
      });
      
      // @ts-ignore - Replace the method
      (mcpToolRouter as any).mcpToolSystem.executeToolFromNeutralFormat = mockExecute;
      
      const request = {
        format: ToolUseFormat.JSON,
        content: {
          type: 'tool_use',
          id: 'test-123',
          name: 'test_tool',
          input: { param1: 'value1' }
        }
      };
      
      const result = await mcpToolRouter.routeToolUse(request);
      
      expect(result.format).toBe(ToolUseFormat.JSON);
      const parsed = JSON.parse(result.content as string);
      expect(parsed.type).toBe('tool_result');
      expect(parsed.tool_use_id).toBe('test-123');
      expect(parsed.status).toBe('success');
      expect(parsed.content[0].text).toBe('Test result');
      expect(mockExecute).toHaveBeenCalled();
    });
    
    it('should handle errors in tool routing', async () => {
      // Mock the McpToolExecutor's executeToolFromNeutralFormat method to throw an error
      const mockExecute = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // @ts-ignore - Replace the method
      (mcpToolRouter as any).mcpToolSystem.executeToolFromNeutralFormat = mockExecute;
      
      const request = {
        format: ToolUseFormat.XML,
        content: '<test_tool>\n<param1>value1</param1>\n</test_tool>'
      };
      
      const result = await mcpToolRouter.routeToolUse(request);
      
      expect(result.format).toBe(ToolUseFormat.XML);
      expect(result.content).toContain('status="error"');
      expect(result.content).toContain('Test error');
      expect(mockExecute).toHaveBeenCalled();
    });
  });
});