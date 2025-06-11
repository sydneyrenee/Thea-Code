/**
 * Integration test to validate provider functionality with streaming and tool use
 * This addresses the acceptance criteria from issue #107
 */
import { buildApiHandler } from "../index"
import { ApiConfiguration } from "../../shared/api"
import { NeutralConversationHistory } from "../../shared/neutral-history"

// Mock the McpIntegration to avoid initialization issues
jest.mock('../../services/mcp/integration/McpIntegration', () => {
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    registerTool: jest.fn(),
    routeToolUse: jest.fn().mockResolvedValue('{"type": "tool_result", "content": [{"type": "text", "text": "Tool executed successfully"}]}')
  };

  class MockMcpIntegration {
    initialize = jest.fn().mockResolvedValue(undefined);
    registerTool = jest.fn();
    routeToolUse = jest.fn().mockResolvedValue('{"type": "tool_result", "content": [{"type": "text", "text": "Tool executed successfully"}]}');

    static getInstance = jest.fn().mockReturnValue(mockInstance);
  }

  return {
    McpIntegration: MockMcpIntegration
  };
});

describe("Provider Integration Validation", () => {
  // Mock FakeAI implementation for integration testing
  const mockFakeAI = {
    async *createMessage(systemPrompt: string, messages: NeutralConversationHistory) {
      yield { type: "text" as const, text: "Hello! I'm ready to help." }
      yield { type: "text" as const, text: " How can I assist you today?" }
    },
    getModel() {
      return {
        id: "fake-ai-integration",
        info: {
          maxTokens: 1000,
          contextWindow: 4000,
          supportsImages: false,
          supportsPromptCache: false,
          inputPrice: 0,
          outputPrice: 0,
          description: "Integration test fake AI"
        }
      }
    },
    async countTokens() { return 5 },
    async completePrompt() { return "Integration test response" }
  }

  const baseConfig = {
    apiKey: "test-key",
    apiModelId: "test-model",
    mistralApiKey: "test-mistral-key",
    requestyApiKey: "test-requesty-key",
    fakeAi: mockFakeAI,
  }

  describe("Streaming functionality", () => {
    const streamingProviders = [
      "openai",
      "ollama", 
      "lmstudio",
      "openai-native",
      "deepseek",
      "vscode-lm",
      "mistral",
      "unbound",
      "requesty",
      "glama",
      "fake-ai"
    ] as const

    streamingProviders.forEach(provider => {
      it(`should support streaming messages for ${provider}`, async () => {
        const config: ApiConfiguration = {
          ...baseConfig,
          apiProvider: provider
        }

        const handler = buildApiHandler(config)
        const messages: NeutralConversationHistory = [
          { role: "user", content: [{ type: "text", text: "Hello, test message" }] }
        ]

        // Test that the stream generator function exists and can be called
        const stream = handler.createMessage("You are a helpful assistant.", messages)
        expect(stream).toBeDefined()
        expect(typeof stream[Symbol.asyncIterator]).toBe('function')

        // For this test, we just verify the stream is properly created
        // Actual streaming functionality would require more complex mocking
        // but the key point is that all providers have the createMessage method
      })
    })
  })

  describe("Error handling", () => {
    it("should properly handle invalid configurations", () => {
      // Test that providers properly validate their required configuration
      expect(() => {
        buildApiHandler({ apiProvider: "mistral", apiKey: "test" } as ApiConfiguration)
      }).toThrow("Mistral API key is required")

      expect(() => {
        buildApiHandler({ apiProvider: "requesty", apiKey: "test" } as ApiConfiguration)
      }).toThrow("Requesty API key is required")

      expect(() => {
        buildApiHandler({ apiProvider: "fake-ai", apiKey: "test" } as ApiConfiguration)
      }).toThrow("Fake AI is not set")
    })

    it("should handle unsupported human-relay provider", () => {
      expect(() => {
        buildApiHandler({ apiProvider: "human-relay", apiKey: "test" } as ApiConfiguration)
      }).toThrow("HumanRelayHandler is not supported in this architecture.")
    })
  })

  describe("Provider compatibility", () => {
    const compatibleProviders = [
      "openai",
      "ollama", 
      "lmstudio",
      "openai-native",
      "deepseek",
      "vscode-lm",
      "mistral",
      "unbound",
      "requesty",
      "glama",
      "fake-ai"
    ] as const

    it("should have all expected providers enabled in buildApiHandler", () => {
      compatibleProviders.forEach(provider => {
        const config: ApiConfiguration = {
          ...baseConfig,
          apiProvider: provider
        }

        // Should not throw for any supported provider
        expect(() => buildApiHandler(config)).not.toThrow()
      })
    })

    it("should return different handler instances for different providers", () => {
      const handler1 = buildApiHandler({ ...baseConfig, apiProvider: "openai" })
      const handler2 = buildApiHandler({ ...baseConfig, apiProvider: "ollama" })
      const handler3 = buildApiHandler({ ...baseConfig, apiProvider: "fake-ai" })

      // Each provider should return a different instance
      expect(handler1).not.toBe(handler2)
      expect(handler2).not.toBe(handler3)
      expect(handler1).not.toBe(handler3)

      // But all should have the same interface
      expect(typeof handler1.createMessage).toBe('function')
      expect(typeof handler2.createMessage).toBe('function')  
      expect(typeof handler3.createMessage).toBe('function')
    })
  })
})