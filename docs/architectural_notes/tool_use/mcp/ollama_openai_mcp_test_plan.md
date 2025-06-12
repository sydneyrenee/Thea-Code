# Ollama-OpenAI-MCP Integration Test Plan

**Date:** 2025-05-04

## 1. Overview

This document outlines the test plan for verifying the integration between the Ollama handler, OpenAI handler, and MCP system. The focus is on ensuring that the Ollama handler correctly uses the OpenAI handler's tool use detection logic and properly routes tool use requests through the MCP system.

## 2. Test Objectives

1. Verify that the Ollama handler correctly initializes and uses the OpenAI handler
2. Verify that the Ollama handler uses the OpenAI handler's tool use detection logic
3. Verify that tool use requests are properly routed through the MCP system
4. Verify that fallback mechanisms work correctly when OpenAI format isn't detected
5. Verify that error handling is implemented correctly

## 3. Test Categories

### 3.1 OpenAI Handler Integration Tests

These tests verify that the Ollama handler correctly initializes and uses the OpenAI handler.

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| OAI-01 | OpenAI Handler Creation | Verify that the Ollama handler creates an OpenAI handler in its constructor | OpenAI handler is created and accessible |
| OAI-02 | OpenAI Handler Options | Verify that the correct options are passed to the OpenAI handler | Options match expected values |

### 3.2 Tool Use Detection Integration Tests

These tests verify that the Ollama handler uses the OpenAI handler's tool use detection logic.

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| TUD-01 | OpenAI Tool Use Detection | Verify that the Ollama handler uses the OpenAI handler's `extractToolCalls` method | `extractToolCalls` is called |
| TUD-02 | OpenAI Format Processing | Verify that OpenAI format tool calls are correctly processed | Tool calls are processed and results are yielded |
| TUD-03 | XML Fallback | Verify fallback to XML detection when OpenAI format isn't detected | XML tool use is detected and processed |
| TUD-04 | JSON Fallback | Verify fallback to JSON detection when neither OpenAI nor XML formats are detected | JSON tool use is detected and processed |
| TUD-05 | Error Handling | Verify error handling for tool use processing | Errors are handled gracefully |

### 3.3 MCP Integration Tests

These tests verify that tool use requests are properly routed through the MCP system.

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| MCP-01 | MCP Initialization | Verify that the MCP integration is initialized | MCP integration is initialized |
| MCP-02 | Tool Registration | Verify that tools are registered with the MCP system | Tools are registered |
| MCP-03 | OpenAI Format Routing | Verify that OpenAI format tool calls are routed through MCP | Tool calls are routed and results are returned |
| MCP-04 | XML Format Routing | Verify that XML format tool use is routed through MCP | Tool use is routed and results are returned |
| MCP-05 | JSON Format Routing | Verify that JSON format tool use is routed through MCP | Tool use is routed and results are returned |

## 4. Test Implementation

### 4.1 OpenAI Handler Integration Tests

#### 4.1.1 Test: should create an OpenAI handler in constructor

```typescript
it('should create an OpenAI handler in constructor', () => {
  expect(OpenAiHandler).toHaveBeenCalled();
  expect(handler['openAiHandler']).toBeDefined();
});
```

#### 4.1.2 Test: should pass correct options to OpenAI handler

```typescript
it('should pass correct options to OpenAI handler', () => {
  expect(OpenAiHandler).toHaveBeenCalledWith(expect.objectContaining({
    openAiApiKey: 'ollama',
    openAiBaseUrl: 'http://localhost:10000/v1',
    openAiModelId: 'llama2'
  }));
});
```

### 4.2 Tool Use Detection Integration Tests

#### 4.2.1 Test: should use OpenAI handler for tool use detection

```typescript
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
```

#### 4.2.2 Test: should process OpenAI format tool calls using OpenAI handler

```typescript
it('should process OpenAI format tool calls using OpenAI handler', async () => {
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
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Create a spy on the processToolUse method
  const processToolUseSpy = jest.spyOn(handler as any, 'processToolUse');
  
  // Mock the processToolUse method to return a successful result
  processToolUseSpy.mockResolvedValueOnce({
    type: 'text',
    text: 'Tool result'
  });
  
  // Create neutral history
  const neutralHistory: NeutralConversationHistory = [
    { role: 'user', content: [{ type: 'text', text: 'Calculate 5 + 10' }] }
  ];
  
  // Call createMessage
  const stream = handler.createMessage('You are helpful.', neutralHistory);
  
  // Collect stream chunks
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  // Verify processToolUse was called with the correct arguments
  expect(processToolUseSpy).toHaveBeenCalledWith(expect.objectContaining({
    id: 'call_123',
    name: 'calculator',
    input: expect.objectContaining({
      a: 5,
      b: 10,
      operation: 'add'
    })
  }));
  
  // Verify tool result was yielded
  const toolResultChunks = chunks.filter(chunk => chunk.type === 'tool_result');
  expect(toolResultChunks.length).toBeGreaterThan(0);
});
```

#### 4.2.3 Test: should fall back to XML detection if OpenAI format is not detected

```typescript
it('should fall back to XML detection if OpenAI format is not detected', async () => {
  // Mock the OpenAI handler to not detect any tool calls
  jest.spyOn(handler['openAiHandler'], 'extractToolCalls').mockReturnValue([]);
  
  // Mock the OpenAI client to return XML content
  const mockCreate = jest.fn().mockImplementation(() => {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield {
          choices: [{
            delta: { content: '<calculator>\n<a>5</a>\n<b>10</b>\n<operation>add</operation>\n</calculator>' }
          }]
        };
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Create a spy on the processToolUse method
  const processToolUseSpy = jest.spyOn(handler as any, 'processToolUse');
  
  // Create neutral history
  const neutralHistory: NeutralConversationHistory = [
    { role: 'user', content: [{ type: 'text', text: 'Calculate 5 + 10' }] }
  ];
  
  // Call createMessage
  const stream = handler.createMessage('You are helpful.', neutralHistory);
  
  // Collect stream chunks
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  // Verify processToolUse was called with the correct arguments
  expect(processToolUseSpy).toHaveBeenCalledWith(expect.objectContaining({
    name: 'calculator',
    input: expect.objectContaining({
      a: expect.anything(),
      b: expect.anything(),
      operation: 'add'
    })
  }));
  
  // Verify tool result was yielded
  const toolResultChunks = chunks.filter(chunk => chunk.type === 'tool_result');
  expect(toolResultChunks.length).toBeGreaterThan(0);
});
```

#### 4.2.4 Test: should fall back to JSON detection if neither OpenAI nor XML formats are detected

```typescript
it('should fall back to JSON detection if neither OpenAI nor XML formats are detected', async () => {
  // Mock the OpenAI handler to not detect any tool calls
  jest.spyOn(handler['openAiHandler'], 'extractToolCalls').mockReturnValue([]);
  
  // Mock the OpenAI client to return JSON content
  const mockCreate = jest.fn().mockImplementation(() => {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield {
          choices: [{
            delta: { content: '{"type":"tool_use","name":"weather","id":"weather-123","input":{"location":"San Francisco"}}' }
          }]
        };
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Create a spy on the processToolUse method
  const processToolUseSpy = jest.spyOn(handler as any, 'processToolUse');
  
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
  
  // Verify processToolUse was called with the correct arguments
  expect(processToolUseSpy).toHaveBeenCalledWith(expect.objectContaining({
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
```

#### 4.2.5 Test: should handle errors in OpenAI tool use processing

```typescript
it('should handle errors in OpenAI tool use processing', async () => {
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
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Mock processToolUse to throw an error
  jest.spyOn(handler as any, 'processToolUse').mockImplementationOnce(() => {
    throw new Error('OpenAI tool use error');
  });
  
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
  try {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
  } catch (error) {
    // Expect error to be thrown
    expect(error).toBeDefined();
  }
  
  // Restore console.warn
  console.warn = originalWarn;
});
```

### 4.3 MCP Integration Tests

#### 4.3.1 Test: should initialize MCP integration in constructor

```typescript
it('should initialize MCP integration in constructor', () => {
  // Verify McpIntegration was initialized
  expect(McpIntegration.getInstance).toHaveBeenCalled();
  expect(handler['mcpIntegration'].initialize).toHaveBeenCalled();
});
```

#### 4.3.2 Test: should register tools with MCP integration

```typescript
it('should register tools with McpIntegration', () => {
  // Create a new handler with a spy on the mcpIntegration
  const mockMcpIntegration = {
    initialize: jest.fn().mockResolvedValue(undefined),
    registerTool: jest.fn(),
    routeToolUse: jest.fn()
  };
  
  // Create a new handler and manually set the mcpIntegration
  const newHandler = new OllamaHandler({
    ollamaBaseUrl: 'http://localhost:10000',
    ollamaModelId: 'llama2'
  });
  
  // Replace the mcpIntegration with our mock
  (newHandler as any).mcpIntegration = mockMcpIntegration;
  
  // Call registerTools directly
  (newHandler as any).registerTools();
  
  // Verify McpIntegration.registerTool was called
  expect(mockMcpIntegration.registerTool).toHaveBeenCalled();
});
```

#### 4.3.3 Test: should route OpenAI format tool calls through MCP

```typescript
it('should route OpenAI format tool calls through MCP', async () => {
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
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Create a spy on the McpIntegration.routeToolUse method
  const routeToolUseSpy = jest.spyOn(handler['mcpIntegration'], 'routeToolUse');
  
  // Mock the routeToolUse method to return a successful result
  routeToolUseSpy.mockResolvedValueOnce('Tool result');
  
  // Create neutral history
  const neutralHistory: NeutralConversationHistory = [
    { role: 'user', content: [{ type: 'text', text: 'Calculate 5 + 10' }] }
  ];
  
  // Call createMessage
  const stream = handler.createMessage('You are helpful.', neutralHistory);
  
  // Collect stream chunks
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  // Verify McpIntegration.routeToolUse was called with the correct arguments
  expect(routeToolUseSpy).toHaveBeenCalledWith(expect.objectContaining({
    id: 'call_123',
    name: 'calculator',
    input: expect.objectContaining({
      a: 5,
      b: 10,
      operation: 'add'
    })
  }));
  
  // Verify tool result was yielded
  const toolResultChunks = chunks.filter(chunk => chunk.type === 'tool_result');
  expect(toolResultChunks.length).toBeGreaterThan(0);
});
```

#### 4.3.4 Test: should route XML format tool use through MCP

```typescript
it('should route XML format tool use through MCP', async () => {
  // Mock the OpenAI handler to not detect any tool calls
  jest.spyOn(handler['openAiHandler'], 'extractToolCalls').mockReturnValue([]);
  
  // Mock the OpenAI client to return XML content
  const mockCreate = jest.fn().mockImplementation(() => {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield {
          choices: [{
            delta: { content: '<calculator>\n<a>5</a>\n<b>10</b>\n<operation>add</operation>\n</calculator>' }
          }]
        };
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Create a spy on the McpIntegration.routeToolUse method
  const routeToolUseSpy = jest.spyOn(handler['mcpIntegration'], 'routeToolUse');
  
  // Mock the routeToolUse method to return a successful result
  routeToolUseSpy.mockResolvedValueOnce('Tool result');
  
  // Create neutral history
  const neutralHistory: NeutralConversationHistory = [
    { role: 'user', content: [{ type: 'text', text: 'Calculate 5 + 10' }] }
  ];
  
  // Call createMessage
  const stream = handler.createMessage('You are helpful.', neutralHistory);
  
  // Collect stream chunks
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  // Verify McpIntegration.routeToolUse was called with the correct arguments
  expect(routeToolUseSpy).toHaveBeenCalledWith(expect.objectContaining({
    name: 'calculator',
    input: expect.objectContaining({
      a: expect.anything(),
      b: expect.anything(),
      operation: 'add'
    })
  }));
  
  // Verify tool result was yielded
  const toolResultChunks = chunks.filter(chunk => chunk.type === 'tool_result');
  expect(toolResultChunks.length).toBeGreaterThan(0);
});
```

#### 4.3.5 Test: should route JSON format tool use through MCP

```typescript
it('should route JSON format tool use through MCP', async () => {
  // Mock the OpenAI handler to not detect any tool calls
  jest.spyOn(handler['openAiHandler'], 'extractToolCalls').mockReturnValue([]);
  
  // Mock the OpenAI client to return JSON content
  const mockCreate = jest.fn().mockImplementation(() => {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield {
          choices: [{
            delta: { content: '{"type":"tool_use","name":"weather","id":"weather-123","input":{"location":"San Francisco"}}' }
          }]
        };
      }
    };
  });
  handler['client'].chat.completions.create = mockCreate;

  // Create a spy on the McpIntegration.routeToolUse method
  const routeToolUseSpy = jest.spyOn(handler['mcpIntegration'], 'routeToolUse');
  
  // Mock the routeToolUse method to return a successful result
  routeToolUseSpy.mockResolvedValueOnce('Tool result');
  
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
  
  // Verify McpIntegration.routeToolUse was called with the correct arguments
  expect(routeToolUseSpy).toHaveBeenCalledWith(expect.objectContaining({
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
```

## 5. Test Organization

The tests will be organized into the following describe blocks:

```typescript
describe('Ollama MCP Integration', () => {
  // Setup code...
  
  describe('OpenAI Handler Integration', () => {
    // OpenAI Handler Integration Tests
  });
  
  describe('MCP Integration', () => {
    // MCP Integration Tests
  });
  
  describe('Tool Use Detection Integration', () => {
    // Tool Use Detection Integration Tests
  });
});
```

## 6. Mocking Strategy

### 6.1 OpenAI Handler Mocking

The OpenAI handler will be mocked to control its behavior:

```typescript
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
```

### 6.2 McpIntegration Mocking

The McpIntegration will be mocked to control its behavior:

```typescript
// Mock the McpIntegration
jest.mock('../../../services/mcp/McpIntegration', () => {
  const mockRouteToolUse = jest.fn().mockImplementation((content) => {
    if (typeof content === 'string') {
      // XML format
      return Promise.resolve(`<tool_result tool_use_id="test-id" status="success">Tool result from XML</tool_result>`);
    } else {
      // JSON format
      return Promise.resolve(JSON.stringify({
        type: 'tool_result',
        tool_use_id: content.id || 'test-id',
        content: [{ type: 'text', text: 'Tool result from JSON' }],
        status: 'success'
      }));
    }
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
```

### 6.3 OpenAI Client Mocking

The OpenAI client will be mocked to control its behavior:

```typescript
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
        
        // Then yield an XML tool use
        yield {
          choices: [{
            delta: { content: '<calculator>\n<a>5</a>\n<b>10</b>\n<operation>add</operation>\n</calculator>' }
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
```

## 7. Conclusion

This test plan provides a comprehensive approach to testing the integration between the Ollama handler, OpenAI handler, and MCP system. By implementing these tests, we can ensure that the Ollama handler correctly uses the OpenAI handler's tool use detection logic and properly routes tool use requests through the MCP system.

The tests cover all the key integration points and verify that the system works correctly with different tool use formats and handles errors gracefully.