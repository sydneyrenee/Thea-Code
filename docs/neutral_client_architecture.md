# Neutral Client Architecture

This document describes the architecture of the neutral client implementation in the Thea Code project, which provides a provider-agnostic approach to interacting with various AI models.

## Overview

The neutral client architecture is designed to eliminate direct dependencies on vendor-specific SDKs and provide a consistent interface for interacting with different AI providers. This makes the codebase more maintainable and adaptable to new models and providers.

The architecture consists of several key components:

1. Neutral Types: Type definitions that are independent of any specific provider SDK
2. Model Capability Detection: A system for detecting model capabilities based on properties and patterns
3. Neutral Clients: Provider-specific implementations that use fetch-based API calls instead of SDKs
4. Format Converters: Utilities for converting between neutral and provider-specific formats
5. MCP Integration: A unified tool system for tool use across all providers

## Neutral Types

The neutral types provide a common interface for interacting with different AI providers. These types are defined in various files.

### `src/shared/neutral-history.ts`

This file defines a rich, provider-agnostic conversation model that supports structured tool use and results, images, and metadata.

```ts
// Represents a single block of content within a message
interface NeutralContentBlock {
  type: "text" | "image" | "image_url" | "image_base64" | "tool_use" | "tool_result"
  id?: string // Optional, used for tool_use blocks
}

// Text
interface NeutralTextContentBlock extends NeutralContentBlock {
  type: "text"
  text: string
}

// Images (either URL or base64)
interface NeutralImageContentBlock extends NeutralContentBlock {
  type: "image" | "image_url" | "image_base64"
  source:
    | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
    | { type: "image_url"; url: string }
}

// Tool invocation requested by the model
interface NeutralToolUseContentBlock extends NeutralContentBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

// Tool result returned by the host
interface NeutralToolResultContentBlock extends NeutralContentBlock {
  type: "tool_result"
  tool_use_id: string
  content: Array<NeutralTextContentBlock | NeutralImageContentBlock>
  status?: "success" | "error"
  error?: { message: string; details?: unknown }
}

// Union and message containers
type NeutralMessageContent = Array<
  | NeutralTextContentBlock
  | NeutralImageContentBlock
  | NeutralToolUseContentBlock
  | NeutralToolResultContentBlock
>

interface NeutralMessage {
  role: "user" | "assistant" | "system" | "tool"
  content: string | NeutralMessageContent
  ts?: number
  metadata?: Record<string, unknown>
}

type NeutralConversationHistory = NeutralMessage[]
```

These types are used throughout the providers and transformers to ensure a consistent, strongly-typed contract.

### `src/services/anthropic/types.ts`

This file defines neutral types specific to the Anthropic client and its streaming events.

```ts
export interface NeutralAnthropicClientOptions {
  apiKey: string
  baseURL?: string
}

export interface NeutralCreateMessageParams {
  model: string
  systemPrompt: string
  messages: NeutralConversationHistory
  maxTokens?: number
  temperature?: number
  thinking?: { type: "enabled" | "disabled"; budget_tokens?: number }
}
```

## Model Capability Detection

Two complementary mechanisms determine model capabilities at runtime.

### Property-Based Capability Detection (`src/utils/model-capabilities.ts`)

```ts
export function supportsTemperature(modelInfo: ModelInfo): boolean {
  return modelInfo.supportsTemperature !== false
}

export function supportsPromptCaching(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsPromptCache
}

export function supportsComputerUse(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsComputerUse
}
```

### Pattern-Based Capability Detection (`src/utils/model-pattern-detection.ts`)

```ts
export function setCapabilitiesFromModelId(modelId: string, modelInfo: ModelInfo): ModelInfo {
  const updated = { ...modelInfo }
  if (isThinkingModel(modelId)) updated.thinking = true
  if (isO3MiniModel(modelId)) updated.supportsTemperature = false
  // Additional patterns for Claude tiers, DeepSeek R1, etc.
  return updated
}
```

## Neutral Clients

Neutral clients provide fetch-based implementations, removing SDK coupling.

### `src/services/anthropic/NeutralAnthropicClient.ts`

Key behaviors:
- Uses fetch to call `/v1/messages` and `/v1/messages/count_tokens`
- Streams server-sent events and maps them to `ApiStreamChunk` types (text, reasoning, tool_use, usage)
- Honors `options.baseURL`, `process.env.ANTHROPIC_BASE_URL`, and a local mock fallback for tests
- Converts between neutral content and Anthropic blocks via `neutral-anthropic-format.ts`

## Format Converters

Utilities convert between neutral and provider-specific formats.

### `src/api/transform/neutral-anthropic-format.ts`
- `convertToAnthropicContentBlocks(neutral)` and `convertToNeutralHistory(anthropic)` handle images, tool_use, and tool_result blocks.

### `src/services/mcp/core/McpConverters.ts`
- Bridges XML/JSON/OpenAI function-call formats to neutral tool-use requests and back to provider-specific results
- Escapes XML and supports base64 and URL image representations when emitting XML

## Provider Integration and Base Provider

All providers extend `BaseProvider` (`src/api/providers/base-provider.ts`) which:
- Initializes MCP integration via the `McpIntegration` singleton
- Registers standard tools through the MCP system
- Exposes a neutral `createMessage(systemPrompt, history)` contract
- Provides a portable token-counting default using tiktoken

Protocol-specific handlers (e.g., `OpenAiHandler`, `AnthropicHandler`, `GeminiHandler`) can be extended by provider variants like `OllamaHandler` to reuse streaming and tool routing.

## Benefits

- Reduced vendor lock-in and SDK complexity
- Consistent, type-safe interfaces across providers
- Centralized tool-use routing via MCP
- Clear separation of concerns between conversion, transport, and execution layers

## Future Enhancements

- Extend capability detection coverage and unify capability surfacing for UI
- Add retries and standardized error envelopes to all fetch-based clients
- Broaden tests for mixed tool/image/text results across providers