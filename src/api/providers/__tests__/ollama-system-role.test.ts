import { OllamaHandler, getOllamaModels } from '../ollama';
import { NeutralConversationHistory } from '../../../shared/neutral-history';
import OpenAI from 'openai';

// Mock the OpenAI client
jest.mock('openai', () => {
  // Create a mock that captures the messages sent to the API
  const mockCreate = jest.fn().mockImplementation(({ messages }) => {
    // Store the messages for later inspection
    (mockCreate as any).lastMessages = messages;
    
    // Return a simple response
    return {
      [Symbol.asyncIterator]: async function* () {
        yield {
          choices: [{
            delta: { content: 'Response' }
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

describe('Ollama System Role Handling', () => {
  let handler: OllamaHandler;
  // Define availableModels as a const directly for .each
  const availableModels: string[] = ['llama2', 'mistral', 'gemma'];
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create handler with test options
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: 'llama2' // Default model for tests
    });
  });
  
  it.each(availableModels)('should use system role for system prompts with %s model', async (modelId) => {
    // Update handler to use the current model
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: modelId
    });
    // Create neutral history
    const neutralHistory: NeutralConversationHistory = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
    ];
    
    // System prompt that contains tool information
    const systemPrompt = 'You are a helpful assistant with access to the following tools: tool1, tool2, tool3';
    
    // Call createMessage
    const stream = handler.createMessage(systemPrompt, neutralHistory);
    
    // Consume the stream to ensure the API is called
    for await (const chunk of stream) {
      // Do nothing with the chunks
    }
    
    // Get the messages that were sent to the API
    const mockCreate = (handler['client'].chat.completions.create as jest.Mock);
    const sentMessages = (mockCreate as any).lastMessages;
    
    // Verify that the system prompt was sent with the system role
    expect(sentMessages).toBeDefined();
    expect(sentMessages.length).toBeGreaterThanOrEqual(2);
    
    // The first message should be the system prompt with role 'system'
    expect(sentMessages[0]).toEqual({
      role: 'system',
      content: systemPrompt
    });
    
    // The second message should be the user message
    expect(sentMessages[1]).toEqual({
      role: 'user',
      content: 'Hello'
    });
  });
  
  it.each(availableModels)('should preserve existing system messages from neutral history with %s model', async (modelId) => {
    // Update handler to use the current model
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: modelId
    });
    // Create neutral history with a system message
    const neutralHistory: NeutralConversationHistory = [
      { role: 'system', content: [{ type: 'text', text: 'Existing system message' }] },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
    ];
    
    // Additional system prompt
    const systemPrompt = 'Additional system prompt';
    
    // Call createMessage
    const stream = handler.createMessage(systemPrompt, neutralHistory);
    
    // Consume the stream to ensure the API is called
    for await (const chunk of stream) {
      // Do nothing with the chunks
    }
    
    // Get the messages that were sent to the API
    const mockCreate = (handler['client'].chat.completions.create as jest.Mock);
    const sentMessages = (mockCreate as any).lastMessages;
    
    // Verify that both system messages were preserved
    expect(sentMessages).toBeDefined();
    expect(sentMessages.length).toBeGreaterThanOrEqual(2);
    
    // The first message should be the existing system message
    expect(sentMessages[0]).toEqual({
      role: 'system',
      content: 'Existing system message'
    });
    
    // The second message should be the user message
    expect(sentMessages[1]).toEqual({
      role: 'user',
      content: 'Hello'
    });
    
    // The additional system prompt should not be added since there's already a system message
    const systemMessages = sentMessages.filter((msg: OpenAI.Chat.ChatCompletionMessageParam) => msg.role === 'system');
    expect(systemMessages.length).toBe(1);
  });
  
  it.each(availableModels)('should handle multiple system messages if they come from neutral history with %s model', async (modelId) => {
    // Update handler to use the current model
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: modelId
    });
    // Create neutral history with multiple system messages
    const neutralHistory: NeutralConversationHistory = [
      { role: 'system', content: [{ type: 'text', text: 'System message 1' }] },
      { role: 'system', content: [{ type: 'text', text: 'System message 2' }] },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
    ];
    
    // Call createMessage with empty system prompt
    const stream = handler.createMessage('', neutralHistory);
    
    // Consume the stream to ensure the API is called
    for await (const chunk of stream) {
      // Do nothing with the chunks
    }
    
    // Get the messages that were sent to the API
    const mockCreate = (handler['client'].chat.completions.create as jest.Mock);
    const sentMessages = (mockCreate as any).lastMessages;
    
    // Verify that both system messages were preserved
    expect(sentMessages).toBeDefined();
    expect(sentMessages.length).toBeGreaterThanOrEqual(3);
    
    // The first two messages should be the system messages
    expect(sentMessages[0]).toEqual({
      role: 'system',
      content: 'System message 1'
    });
    
    expect(sentMessages[1]).toEqual({
      role: 'system',
      content: 'System message 2'
    });
    
    // The third message should be the user message
    expect(sentMessages[2]).toEqual({
      role: 'user',
      content: 'Hello'
    });
  });
  
  it.each(availableModels)('should not convert tool information to user messages with %s model', async (modelId) => {
    // Update handler to use the current model
    handler = new OllamaHandler({
      ollamaBaseUrl: 'http://localhost:10000',
      ollamaModelId: modelId
    });
    // Create neutral history with tool-related messages
    const neutralHistory: NeutralConversationHistory = [
      { 
        role: 'user', 
        content: [{ type: 'text', text: 'Use a tool' }] 
      },
      { 
        role: 'assistant', 
        content: [
          { type: 'text', text: 'I will use a tool' },
          { 
            type: 'tool_use', 
            id: 'tool1',
            name: 'calculator',
            input: { expression: '2+2' }
          }
        ] 
      },
      { 
        role: 'tool', 
        content: [{ 
          type: 'tool_result',
          tool_use_id: 'tool1',
          content: [{ type: 'text', text: '4' }]
        }] 
      }
    ];
    
    // System prompt with tool definitions
    const systemPrompt = 'You have access to the following tools: calculator';
    
    // Call createMessage
    const stream = handler.createMessage(systemPrompt, neutralHistory);
    
    // Consume the stream to ensure the API is called
    for await (const chunk of stream) {
      // Do nothing with the chunks
    }
    
    // Get the messages that were sent to the API
    const mockCreate = (handler['client'].chat.completions.create as jest.Mock);
    const sentMessages = (mockCreate as any).lastMessages;
    
    // Verify that the system prompt was sent with the system role
    expect(sentMessages).toBeDefined();
    expect(sentMessages[0]).toEqual({
      role: 'system',
      content: systemPrompt
    });
    
    // Verify that no tool information was converted to user messages
    const userMessages = sentMessages.filter((msg: OpenAI.Chat.ChatCompletionMessageParam) => 
      msg.role === 'user' && typeof msg.content === 'string' && msg.content.includes('calculator')
    );
    expect(userMessages.length).toBe(0);
  });
});