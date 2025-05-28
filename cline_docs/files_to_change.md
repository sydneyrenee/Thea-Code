# Audit: Removing Anthropic SDK Usage

This document lists the remaining files in the code base that directly depend on `@anthropic-ai/sdk` and outlines a high level plan for migrating to the provider‑agnostic Model Context Protocol (MCP) architecture.

## Background

The project documentation in `cline_docs/architectural_notes` describes a transition from an Anthropic‑centric design to a neutral architecture driven by MCP. See `unified_architecture.md` for the history and `mcp_refactoring_plan.md` for the proposed structure. Phase 4 of `cline_docs/plan` shows that many provider handlers have been updated, but Anthropic specific calls remain in the source.

Replacing the SDK will align the code base with the refactored architecture and decouple the application from Anthropic.

## Files Using `@anthropic-ai/sdk`

The following source files import the Anthropic SDK or Anthropic‑specific types. They must be refactored to remove the dependency:

- **Provider handlers**
  - `src/api/providers/anthropic.ts`
  - `src/api/providers/openrouter.ts`
  - `src/api/providers/unbound.ts`
  - `src/api/providers/glama.ts`
  - `src/api/providers/vscode-lm.ts`
  - `src/api/providers/lmstudio.ts`
  - `src/api/providers/vertex.ts` (uses `@anthropic-ai/vertex-sdk`)
- **Transformation utilities**
  - `src/api/transform/neutral-anthropic-format.ts`
  - `src/api/transform/openai-format.ts`
  - `src/api/transform/vscode-lm-format.ts`
  - `src/api/transform/vertex-gemini-format.ts`
  - `src/api/transform/gemini-format.ts`
  - `src/api/transform/mistral-format.ts`
  - `src/api/transform/r1-format.ts`
  - `src/api/transform/simple-format.ts`
  - `src/api/transform/bedrock-converse-format.ts`
- **Core and helper modules**
  - `src/core/TheaTask.ts`
  - `src/core/webview/TheaProvider.ts`
  - `src/core/webview/history/TheaTaskHistory.ts`
  - `src/core/tools/attemptCompletionTool.ts`
  - `src/core/sliding-window/__tests__/sliding-window.test.ts`
- **Exports and type declarations**
  - `src/exports/types.ts`
  - `src/exports/thea-code.d.ts`
- **Tests referencing the SDK**
  - Files under `src/api/providers/__tests__/` and `src/api/transform/__tests__/` import the SDK for mocking.

(Use `grep -R "@anthropic-ai/sdk" src` to locate additional occurrences.)

## Migration Plan

1. **Introduce a Neutral Client Wrapper**
   - Create a lightweight HTTP client or adapter that communicates with Anthropic’s API without relying on the official SDK. This client should conform to the MCP friendly structures and use the generic streaming utilities defined in `src/services/mcp/transport`.
   - Ensure it returns neutral content blocks so that provider handlers only deal with `NeutralConversationHistory`.

2. **Refactor Provider Handlers**
   - Update `AnthropicHandler` and related handlers to use the new client wrapper.
   - Remove all direct imports of `@anthropic-ai/sdk` and replace Anthropic specific types with the neutral equivalents defined in `src/shared/neutral-history`.
   - Follow the guidance in `cline_docs/plan/04_handler_updates_features.md` to integrate each handler with `McpIntegration.processToolUse`.

3. **Update Transformation Utilities**
   - Replace functions in `src/api/transform` that currently depend on Anthropic SDK types. Convert them to operate solely on neutral types and use `McpConverters` from `src/services/mcp/core` where appropriate.
   - Example: `convertToOpenAiMessages` should accept `NeutralConversationHistory` instead of Anthropic messages.

4. **Adjust Core Modules and Tests**
   - Remove Anthropic type imports in core modules such as `TheaTask.ts` and adjust any helper functions to work with neutral formats.
   - Update tests to mock the neutral client rather than the Anthropic SDK.

5. **Verify Against Project Plans**
   - Use `mcp_audit_checklist.md` to track progress. Phases 4–6 outline remaining handler updates, testing, and documentation tasks that must be completed once the SDK is removed.

6. **Cleanup Dependencies**
   - After refactoring, remove `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`, and `@anthropic-ai/vertex-sdk` from `package.json` and lock files.
   - Ensure the new neutral client is included as part of the MCP services or implemented locally.

## Next Steps

- Begin by creating the neutral client wrapper under `src/services/anthropic-client/` (or similar).
- Incrementally refactor provider handlers following the plan above.
- Run the full test suite (`npm test`) after each major refactor to ensure compatibility.
- Update documentation under `cline_docs/architectural_notes` to reflect the final implementation.

