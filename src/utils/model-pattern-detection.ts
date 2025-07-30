/**
 * Model Pattern Detection Utilities
 * 
 * This module provides utility functions for detecting model capabilities based on model ID patterns.
 * These functions complement the capability detection functions in model-capabilities.ts by
 * providing a way to set capability properties on ModelInfo objects based on model ID patterns.
 */

import type { ModelInfo } from "../schemas"

/**
 * Detects if a model ID represents a Claude model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a Claude model, false otherwise
 */
export function isClaudeModel(modelId: string): boolean {
  return modelId.includes("claude")
}

/**
 * Detects if a model ID represents a Claude 3.7 model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a Claude 3.7 model, false otherwise
 */
export function isClaude37Model(modelId: string): boolean {
  return modelId.includes("claude-3.7")
}

/**
 * Detects if a model ID represents a Claude 3.5 model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a Claude 3.5 model, false otherwise
 */
export function isClaude35Model(modelId: string): boolean {
  return modelId.includes("claude-3.5")
}

/**
 * Detects if a model ID represents a Claude Opus model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a Claude Opus model, false otherwise
 */
export function isClaudeOpusModel(modelId: string): boolean {
  return modelId.includes("opus")
}

/**
 * Detects if a model ID represents a Claude Haiku model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a Claude Haiku model, false otherwise
 */
export function isClaudeHaikuModel(modelId: string): boolean {
  return modelId.includes("haiku")
}

/**
 * Detects if a model ID represents a Claude Sonnet model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a Claude Sonnet model, false otherwise
 */
export function isClaude3SonnetModel(modelId: string): boolean {
  return modelId.includes("sonnet")
}

/**
 * Detects if a model ID represents a thinking-enabled model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a thinking-enabled model, false otherwise
 */
export function isThinkingModel(modelId: string): boolean {
  return modelId.includes(":thinking") || modelId.endsWith("-thinking")
}

/**
 * Detects if a model ID represents a DeepSeek R1 model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents a DeepSeek R1 model, false otherwise
 */
export function isDeepSeekR1Model(modelId: string): boolean {
  return modelId.startsWith("deepseek/deepseek-r1") || modelId === "perplexity/sonar-reasoning"
}

/**
 * Detects if a model ID represents an O3 Mini model
 * 
 * @param modelId The model ID to check
 * @returns True if the model ID represents an O3 Mini model, false otherwise
 */
export function isO3MiniModel(modelId: string): boolean {
  return modelId.startsWith("o3-mini") || modelId.includes("openai/o3-mini")
}

/**
 * Sets capability properties on a ModelInfo object based on model ID patterns
 * 
 * @param modelId The model ID to check
 * @param modelInfo The ModelInfo object to update
 * @returns The updated ModelInfo object
 */
export function setCapabilitiesFromModelId(modelId: string, modelInfo: ModelInfo): ModelInfo {
  // Create a copy of the modelInfo object to avoid mutating the original
  const updatedModelInfo: ModelInfo = { ...modelInfo }
  
  // Set thinking capability
  if (isThinkingModel(modelId)) {
    updatedModelInfo.thinking = true
  }
  
  // Set capabilities for Claude models
  if (isClaudeModel(modelId)) {
    // All Claude models support prompt caching
    updatedModelInfo.supportsPromptCache = true
    
    // Set cache pricing based on model tier
    if (isClaudeOpusModel(modelId)) {
      updatedModelInfo.cacheWritesPrice = 18.75
      updatedModelInfo.cacheReadsPrice = 1.5
    } else if (isClaudeHaikuModel(modelId)) {
      updatedModelInfo.cacheWritesPrice = 1.25
      updatedModelInfo.cacheReadsPrice = 0.1
    } else {
      // Default cache pricing for sonnet and other models
      updatedModelInfo.cacheWritesPrice = 3.75
      updatedModelInfo.cacheReadsPrice = 0.3
    }
    
    // Set computer use capability for models that support it
    if (isClaude3SonnetModel(modelId) && !modelId.includes("20240620")) {
      updatedModelInfo.supportsComputerUse = true
    }
    
    // Set max tokens based on model tier and thinking capability
    if (isClaude37Model(modelId)) {
      updatedModelInfo.maxTokens = updatedModelInfo.thinking ? 64_000 : 8192
      updatedModelInfo.supportsComputerUse = true
    } else if (isClaude35Model(modelId)) {
      updatedModelInfo.maxTokens = 8192
    }
  }
  
  // Set capabilities for O3 Mini models
  if (isO3MiniModel(modelId)) {
    updatedModelInfo.supportsTemperature = false
  }
  
  // Set capabilities for DeepSeek R1 models
  if (isDeepSeekR1Model(modelId)) {
    updatedModelInfo.reasoningEffort = "high"
  }
  
  return updatedModelInfo
}

/**
 * Extracts the base model ID from a model ID with variants
 * 
 * @param modelId The model ID to process
 * @returns The base model ID without variant suffixes
 */
export function getBaseModelId(modelId: string): string {
  // Remove thinking suffix
  if (modelId.includes(":thinking")) {
    return modelId.split(":")[0]
  }
  
  // Remove other variant suffixes as needed
  
  return modelId
}