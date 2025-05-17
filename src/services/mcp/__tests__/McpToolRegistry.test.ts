import { McpToolRegistry } from '../McpToolRegistry';
import { ToolDefinition } from '../EmbeddedMcpServer';

describe('McpToolRegistry', () => {
  let registry: McpToolRegistry;
  
  beforeEach(() => {
    // Get a fresh instance of the registry for each test
    registry = McpToolRegistry.getInstance();
    
    // Clear any existing tools
    const tools = registry.getAllTools();
    for (const name of tools.keys()) {
      registry.unregisterTool(name);
    }
  });
  
  test('should register a tool', () => {
    // Create a test tool definition
    const toolDefinition: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      paramSchema: {
        param: { type: 'string', description: 'A test parameter' }
      },
      handler: async (args: Record<string, unknown>) => {
        return {
          content: [{ type: 'text', text: `Executed test_tool with param: ${args.param}` }]
        };
      }
    };
    
    // Register the tool
    registry.registerTool(toolDefinition);
    
    // Verify that the tool was registered
    expect(registry.hasTool('test_tool')).toBe(true);
    expect(registry.getTool('test_tool')).toEqual(toolDefinition);
  });
  
  test('should unregister a tool', () => {
    // Create and register a test tool
    const toolDefinition: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      handler: async () => ({ content: [] })
    };
    
    registry.registerTool(toolDefinition);
    expect(registry.hasTool('test_tool')).toBe(true);
    
    // Unregister the tool
    const result = registry.unregisterTool('test_tool');
    
    // Verify that the tool was unregistered
    expect(result).toBe(true);
    expect(registry.hasTool('test_tool')).toBe(false);
    expect(registry.getTool('test_tool')).toBeUndefined();
  });
  
  test('should return false when unregistering a non-existent tool', () => {
    // Attempt to unregister a tool that doesn't exist
    const result = registry.unregisterTool('non_existent_tool');
    
    // Verify that the result is false
    expect(result).toBe(false);
  });
  
  test('should get all registered tools', () => {
    // Create and register multiple tools
    const tool1: ToolDefinition = {
      name: 'tool1',
      description: 'Tool 1',
      handler: async () => ({ content: [] })
    };
    
    const tool2: ToolDefinition = {
      name: 'tool2',
      description: 'Tool 2',
      handler: async () => ({ content: [] })
    };
    
    registry.registerTool(tool1);
    registry.registerTool(tool2);
    
    // Get all tools
    const tools = registry.getAllTools();
    
    // Verify that all tools are returned
    expect(tools.size).toBe(2);
    expect(tools.get('tool1')).toEqual(tool1);
    expect(tools.get('tool2')).toEqual(tool2);
  });
  
  test('should execute a tool', async () => {
    // Create and register a test tool
    const toolDefinition: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      handler: async (args: Record<string, unknown>) => {
        return {
          content: [{ type: 'text', text: `Executed with param: ${args.param}` }]
        };
      }
    };
    
    registry.registerTool(toolDefinition);
    
    // Execute the tool
    const result = await registry.executeTool('test_tool', { param: 'test value' });
    
    // Verify the result
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Executed with param: test value');
  });
  
  test('should throw an error when executing a non-existent tool', async () => {
    // Attempt to execute a tool that doesn't exist
    await expect(registry.executeTool('non_existent_tool'))
      .rejects
      .toThrow("Tool 'non_existent_tool' not found");
  });
  
  test('should handle errors in tool execution', async () => {
    // Create and register a tool that throws an error
    const toolDefinition: ToolDefinition = {
      name: 'error_tool',
      description: 'A tool that throws an error',
      handler: async () => {
        throw new Error('Test error');
      }
    };
    
    registry.registerTool(toolDefinition);
    
    // Attempt to execute the tool
    await expect(registry.executeTool('error_tool'))
      .rejects
      .toThrow("Error executing tool 'error_tool': Test error");
  });
  
  test('should emit events when registering and unregistering tools', () => {
    // Create event listeners
    const registerListener = jest.fn();
    const unregisterListener = jest.fn();
    
    registry.on('tool-registered', registerListener);
    registry.on('tool-unregistered', unregisterListener);
    
    // Create a test tool
    const toolDefinition: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      handler: async () => ({ content: [] })
    };
    
    // Register the tool
    registry.registerTool(toolDefinition);
    
    // Verify that the register event was emitted
    expect(registerListener).toHaveBeenCalledWith('test_tool');
    
    // Unregister the tool
    registry.unregisterTool('test_tool');
    
    // Verify that the unregister event was emitted
    expect(unregisterListener).toHaveBeenCalledWith('test_tool');
    
    // Clean up event listeners
    registry.removeAllListeners();
  });
});