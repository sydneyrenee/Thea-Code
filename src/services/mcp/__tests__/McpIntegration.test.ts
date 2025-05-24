import { McpIntegration, handleToolUse } from '../integration/McpIntegration';

// Mock the McpToolRouter
jest.mock('../core/McpToolRouter', () => {
  const mockInstance = {
    on: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    detectFormat: jest.fn().mockReturnValue('xml'),
    routeToolUse: jest.fn().mockImplementation((request: { format: string }) => ({
      format: request.format,
      content: `Routed ${request.format} request`
    }))
  };
  
  return {
    ToolUseFormat: {
      XML: 'xml',
      JSON: 'json',
      OPENAI: 'openai',
      NEUTRAL: 'neutral'
    },
    McpToolRouter: {
      getInstance: jest.fn().mockReturnValue(mockInstance)
    }
  };
});

// Mock the McpToolExecutor
jest.mock('../core/McpToolExecutor', () => {
  const mockInstance = {
    registerTool: jest.fn(),
    unregisterTool: jest.fn().mockReturnValue(true),
    processXmlToolUse: jest.fn().mockImplementation((content) => `Processed XML: ${content}`),
    processJsonToolUse: jest.fn().mockImplementation((content) => `Processed JSON: ${typeof content === 'string' ? content : JSON.stringify(content)}`),
    processOpenAiFunctionCall: jest.fn().mockImplementation((content) => ({
      role: 'tool',
      content: `Processed OpenAI: ${JSON.stringify(content)}`
    }))
  };
  
  return {
    McpToolExecutor: {
      getInstance: jest.fn().mockReturnValue(mockInstance)
    }
  };
});

describe('McpIntegration', () => {
  let mcpIntegration: McpIntegration;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Get a fresh instance for each test
    // @ts-expect-error accessing private singleton for reset
    McpIntegration['instance'] = undefined;
    mcpIntegration = McpIntegration.getInstance();
  });
  
  describe('initialization', () => {
    it('should initialize the MCP tool router', async () => {
      await mcpIntegration.initialize();
      
      const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { initialize: jest.Mock } }).mcpToolRouter;
      expect(mcpToolRouter.initialize).toHaveBeenCalled();
    });
    
    it('should not initialize the MCP tool router if already initialized', async () => {
      // Initialize once
      await mcpIntegration.initialize();
      
      // Clear the mock
      const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { initialize: jest.Mock } }).mcpToolRouter;
      mcpToolRouter.initialize.mockClear();
      
      // Initialize again
      await mcpIntegration.initialize();
      
      // Should not call initialize again
      expect(mcpToolRouter.initialize).not.toHaveBeenCalled();
    });
  });
  
  describe('tool registration', () => {
    it('should register a tool with the MCP tool system', () => {
      const toolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        paramSchema: { type: 'object' },
        handler: () => ({ content: [], isError: false })
      };
      
      mcpIntegration.registerTool(toolDefinition);
      
      const mcpToolSystem = (mcpIntegration as unknown as { mcpToolSystem: { registerTool: jest.Mock } }).mcpToolSystem;
      expect(mcpToolSystem.registerTool).toHaveBeenCalledWith(toolDefinition);
    });
    
    it('should unregister a tool from the MCP tool system', () => {
      const result = mcpIntegration.unregisterTool('test_tool');
      
      const mcpToolSystem = (mcpIntegration as unknown as { mcpToolSystem: { unregisterTool: jest.Mock } }).mcpToolSystem;
      expect(mcpToolSystem.unregisterTool).toHaveBeenCalledWith('test_tool');
      expect(result).toBe(true);
    });
  });
  
  describe('tool processing', () => {
    beforeEach(async () => {
      await mcpIntegration.initialize();
    });
    
    it('should process XML tool use requests', async () => {
      const xmlContent = '<test_tool>\n<param1>value1</param1>\n</test_tool>';

      const result = await mcpIntegration.processXmlToolUse(xmlContent);

      const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { routeToolUse: jest.Mock } }).mcpToolRouter;
      expect(mcpToolRouter.routeToolUse).toHaveBeenCalledWith({
        format: 'xml',
        content: xmlContent
      });
      expect(result).toBe('Routed xml request');
    });
    
    it('should process JSON tool use requests', async () => {
      const jsonContent = {
        type: 'tool_use',
        id: 'test-123',
        name: 'test_tool',
        input: {
          param1: 'value1'
        }
      };

      const result = await mcpIntegration.processJsonToolUse(jsonContent);

      const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { routeToolUse: jest.Mock } }).mcpToolRouter;
      expect(mcpToolRouter.routeToolUse).toHaveBeenCalledWith({
        format: 'json',
        content: jsonContent
      });
      expect(result).toBe('Routed json request');
    });
    
    it('should process OpenAI function call requests', async () => {
      const functionCall = {
        function_call: {
          name: 'test_tool',
          arguments: '{"param1":"value1"}',
          id: 'call_abc123'
        }
      };

      const result = await mcpIntegration.processOpenAiFunctionCall(functionCall);

      const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { routeToolUse: jest.Mock } }).mcpToolRouter;
      expect(mcpToolRouter.routeToolUse).toHaveBeenCalledWith({
        format: 'openai',
        content: functionCall
      });
      expect(result).toEqual('Routed openai request');
    });
    
    it('should route tool use requests based on format', async () => {
      const content = '<test_tool>\n<param1>value1</param1>\n</test_tool>';
      
      const result = await mcpIntegration.routeToolUse(content);
      
      const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { detectFormat: jest.Mock; routeToolUse: jest.Mock } }).mcpToolRouter;
      expect(mcpToolRouter.detectFormat).toHaveBeenCalledWith(content);
      expect(mcpToolRouter.routeToolUse).toHaveBeenCalledWith({
        format: 'xml',
        content
      });
      expect(result).toBe('Routed xml request');
    });
  });
});

describe('handleToolUse', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset the singleton instance
    // @ts-expect-error accessing private singleton for reset
    McpIntegration['instance'] = undefined;
  });
  
  it('should initialize the MCP integration if not already initialized', async () => {
    const content = '<test_tool>\n<param1>value1</param1>\n</test_tool>';
    
    await handleToolUse(content);
    
    // Get the instance that was created
    const mcpIntegration = McpIntegration.getInstance();
    
    // Check that initialize was called
    const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { initialize: jest.Mock; routeToolUse: jest.Mock } }).mcpToolRouter;
    expect(mcpToolRouter.initialize).toHaveBeenCalled();
  });
  
  it('should route the tool use request', async () => {
    const content = '<test_tool>\n<param1>value1</param1>\n</test_tool>';
    
    const result = await handleToolUse(content);
    
    // Get the instance that was created
    const mcpIntegration = McpIntegration.getInstance();
    
    // Check that routeToolUse was called
    const mcpToolRouter = (mcpIntegration as unknown as { mcpToolRouter: { routeToolUse: jest.Mock } }).mcpToolRouter;
    expect(mcpToolRouter.routeToolUse).toHaveBeenCalledWith({
      format: 'xml',
      content
    });
    expect(result).toBe('Routed xml request');
  });
});