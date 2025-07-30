# Neutral Client Architecture

This document describes the architecture of the neutral client implementation in the Thea Code project, which provides a provider-agnostic approach to interacting with various AI models.

## Overview

The neutral client architecture is designed to eliminate direct dependencies on vendor-specific SDKs and provide a consistent interface for interacting with different AI providers. This makes the codebase more maintainable and adaptable to new models and providers.

The architecture consists of several key components:

1. **Neutral Types**: Type definitions that are independent of any specific provider SDK
2. **Model Capability Detection**: A system for detecting model capabilities based on properties and patterns
3. **Neutral Clients**: Provider-specific implementations that use fetch-based API calls instead of SDKs
4. **Format Converters**: Utilities for converting between neutral and provider-specific formats

## Neutral Types

The neutral types provide a common interface for interacting with different AI providers. These types are defined in various files:

### `src/shared/neutral-history.ts`

This file defines the neutral conversation history types:

```typescript
export type NeutralTextContentBlock = {
  type: "text"
  text: string
}

export type NeutralImageContentBlock = {
  type: "image"
  image_url: string
}

export type NeutralMessageContent = (NeutralTextContentBlock | NeutralImageContentBlock)[]

export type NeutralConversationHistory = {
  role: "user" | "assistant"
  content: NeutralMessageContent
}[]
```

### `src/services/anthropic/types.ts`

This file defines neutral types specific to the Anthropic client:

```typescript
export interface NeutralAnthropicClientOptions {
  apiKey: string
  baseURL?: string
}

export interface NeutralCreateMessageParams {
  model: string
  systemPrompt?: string
  messages: NeutralConversationHistory
  maxTokens?: number
  temperature?: number
  thinking?: NeutralThinkingConfig
}

export interface NeutralThinkingConfig {
  type: "enabled"
  budget_tokens: number
}
```

## Model Capability Detection

The model capability detection system provides a standardized way to detect and use model capabilities across the codebase, making it more maintainable and provider-agnostic.

### Property-Based Capability Detection (`src/utils/model-capabilities.ts`)

This file provides utility functions for detecting model capabilities based on properties in the `ModelInfo` object:

```typescript
export function supportsComputerUse(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsComputerUse
}

export function supportsPromptCaching(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsPromptCache
}

export function supportsImages(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsImages
}

export function supportsThinking(modelInfo: ModelInfo): boolean {
  return !!modelInfo.thinking
}

export function supportsTemperature(modelInfo: ModelInfo): boolean {
  return modelInfo.supportsTemperature !== false
}
```

### Pattern-Based Capability Detection (`src/utils/model-pattern-detection.ts`)

This file provides utility functions for detecting model capabilities based on model ID patterns:

```typescript
export function isClaudeModel(modelId: string): boolean {
  return modelId.includes("claude")
}

export function isThinkingModel(modelId: string): boolean {
  return modelId.includes(":thinking") || modelId.endsWith("-thinking")
}

export function setCapabilitiesFromModelId(modelId: string, modelInfo: ModelInfo): ModelInfo {
  // Create a copy of the modelInfo object to avoid mutating the original
  const updatedModelInfo: ModelInfo = { ...modelInfo }
  
  // Set capabilities based on model ID patterns
  if (isThinkingModel(modelId)) {
    updatedModelInfo.thinking = true
  }
  
  // Set capabilities for Claude models
  if (isClaudeModel(modelId)) {
    updatedModelInfo.supportsPromptCache = true
    // Set other capabilities...
  }
  
  return updatedModelInfo
}
```

## Neutral Clients

The neutral clients provide a fetch-based implementation for interacting with AI providers, eliminating the need for vendor-specific SDKs.

### `src/services/anthropic/NeutralAnthropicClient.ts`

This file provides a fetch-based implementation for interacting with the Anthropic API:

```typescript
export class NeutralAnthropicClient {
  private apiKey: string
  private baseURL: string

  constructor(options: NeutralAnthropicClientOptions) {
    this.apiKey = options.apiKey
    this.baseURL = options.baseURL || "https://api.anthropic.com"
  }

  /** Create a streaming chat message */
  public async *createMessage(params: NeutralCreateMessageParams): ApiStream {
    // Implementation using fetch instead of SDK
  }

  /** Count tokens for the given neutral content */
  public async countTokens(model: string, content: NeutralMessageContent): Promise<number> {
    // Implementation using fetch instead of SDK
  }
}
```

## Format Converters

The format converters provide utilities for converting between neutral and provider-specific formats.

### `src/api/transform/neutral-anthropic-format.ts`

This file provides utilities for converting between neutral and Anthropic-specific formats:

```typescript
export function convertToAnthropicHistory(history: NeutralConversationHistory): AnthropicHistoryMessage[] {
  // Convert neutral history to Anthropic format
}

export function convertToNeutralHistory(history: AnthropicHistoryMessage[]): NeutralConversationHistory {
  // Convert Anthropic history to neutral format
}

export function convertToAnthropicContentBlocks(content: NeutralMessageContent): AnthropicContentBlock[] {
  // Convert neutral content blocks to Anthropic format
}
```

## Provider Integration

The provider files have been updated to use the capability detection system instead of hardcoded model checks.

### `src/api/providers/unbound.ts`

```typescript
// Example from UnboundHandler class
// Instead of checking model ID directly:
// return !this.getModel().id.startsWith("openai/o3-mini")
// We now use capability detection:
return supportsTemperature(this.getModel().info);
```

### `src/api/providers/glama.ts`

```typescript
// Example from GlamaHandler class
// Instead of hardcoded model checks, we use capability detection:
return supportsTemperature(this.getModel().info);
```

## Benefits of the Neutral Client Architecture

1. **Reduced Dependencies**: Eliminates direct reliance on vendor-specific SDKs
2. **Improved Maintainability**: Creates a more consistent and maintainable codebase
3. **Enhanced Flexibility**: Makes it easier to add support for new AI providers
4. **Improved Type Safety**: Reduces runtime errors through better type checking
5. **Provider-Agnostic Code**: Focuses on capabilities rather than specific model IDs

## Future Enhancements

1. **Extend Capability Detection**: Add more capability detection functions for additional model features
2. **Create Unified API**: Develop a unified capability detection API for frontend components
3. **Implement UI Adaptations**: Create capability-based UI adaptations that dynamically adjust based on model capabilities
4. **Enhance Error Handling**: Add retry logic and standardized error reporting for fetch-based implementations
5. **Add More Tests**: Continue expanding test coverage for edge cases and new capabilities

## Conclusion

The neutral client architecture provides a solid foundation for a provider-agnostic approach to interacting with AI models. By focusing on capabilities rather than specific model IDs, the codebase becomes more adaptable to new models and providers, ultimately providing a better experience for users and developers.