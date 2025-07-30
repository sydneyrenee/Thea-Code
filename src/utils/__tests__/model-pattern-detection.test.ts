import {
  isClaudeModel,
  isClaude37Model,
  isClaude35Model,
  isClaudeOpusModel,
  isClaudeHaikuModel,
  isClaude3SonnetModel,
  isThinkingModel,
  isDeepSeekR1Model,
  isO3MiniModel,
  setCapabilitiesFromModelId,
  getBaseModelId
} from "../model-pattern-detection"
import { ModelInfo } from "../../schemas"

describe("Model Pattern Detection", () => {
  // Test model ID detection functions
  describe("Model ID detection functions", () => {
    describe("isClaudeModel", () => {
      it("should return true for Claude model IDs", () => {
        expect(isClaudeModel("claude-3-opus-20240229")).toBe(true)
        expect(isClaudeModel("anthropic/claude-3-sonnet")).toBe(true)
        expect(isClaudeModel("claude-3.5-sonnet")).toBe(true)
        expect(isClaudeModel("claude-3.7-haiku")).toBe(true)
      })

      it("should return false for non-Claude model IDs", () => {
        expect(isClaudeModel("gpt-4")).toBe(false)
        expect(isClaudeModel("gemini-pro")).toBe(false)
        expect(isClaudeModel("deepseek/deepseek-r1")).toBe(false)
        expect(isClaudeModel("o3-mini")).toBe(false)
      })
    })

    describe("isClaude37Model", () => {
      it("should return true for Claude 3.7 model IDs", () => {
        expect(isClaude37Model("claude-3.7-opus")).toBe(true)
        expect(isClaude37Model("anthropic/claude-3.7-sonnet")).toBe(true)
        expect(isClaude37Model("claude-3.7-haiku:thinking")).toBe(true)
      })

      it("should return false for non-Claude 3.7 model IDs", () => {
        expect(isClaude37Model("claude-3-opus")).toBe(false)
        expect(isClaude37Model("claude-3.5-sonnet")).toBe(false)
        expect(isClaude37Model("gpt-4")).toBe(false)
      })
    })

    describe("isClaude35Model", () => {
      it("should return true for Claude 3.5 model IDs", () => {
        expect(isClaude35Model("claude-3.5-opus")).toBe(true)
        expect(isClaude35Model("anthropic/claude-3.5-sonnet")).toBe(true)
        expect(isClaude35Model("claude-3.5-haiku:thinking")).toBe(true)
      })

      it("should return false for non-Claude 3.5 model IDs", () => {
        expect(isClaude35Model("claude-3-opus")).toBe(false)
        expect(isClaude35Model("claude-3.7-sonnet")).toBe(false)
        expect(isClaude35Model("gpt-4")).toBe(false)
      })
    })

    describe("isClaudeOpusModel", () => {
      it("should return true for Claude Opus model IDs", () => {
        expect(isClaudeOpusModel("claude-3-opus-20240229")).toBe(true)
        expect(isClaudeOpusModel("anthropic/claude-3.5-opus")).toBe(true)
        expect(isClaudeOpusModel("claude-3.7-opus:thinking")).toBe(true)
      })

      it("should return false for non-Opus model IDs", () => {
        expect(isClaudeOpusModel("claude-3-sonnet")).toBe(false)
        expect(isClaudeOpusModel("claude-3.5-haiku")).toBe(false)
        expect(isClaudeOpusModel("gpt-4")).toBe(false)
      })
    })

    describe("isClaudeHaikuModel", () => {
      it("should return true for Claude Haiku model IDs", () => {
        expect(isClaudeHaikuModel("claude-3-haiku")).toBe(true)
        expect(isClaudeHaikuModel("anthropic/claude-3.5-haiku")).toBe(true)
        expect(isClaudeHaikuModel("claude-3.7-haiku:thinking")).toBe(true)
      })

      it("should return false for non-Haiku model IDs", () => {
        expect(isClaudeHaikuModel("claude-3-sonnet")).toBe(false)
        expect(isClaudeHaikuModel("claude-3.5-opus")).toBe(false)
        expect(isClaudeHaikuModel("gpt-4")).toBe(false)
      })
    })

    describe("isClaude3SonnetModel", () => {
      it("should return true for Claude Sonnet model IDs", () => {
        expect(isClaude3SonnetModel("claude-3-sonnet-20240229")).toBe(true)
        expect(isClaude3SonnetModel("anthropic/claude-3.5-sonnet")).toBe(true)
        expect(isClaude3SonnetModel("claude-3.7-sonnet:thinking")).toBe(true)
      })

      it("should return false for non-Sonnet model IDs", () => {
        expect(isClaude3SonnetModel("claude-3-opus")).toBe(false)
        expect(isClaude3SonnetModel("claude-3.5-haiku")).toBe(false)
        expect(isClaude3SonnetModel("gpt-4")).toBe(false)
      })
    })

    describe("isThinkingModel", () => {
      it("should return true for thinking-enabled model IDs", () => {
        expect(isThinkingModel("claude-3-opus:thinking")).toBe(true)
        expect(isThinkingModel("anthropic/claude-3.5-sonnet:thinking")).toBe(true)
        expect(isThinkingModel("model-name-thinking")).toBe(true)
      })

      it("should return false for non-thinking model IDs", () => {
        expect(isThinkingModel("claude-3-opus")).toBe(false)
        expect(isThinkingModel("gpt-4")).toBe(false)
        expect(isThinkingModel("thinking-is-not-at-the-end")).toBe(false)
      })
    })

    describe("isDeepSeekR1Model", () => {
      it("should return true for DeepSeek R1 model IDs", () => {
        expect(isDeepSeekR1Model("deepseek/deepseek-r1")).toBe(true)
        expect(isDeepSeekR1Model("deepseek/deepseek-r1-v1.5")).toBe(true)
        expect(isDeepSeekR1Model("perplexity/sonar-reasoning")).toBe(true)
      })

      it("should return false for non-DeepSeek R1 model IDs", () => {
        expect(isDeepSeekR1Model("deepseek/deepseek-coder")).toBe(false)
        expect(isDeepSeekR1Model("perplexity/sonar")).toBe(false)
        expect(isDeepSeekR1Model("gpt-4")).toBe(false)
      })
    })

    describe("isO3MiniModel", () => {
      it("should return true for O3 Mini model IDs", () => {
        expect(isO3MiniModel("o3-mini")).toBe(true)
        expect(isO3MiniModel("openai/o3-mini")).toBe(true)
        expect(isO3MiniModel("o3-mini-v1")).toBe(true)
      })

      it("should return false for non-O3 Mini model IDs", () => {
        expect(isO3MiniModel("gpt-4")).toBe(false)
        expect(isO3MiniModel("claude-3-opus")).toBe(false)
        expect(isO3MiniModel("o3")).toBe(false)
      })
    })
  })

  // Test getBaseModelId function
  describe("getBaseModelId", () => {
    it("should remove thinking suffix", () => {
      expect(getBaseModelId("claude-3-opus:thinking")).toBe("claude-3-opus")
      expect(getBaseModelId("anthropic/claude-3.5-sonnet:thinking")).toBe("anthropic/claude-3.5-sonnet")
    })

    it("should return the original ID if no variant suffix is present", () => {
      expect(getBaseModelId("claude-3-opus")).toBe("claude-3-opus")
      expect(getBaseModelId("gpt-4")).toBe("gpt-4")
    })
  })

  // Test setCapabilitiesFromModelId function
  describe("setCapabilitiesFromModelId", () => {
    // Create a base model info object for testing
    const baseModelInfo: ModelInfo = {
      contextWindow: 16384,
      supportsPromptCache: false,
    }

    it("should set thinking capability for thinking models", () => {
      const result = setCapabilitiesFromModelId("claude-3-opus:thinking", baseModelInfo)
      expect(result.thinking).toBe(true)
    })

    it("should set prompt cache capability for Claude models", () => {
      const result = setCapabilitiesFromModelId("claude-3-opus", baseModelInfo)
      expect(result.supportsPromptCache).toBe(true)
    })

    it("should set cache pricing for Claude Opus models", () => {
      const result = setCapabilitiesFromModelId("claude-3-opus", baseModelInfo)
      expect(result.cacheWritesPrice).toBe(18.75)
      expect(result.cacheReadsPrice).toBe(1.5)
    })

    it("should set cache pricing for Claude Haiku models", () => {
      const result = setCapabilitiesFromModelId("claude-3-haiku", baseModelInfo)
      expect(result.cacheWritesPrice).toBe(1.25)
      expect(result.cacheReadsPrice).toBe(0.1)
    })

    it("should set default cache pricing for other Claude models", () => {
      const result = setCapabilitiesFromModelId("claude-3-sonnet", baseModelInfo)
      expect(result.cacheWritesPrice).toBe(3.75)
      expect(result.cacheReadsPrice).toBe(0.3)
    })

    it("should set computer use capability for Claude Sonnet models", () => {
      const result = setCapabilitiesFromModelId("claude-3-sonnet", baseModelInfo)
      expect(result.supportsComputerUse).toBe(true)
    })

    it("should not set computer use capability for older Claude Sonnet models", () => {
      const result = setCapabilitiesFromModelId("claude-3-sonnet-20240620", baseModelInfo)
      expect(result.supportsComputerUse).toBeUndefined()
    })

    it("should set max tokens for Claude 3.7 models based on thinking capability", () => {
      const thinkingResult = setCapabilitiesFromModelId("claude-3.7-opus:thinking", baseModelInfo)
      expect(thinkingResult.maxTokens).toBe(64_000)

      const nonThinkingResult = setCapabilitiesFromModelId("claude-3.7-opus", baseModelInfo)
      expect(nonThinkingResult.maxTokens).toBe(8192)
    })

    it("should set max tokens for Claude 3.5 models", () => {
      const result = setCapabilitiesFromModelId("claude-3.5-sonnet", baseModelInfo)
      expect(result.maxTokens).toBe(8192)
    })

    it("should set temperature support to false for O3 Mini models", () => {
      const result = setCapabilitiesFromModelId("o3-mini", baseModelInfo)
      expect(result.supportsTemperature).toBe(false)
    })

    it("should set reasoning effort to high for DeepSeek R1 models", () => {
      const result = setCapabilitiesFromModelId("deepseek/deepseek-r1", baseModelInfo)
      expect(result.reasoningEffort).toBe("high")
    })

    it("should not modify the original model info object", () => {
      setCapabilitiesFromModelId("claude-3-opus", baseModelInfo)
      expect(baseModelInfo.supportsPromptCache).toBe(false)
      expect(baseModelInfo.cacheWritesPrice).toBeUndefined()
    })
  })
})