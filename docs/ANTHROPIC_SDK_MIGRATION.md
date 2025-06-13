# Anthropic SDK Migration Guide

This document describes the migration from direct Anthropic SDK usage to the neutral `NeutralAnthropicClient` approach.

## Overview

The codebase has been migrated to use a neutral client pattern instead of importing Anthropic SDKs directly. This provides better abstraction and makes it easier to manage provider-specific implementations.

## Changes Made

### Core Module Updates

1. **`src/api/index.ts`**

    - Removed `BetaThinkingConfigParam` import from `@anthropic-ai/sdk`
    - Replaced with neutral `NeutralThinkingConfig` interface
    - All thinking parameter handling now uses neutral types

2. **`src/core/webview/history/TheaTaskHistory.ts`**

    - Removed `Anthropic` import from `@anthropic-ai/sdk`
    - Updated `apiConversationHistory` type from `Anthropic.MessageParam[]` to `NeutralConversationHistory`
    - All conversation history now uses neutral format

3. **`src/core/tools/attemptCompletionTool.ts`**
    - Removed `Anthropic` import from `@anthropic-ai/sdk`
    - Updated content block types from `Anthropic.TextBlockParam | Anthropic.ImageBlockParam` to neutral equivalents
    - Tool results now use neutral content format

### Test Updates

1. **`src/api/providers/__tests__/anthropic.test.ts`**

    - Updated to mock `NeutralAnthropicClient` instead of direct Anthropic SDK
    - Tests now verify neutral client method calls instead of SDK calls
    - Maintains same test coverage with neutral interface

2. **Other test files**
    - Updated various test files to use neutral types instead of Anthropic SDK types
    - Removed or updated SDK-specific mocks

### Dependency Cleanup

Removed the following dependencies from `package.json`:

- `@anthropic-ai/sdk`
- `@anthropic-ai/bedrock-sdk`
- `@anthropic-ai/vertex-sdk`

## Migration Benefits

1. **Reduced Dependencies**: Removed direct SDK dependencies from most of the codebase
2. **Better Abstraction**: `NeutralAnthropicClient` provides a clean interface
3. **Easier Testing**: Tests can mock the neutral client instead of complex SDK mocks
4. **Improved Maintainability**: Changes to Anthropic SDK only affect the neutral client

## Remaining Work

1. **Provider-Specific Implementations**: Some providers like `vertex.ts` still use Anthropic Vertex SDK for specialized functionality
2. **Test Infrastructure**: Some tests need MCP system mocking improvements (unrelated to SDK migration)
3. **Documentation**: Update any provider-specific documentation to reference neutral patterns

## Usage Examples

### Before (Direct SDK)

```typescript
import { Anthropic } from "@anthropic-ai/sdk"
import { BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta/messages/index.mjs"

const client = new Anthropic({ apiKey: "..." })
const thinking: BetaThinkingConfigParam = { type: "enabled", budget_tokens: 1024 }
```

### After (Neutral Client)

```typescript
import { NeutralAnthropicClient } from "../services/anthropic"

interface NeutralThinkingConfig {
	type: "enabled"
	budget_tokens: number
}

const client = new NeutralAnthropicClient("...")
const thinking: NeutralThinkingConfig = { type: "enabled", budget_tokens: 1024 }
```

## Architecture

The `NeutralAnthropicClient` acts as an adapter that:

1. Accepts neutral format inputs
2. Converts to Anthropic SDK format internally
3. Calls the Anthropic SDK
4. Converts responses back to neutral format
5. Returns neutral format to callers

This allows the rest of the codebase to be SDK-agnostic while maintaining full Anthropic functionality.
