# Model Capability Detection System

This document describes the model capability detection system implemented in the Thea Code project. The system provides a standardized way to detect and use model capabilities across the codebase, making it more maintainable and provider-agnostic.

## Overview

The capability detection system consists of two main components:

1. **Property-based capability detection** (`model-capabilities.ts`): Functions that check for capabilities based on properties in the `ModelInfo` object.
2. **Pattern-based capability detection** (`model-pattern-detection.ts`): Functions that detect capabilities based on model ID patterns and set properties on the `ModelInfo` object.

This approach replaces hardcoded model ID checks with a more maintainable and centralized system for detecting model capabilities.

## Property-Based Capability Detection

The `model-capabilities.ts` file provides utility functions for detecting model capabilities based on properties in the `ModelInfo` object:

```typescript
import type { ModelInfo } from "../schemas"

// Check if a model supports computer use (tool use)
export function supportsComputerUse(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsComputerUse
}

// Check if a model supports prompt caching
export function supportsPromptCaching(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsPromptCache
}

// Check if a model supports image input
export function supportsImages(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsImages
}

// Check if a model supports thinking/reasoning
export function supportsThinking(modelInfo: ModelInfo): boolean {
  return !!modelInfo.thinking
}

// Check if a model supports temperature adjustment
export function supportsTemperature(modelInfo: ModelInfo): boolean {
  return modelInfo.supportsTemperature !== false
}

// Get the appropriate max tokens for a model
export function getMaxTokens(modelInfo: ModelInfo, defaultMaxTokens: number = 4096): number {
  return modelInfo.maxTokens ?? defaultMaxTokens
}

// Get the reasoning effort level for a model
export function getReasoningEffort(modelInfo: ModelInfo): "low" | "medium" | "high" | undefined {
  return modelInfo.reasoningEffort
}

// Check if a model supports a specific capability
export function hasCapability(
  modelInfo: ModelInfo, 
  capability: "computerUse" | "promptCache" | "images" | "thinking" | "temperature"
): boolean {
  switch (capability) {
    case "computerUse":
      return supportsComputerUse(modelInfo)
    case "promptCache":
      return supportsPromptCaching(modelInfo)
    case "images":
      return supportsImages(modelInfo)
    case "thinking":
      return supportsThinking(modelInfo)
    case "temperature":
      return supportsTemperature(modelInfo)
    default:
      return false
  }
}

// Get the context window size for a model
export function getContextWindowSize(modelInfo: ModelInfo, defaultContextWindow: number = 8192): number {
  return modelInfo.contextWindow ?? defaultContextWindow
}
```

## Pattern-Based Capability Detection

The `model-pattern-detection.ts` file provides utility functions for detecting model capabilities based on model ID patterns:

```typescript
import type { ModelInfo } from "../schemas"

// Detect if a model ID represents a Claude model
export function isClaudeModel(modelId: string): boolean {
  return modelId.includes("claude")
}

// Detect if a model ID represents a thinking-enabled model
export function isThinkingModel(modelId: string): boolean {
  return modelId.includes(":thinking") || modelId.endsWith("-thinking")
}

// Set capability properties on a ModelInfo object based on model ID patterns
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

// Extract the base model ID from a model ID with variants
export function getBaseModelId(modelId: string): string {
  // Remove thinking suffix
  if (modelId.includes(":thinking")) {
    return modelId.split(":")[0]
  }
  
  return modelId
}
```

## Usage Examples

### In Provider Files

Here are examples of how to use the capability detection system in provider files:

#### Example 1: Checking if a model supports temperature

```typescript
import { supportsTemperature } from "../../utils/model-capabilities"

// Instead of hardcoded model ID checks:
// if (modelId.startsWith("o3-mini")) {
//   // Handle models that don't support temperature
// }

// Use capability detection:
if (!supportsTemperature(modelInfo)) {
  // Handle models that don't support temperature
}
```

#### Example 2: Checking if a model supports prompt caching

```typescript
import { supportsPromptCaching } from "../../utils/model-capabilities"

// Instead of direct property checks:
// if (modelInfo.supportsPromptCache === true) {
//   // Apply prompt caching
// }

// Use capability detection:
if (supportsPromptCaching(modelInfo)) {
  // Apply prompt caching
}
```

#### Example 3: Extracting the base model ID

```typescript
import { getBaseModelId, isThinkingModel } from "../../utils/model-pattern-detection"

// Instead of hardcoded model ID checks:
// if (id.includes(":thinking")) {
//   id = id.split(":")[0]
// }

// Use pattern detection:
if (isThinkingModel(id)) {
  id = getBaseModelId(id)
}
```

#### Example 4: Setting capabilities based on model ID patterns

```typescript
import { setCapabilitiesFromModelId } from "../../utils/model-pattern-detection"

// Instead of hardcoded model ID checks:
// if (rawModel.id.includes("claude")) {
//   modelInfo.supportsPromptCache = true
//   if (rawModel.id.includes("opus")) {
//     modelInfo.cacheWritesPrice = 18.75
//     modelInfo.cacheReadsPrice = 1.5
//   }
// }

// Use pattern detection:
const baseModelInfo = {
  contextWindow: 16384,
  supportsPromptCache: false,
}
const modelInfo = setCapabilitiesFromModelId(rawModel.id, baseModelInfo)
```

## Benefits

The capability detection system provides several benefits:

1. **Maintainability**: Centralizes capability detection logic, making it easier to update and maintain.
2. **Provider-agnostic**: Focuses on capabilities rather than specific model IDs, making the code more adaptable to new models.
3. **Consistency**: Ensures consistent capability detection across the codebase.
4. **Testability**: Makes it easier to test capability detection logic in isolation.
5. **Extensibility**: Makes it easier to add new capabilities and detection patterns.

## Extending the System

To add a new capability to the system:

1. Add the capability property to the `ModelInfo` interface in `schemas/index.ts`.
2. Add a capability detection function to `model-capabilities.ts`.
3. Update the `hasCapability` function to include the new capability.
4. Add pattern detection logic to `setCapabilitiesFromModelId` in `model-pattern-detection.ts`.
5. Add tests for the new capability detection functions.

## Testing

The capability detection system is thoroughly tested:

- `model-capabilities.test.ts`: Tests for property-based capability detection functions.
- `model-pattern-detection.test.ts`: Tests for pattern-based capability detection functions.

These tests ensure that the capability detection system works correctly with various model configurations and IDs.