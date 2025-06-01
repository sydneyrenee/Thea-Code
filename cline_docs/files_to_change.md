# Audit: Removing Anthropic SDK Usage (Updated)

This document lists the remaining files in the code base that directly depend on `@anthropic-ai/sdk` or related Anthropic SDKs, based on an audit performed on May 28, 2025. It outlines a high-level plan for migrating to the provider-agnostic Model Context Protocol (MCP) architecture.

## Background

The project documentation in `cline_docs/architectural_notes` describes a transition from an Anthropic-centric design to a neutral architecture driven by MCP. See `unified_architecture.md` for the history and `mcp_refactoring_plan.md` for the proposed structure. Phase 4 of `cline_docs/plan` shows that many provider handlers have been updated, but Anthropic specific calls remain in the source.

Replacing the SDK will align the code base with the refactored architecture and decouple the application from Anthropic.

## Audit Findings (May 28, 2025)

A search for `"@anthropic-ai/sdk"` in `*.ts` files under the `src/` directory was performed. The following observations were made when comparing with the previous version of this document:

*   **Potentially Cleaned Files (No direct `@anthropic-ai/sdk` import found in main source):**
    *   `src/api/transform/neutral-anthropic-format.ts`
    *   `src/core/webview/TheaProvider.ts`
    *   `src/exports/types.ts`
    *   `src/exports/thea-code.d.ts`
*   **SDK Usage Primarily in Test Files (Main source appears clean):**
    *   `src/api/transform/openai-format.ts` (SDK in `src/api/transform/__tests__/openai-format.test.ts`)
    *   `src/core/TheaTask.ts` (SDK in `src/core/__tests__/TheaTask.test.ts`)
*   **Commented SDK Imports in Tests (Indicating progress):**
    *   `src/api/providers/__tests__/glama.test.ts`
    *   `src/api/providers/__tests__/lmstudio.test.ts`
    *   `src/api/providers/__tests__/requesty.test.ts`
*   **Note on Related SDKs:**
    *   `src/api/providers/vertex.ts` is documented to use `@anthropic-ai/vertex-sdk`. This specific SDK was not part of the direct search but remains relevant to the overall goal.

## Files Currently Using Anthropic SDKs

The following source files still import the Anthropic SDK (`@anthropic-ai/sdk`) or Anthropic-specific types, or are noted for related SDKs. They must be refactored to remove the dependency:

- **Provider handlers**
  - `src/api/providers/anthropic.ts`
  - `src/api/providers/openrouter.ts`
  - `src/api/providers/unbound.ts`
  - `src/api/providers/glama.ts`
  - `src/api/providers/vscode-lm.ts`
  - `src/api/providers/lmstudio.ts`
  - `src/api/providers/vertex.ts` (Note: Uses `@anthropic-ai/vertex-sdk`)
- **Transformation utilities**
  - `src/api/transform/vscode-lm-format.ts`
  - `src/api/transform/vertex-gemini-format.ts`
  - `src/api/transform/gemini-format.ts`
  - `src/api/transform/mistral-format.ts`
  - `src/api/transform/r1-format.ts`
  - `src/api/transform/simple-format.ts`
  - `src/api/transform/bedrock-converse-format.ts`
- **Core and helper modules**
  - `src/core/webview/history/TheaTaskHistory.ts`
  - `src/core/tools/attemptCompletionTool.ts`
- **Tests referencing the SDK**
  - `src/api/transform/__tests__/gemini-format.test.ts`
  - `src/api/transform/__tests__/r1-format.test.ts`
  - `src/api/transform/__tests__/simple-format.test.ts`
  - `src/api/transform/__tests__/openai-format.test.ts`
  - `src/api/transform/__tests__/mistral-format.test.ts`
  - `src/api/transform/__tests__/bedrock-converse-format.test.ts`
  - `src/api/transform/__tests__/vscode-lm-format.test.ts`
  - `src/api/transform/__tests__/vertex-gemini-format.test.ts`
  - `src/api/providers/__tests__/anthropic.test.ts` (explicitly mocks the SDK)
  - `src/api/providers/__tests__/unbound.test.ts`
  - `src/core/__tests__/TheaTask.test.ts`
  - `src/core/sliding-window/__tests__/sliding-window.test.ts`

(The above list is based on an automated search and manual review as of May 28, 2025.)

## Migration Plan

The core of this migration is to *completely replace* all Anthropic SDK dependencies, particularly for message and history management, with an SDK-independent client. This ensures that all provider interactions (including Anthropic's) occur through the neutral tools layers, making other provider integrations fully independent of the Anthropic SDK's presence or removal.
1.  **Implement an SDK-Independent Anthropic Client**
    - Develop a dedicated client to interact directly with Anthropic’s API, *entirely replacing* any functionality previously reliant on the official `@anthropic-ai/sdk`. This client will be built without using the Anthropic SDK.
    - This new client must:
      - Adhere to MCP-friendly structures.
      - Utilize generic streaming utilities from `src/services/mcp/transport`.
      - Exclusively return neutral content blocks (e.g., `NeutralConversationHistory`), ensuring provider handlers operate solely on these neutral types.

2.  **Refactor Provider Handlers**
    - Update `AnthropicHandler` and related handlers to use the new client wrapper.
    - Remove all direct imports of `@anthropic-ai/sdk` and replace Anthropic specific types with the neutral equivalents defined in `src/shared/neutral-history`.
    - Follow the guidance in `cline_docs/plan/04_handler_updates_features.md` to integrate each handler with `McpIntegration.processToolUse`.

3.  **Update Transformation Utilities**
    - Replace functions in `src/api/transform` that currently depend on Anthropic SDK types. Convert them to operate solely on neutral types and use `McpConverters` from `src/services/mcp/core` where appropriate.
    - Example: `convertToOpenAiMessages` should accept `NeutralConversationHistory` instead of Anthropic messages.

4.  **Adjust Core Modules and Tests**
    - Remove Anthropic type imports in core modules such as `TheaTask.ts` and adjust any helper functions to work with neutral formats.
    - Update tests to mock the neutral client rather than the Anthropic SDK.

5.  **Verify Against Project Plans**
    - Use `neutral_anthropic_migration_checklist.md` to track progress. Phases 4–6 outline remaining handler updates, testing, and documentation tasks that must be completed once the SDK is removed.

6.  **Cleanup Dependencies**
    - After refactoring, remove `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`, and `@anthropic-ai/vertex-sdk` from `package.json` and lock files.
    - Ensure the new neutral client is included as part of the MCP services or implemented locally.

## Next Steps

- Begin by creating the neutral client wrapper under `src/services/anthropic-client/` (or similar).
- Incrementally refactor provider handlers following the plan above.
- Run the full test suite (`npm test`) after each major refactor to ensure compatibility.
- Update documentation under `cline_docs/architectural_notes` to reflect the final implementation.
- **Run `npm run lint` to identify and address any linting errors related to these changes or pre-existing issues.**
