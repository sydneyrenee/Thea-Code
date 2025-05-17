import { OllamaHandler, getOllamaModels } from '../ollama';
import { McpIntegration } from '../../../services/mcp/McpIntegration';
import { NeutralConversationHistory } from '../../../shared/neutral-history';
import { HybridMatcher } from '../../../utils/json-xml-bridge';
import { OpenAiHandler } from '../openai';

// Mock the OpenAI handler
jest.mock('../openai', () => {
  const mockExtractToolCalls = jest.fn().mockImplementation((delta) => {
    if (delta.tool_calls) {
      return delta.tool_calls;
    }
    return [];
  });

  const mockHasToolCalls = jest.fn().mockImplementation((delta) => {
    return mockExtractToolCalls(delta).length > 0;
  });

  return {
    OpenAiHandler: jest.fn().mockImplementation(() => ({
      extractToolCalls: mockExtractToolCalls,
      hasToolCalls: mockHasToolCalls,
      processToolUse: jest.fn().mockResolvedValue({
        type: 'text',
        text: 'Tool result from OpenAI handler'
      })
    }))
  };
});

// Mock the McpIntegration
jest.mock('../../../services/mcp/McpIntegration', () => {
  const mockRouteToolUse = jest.fn().mockImplementation((content) => {
    // For OpenAI-compatible providers like Ollama, only JSON format is supported
    return Promise.resolve(JSON.stringify({
      type: 'tool_result',
      tool_use_id: content.id || 'test-id',
      content: [{ type: 'text', text: 'Tool result from JSON' }],
      status: 'success'
    }));
  });

  // Create a mock instance
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    registerTool: jest.fn(),
    routeToolUse: mockRouteToolUse
  };

  // Create a class with a static method
  class MockMcpIntegration {
    initialize = jest.fn().mockResolvedValue(undefined);
    registerTool = jest.fn();
    routeToolUse = mockRouteToolUse;

    static getInstance = jest.fn().mockReturnValue(mockInstance);
  }

  return {
    McpIntegration: MockMcpIntegration
  };
});

// Mock the OpenAI client
jest.mock('openai', () => {
  const mockCreate = jest.fn().mockImplementation(() => {
    return {
      [Symbol.asyncIterator]: async function* () {
        // First yield a regular text response
        yield {
          choices: [{
            delta: { content: 'Hello' }
          }]
        };
        
        // Then yield a JSON tool use
        yield {
          choices: [{
            delta: { content: '{"type":"tool_use","name":"weather","id":"weather-123","input":{"location":"San Francisco"}}' }
          }]
        };
      }
    };
  });

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }))
  };
});

// Mock the HybridMatcher
jest.mock('../../../utils/json-xml-bridge', () => {
  return {
    HybridMatcher: jest.fn().mockImplementation(() => ({
      update: jest.fn().mockImplementation((text) => {
        if (text.includes('{"type":"tool_use"')) {
          return []; // Return empty array to let the JSON tool use detection handle it
        }
        return [{ type: 'text', text }];
      }),
      final: jest.fn().mockReturnValue([]),
      getDetectedFormat: jest.fn().mockReturnValue('json')
    }))
  };
});
describe('Ollama MCP Integration', () => {
  let handler: OllamaHandler;
  let availableModels: string[] = [];
  
  beforeAll(async () => {
    try {
      // Get all available models
      availableModels = await getOllamaModels('http://localhost:10000');
      console.log('Available Ollama models:', availableModels);
    } catch (error) {
      console.warn('Error fetching Ollama models:', error);
    }
    
    // If no models are found, use a default model name for testing
    if (!availableModels || availableModels.length === 0) {
      availableModels = ['default-model'];
    }
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create handler with mock options
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: 'llama2' // Default model for tests
    });
  });

  describe('OpenAI Handler Integration', () => {
    it('should create an OpenAI handler in constructor', () => {
      expect(OpenAiHandler).toHaveBeenCalled();
      expect(handler['openAiHandler']).toBeDefined();
    });

    it('should pass correct options to OpenAI handler', () => {
      expect(OpenAiHandler).toHaveBeenCalledWith(expect.objectContaining({
        openAiApiKey: 'ollama',
        openAiBaseUrl: 'http://localhost:10000/v1',
        openAiModelId: 'llama2'
      }));
    });
    
    it('should use OpenAI handler for tool use detection', async () => {
      // Create a spy on the OpenAI handler's extractToolCalls method
      const extractToolCallsSpy = jest.spyOn(handler['openAiHandler'], 'extractToolCalls');
      
      // Create neutral history
      const neutralHistory: NeutralConversationHistory = [
        { role: 'user', content: [{ type: 'text', text: 'Use a tool' }] }
      ];
      
      // Call createMessage
      const stream = handler.createMessage('You are helpful.', neutralHistory);
      
      // Collect stream chunks
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      // Verify OpenAI handler's extractToolCalls method was called
      expect(extractToolCallsSpy).toHaveBeenCalled();
    });
  });
  
  it('should initialize McpIntegration in constructor', () => {
    // Verify McpIntegration was initialized
    expect(McpIntegration.getInstance).toHaveBeenCalled();
    expect(handler['mcpIntegration'].initialize).toHaveBeenCalled();
  });
  
  it('should have access to McpIntegration', () => {
    // Verify handler has mcpIntegration
    expect(handler['mcpIntegration']).toBeDefined();
  });
  
  
  it('should process JSON tool use through McpIntegration', async () => {
    // Use the first available model or default to 'llama2'
    const modelId = availableModels.length > 0 ? availableModels[0] : 'llama2';
    // Update handler to use the current model
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: modelId
    });
    // Create neutral history
    const neutralHistory: NeutralConversationHistory = [
      { role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }
    ];
    
    // Call createMessage
    const stream = handler.createMessage('You are helpful.', neutralHistory);
    
    // Collect stream chunks
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    // Verify McpIntegration.routeToolUse was called with JSON content
    expect(handler['mcpIntegration'].routeToolUse).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tool_use',
      name: 'weather',
      id: 'weather-123',
      input: expect.objectContaining({
        location: 'San Francisco'
      })
    }));
    
    // Verify tool result was yielded
    const toolResultChunks = chunks.filter(chunk => chunk.type === 'tool_result');
    expect(toolResultChunks.length).toBeGreaterThan(0);
  });
  
  
  it('should handle errors in JSON tool use processing', async () => {
    // Use the first available model or default to 'llama2'
    const modelId = availableModels.length > 0 ? availableModels[0] : 'llama2';
    // Update handler to use the current model
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: modelId
    });
    // Mock processToolUse to throw an error for JSON
    jest.spyOn(handler['mcpIntegration'], 'routeToolUse')
      .mockImplementationOnce(() => { throw new Error('JSON tool use error'); }); // JSON call fails
    
    // Create neutral history
    const neutralHistory: NeutralConversationHistory = [
      { role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }
    ];
    
    // Mock console.warn
    const originalWarn = console.warn;
    console.warn = jest.fn();
    
    // Call createMessage
    const stream = handler.createMessage('You are helpful.', neutralHistory);
    
    // Collect stream chunks
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    // Verify console.warn was called
    expect(console.warn).toHaveBeenCalledWith('Error processing JSON tool use:', expect.any(Error));
    
    // Restore console.warn
    console.warn = originalWarn;
  });

  describe('Tool Use Detection and Processing', () => {

    it('should have access to OpenAI handler for tool use detection', () => {
      // Verify the Ollama handler has an OpenAI handler
      expect(handler['openAiHandler']).toBeDefined();
      
      // Verify the OpenAI handler has the extractToolCalls method
      expect(handler['openAiHandler'].extractToolCalls).toBeDefined();
      expect(typeof handler['openAiHandler'].extractToolCalls).toBe('function');
    });


    it('should fall back to JSON detection if OpenAI format is not detected', async () => {
      // Mock the OpenAI client to return JSON content
      const mockCreate = jest.fn().mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: async function* () {
            // First yield a JSON tool use
            yield {
              choices: [{
                delta: { content: '{"type":"tool_use","name":"weather","id":"weather-123","input":{"location":"San Francisco"}}' }
              }]
            };
            
            // Then yield a tool result to simulate the handler's response
            yield {
              choices: [{
                delta: { content: 'Tool result from JSON' }
              }]
            };
          }
        };
      });
      handler['client'].chat.completions.create = mockCreate;
      
      // Create neutral history
      const neutralHistory: NeutralConversationHistory = [
        { role: 'user', content: [{ type: 'text', text: 'What is the weather in San Francisco?' }] }
      ];
      
      // Call createMessage
      const stream = handler.createMessage('You are helpful.', neutralHistory);
      
      // Collect stream chunks
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      // Verify tool result was yielded
      const toolResultChunks = chunks.filter(chunk => chunk.type === 'tool_result');
      expect(toolResultChunks.length).toBeGreaterThan(0);
      
      // Verify the tool result has the expected ID
      if (toolResultChunks.length > 0) {
        expect(toolResultChunks[0].id).toBe('weather-123');
      }
    });

    it('should handle errors in tool use processing', async () => {
      // Mock the OpenAI client to return a tool call in OpenAI format
      const mockCreate = jest.fn().mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              choices: [{
                delta: {
                  tool_calls: [{
                    id: 'call_123',
                    function: {
                      name: 'calculator',
                      arguments: '{"a":5,"b":10,"operation":"add"}'
                    }
                  }]
                }
              }]
            };
            
            // Simulate an error by throwing
            throw new Error('OpenAI tool use error');
          }
        };
      });
      handler['client'].chat.completions.create = mockCreate;
      
      // Mock console.warn
      const originalWarn = console.warn;
      console.warn = jest.fn();
      
      // Create neutral history
      const neutralHistory: NeutralConversationHistory = [
        { role: 'user', content: [{ type: 'text', text: 'Calculate 5 + 10' }] }
      ];
      
      // Call createMessage
      const stream = handler.createMessage('You are helpful.', neutralHistory);
      
      // Collect stream chunks
      const chunks = [];
      let error;
      try {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      } catch (e) {
        error = e;
      }
      
      // Verify an error was thrown
      expect(error).toBeDefined();
      
      // Restore console.warn
      console.warn = originalWarn;
    });
    
    it('should have access to processToolUse method for handling tool calls', () => {
      // Verify the Ollama handler has a processToolUse method
      expect(handler['processToolUse']).toBeDefined();
      expect(typeof handler['processToolUse']).toBe('function');
      
      // Verify the Ollama handler has access to McpIntegration
      expect(handler['mcpIntegration']).toBeDefined();
      expect(handler['mcpIntegration'].routeToolUse).toBeDefined();
      expect(typeof handler['mcpIntegration'].routeToolUse).toBe('function');
    });
  });
});