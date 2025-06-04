# Neutral Anthropic Client Migration Checklist

This checklist tracks the remaining work required to remove direct usage of `@anthropic-ai/sdk` in favor of the upcoming `NeutralAnthropicClient`. The Anthropic SDK will still be used internally for network calls, but all tool interactions and history handling must go through the neutral client and provider-agnostic types.

## 1. Implement NeutralAnthropicClient
- [x] Create a wrapper client in `src/services/anthropic/NeutralAnthropicClient.ts` that:
  - Instantiates the official Anthropic SDK only for HTTP communication.
  - Converts between `NeutralConversationHistory` and Anthropic message formats.
  - Exposes streaming helpers that yield `ApiStreamChunk` in neutral form.
  - Provides token counting utilities independent of Anthropic types.

## 2. Refactor Provider Handlers
- [x] Replace direct `@anthropic-ai/sdk` imports in all handlers:
  - `src/api/providers/anthropic.ts`
  - `src/api/providers/openrouter.ts`
  - `src/api/providers/unbound.ts`
  - `src/api/providers/glama.ts`
  - `src/api/providers/vscode-lm.ts`
  - `src/api/providers/lmstudio.ts`
  - `src/api/providers/vertex.ts`
- [ ] Update each handler to depend on `NeutralAnthropicClient` for message creation, streaming, and token counting.
- [ ] Remove leftover Anthropic specific types in these files and rely solely on neutral history structures.

## 3. Update Transformation Utilities
- [x] Audit all files under `src/api/transform/` for Anthropic types.
- [x] Convert helpers such as `convertToMistralMessages` and `convertToR1Format` to operate on `NeutralConversationHistory`.
- [ ] Ensure `McpConverters` provides any needed conversions.

## 4. Adjust Core Modules and Tests
- [ ] Remove Anthropic imports from core modules (e.g., `src/core/tools/attemptCompletionTool.ts`, `src/core/webview/history/TheaTaskHistory.ts`).
- [ ] Update Jest tests to mock `NeutralAnthropicClient` instead of the Anthropic SDK.
- [ ] Provide integration tests verifying that tool use routes through `McpIntegration` when using the neutral client.

## 5. Cleanup Dependencies
- [ ] After all refactoring, delete `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`, and `@anthropic-ai/vertex-sdk` from `package.json` and lock files.
- [ ] Confirm that `NeutralAnthropicClient` is exported from `src/services/anthropic/index.ts` and used everywhere Anthropic interaction is required.

## 6. Documentation
- [ ] Update architectural notes and examples to reference the neutral client.
- [ ] Document migration steps in `cline_docs/architectural_notes` so contributors understand the new flow.
