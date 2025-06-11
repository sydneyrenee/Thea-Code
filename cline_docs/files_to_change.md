# Audit: Removing Anthropic SDK Usage (Updated - June 10, 2025 - Global Search)

This document lists the files in the codebase that still directly depend on `@anthropic-ai/sdk` or related Anthropic SDKs, have linting issues related to their usage, or contain hardcoded references to Anthropic models that should be abstracted. This report is based on a comprehensive global search performed on June 10, 2025.

## Audit Findings

The following files were identified as containing "anthropic" (case-insensitive) and have been analyzed for direct SDK usage, hardcoded references, and linting errors.

### Files Requiring Further Migration (Not Done)

These files still have direct Anthropic SDK dependencies, hardcoded Anthropic model references, or related linting issues that need to be addressed as part of the migration to the provider-agnostic Model Context Protocol (MCP) architecture.

*   **Production Files with Direct SDK Imports:**
    *   **[`src/api/index.ts`](src/api/index.ts)**
        *   **Anthropic SDK Usage:** Imports `BetaThinkingConfigParam` from `@anthropic-ai/sdk/resources/beta/messages/index.mjs`. This is a direct SDK type dependency that needs to be replaced with neutral types.
        *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
        *   **Status:** Not done.
    *   **[`src/core/webview/history/TheaTaskHistory.ts`](src/core/webview/history/TheaTaskHistory.ts)**
        *   **Anthropic SDK Usage:** Imports `Anthropic` from `@anthropic-ai/sdk`. This is a core module, and the import is a direct dependency.
        *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
        *   **Status:** Not done.
    *   **[`src/core/tools/attemptCompletionTool.ts`](src/core/tools/attemptCompletionTool.ts)**
        *   **Anthropic SDK Usage:** Imports `Anthropic` from `@anthropic-ai/sdk`. This is a core module, and the import is a direct dependency.
        *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
        *   **Status:** Not done.

*   **Production File with Linting Errors (related to types):**
    *   **[`src/api/providers/vertex.ts`](src/api/providers/vertex.ts)**
        *   **Anthropic SDK Usage:** Imports `AnthropicVertex` from `@anthropic-ai/vertex-sdk`. This is expected as it's a handler for Vertex AI which uses Anthropic's models.
        *   **ESLint Errors/Warnings:** 2 errors, 2 warnings.
            *   `297:4`: `Unsafe argument of type error typed assigned to a parameter of type MessageCreateParamsNonStreaming`
            *   `490:65`: `Unsafe argument of type error typed assigned to a parameter of type MessageCreateParamsNonStreaming`
            *   `292:24`: `Unexpected any. Specify a different type`
            *   `486:50`: `Unexpected any. Specify a different type`
        *   **Status:** Not done. While the SDK usage is expected, the linting errors related to type safety (`any` and unsafe type assignments) need to be addressed.

*   **Production Files with Hardcoded Anthropic Model Checks/References:**
    *   **[`src/api/providers/unbound.ts`](src/api/providers/unbound.ts)**
        *   **Anthropic Reference:** Contains `this.getModel().id.startsWith("anthropic/")`. This is a hardcoded check for Anthropic models that should be abstracted.
        *   **ESLint Errors/Warnings:** (Not audited yet, will audit in next step)
        *   **Status:** Not done.
    *   **[`src/api/providers/openrouter.ts`](src/api/providers/openrouter.ts)**
        *   **Anthropic Reference:** Contains `modelId.startsWith("anthropic/")` and references to specific Anthropic model IDs. These are hardcoded checks and model references that should be abstracted.
        *   **ESLint Errors/Warnings:** (Not audited yet, will audit in next step)
        *   **Status:** Not done.
    *   **[`src/api/providers/glama.ts`](src/api/providers/glama.ts)**
        *   **Anthropic Reference:** Contains `this.getModel().id.startsWith("anthropic/claude-3")`. This is a hardcoded check.
        *   **ESLint Errors/Warnings:** (Not audited yet, will audit in next step)
        *   **Status:** Not done.
    *   **[`webview-ui/src/components/ui/hooks/useOpenRouterModelProviders.ts`](webview-ui/src/components/ui/hooks/useOpenRouterModelProviders.ts)**
        *   **Anthropic Reference:** Contains `modelId === "anthropic/claude-3.7-sonnet:thinking"` and `modelId.startsWith("anthropic/claude-3.7-sonnet")`. These are hardcoded model checks.
        *   **ESLint Errors/Warnings:** (Not audited yet, will audit in next step)
        *   **Status:** Not done.

### Files Considered Done (No Further Migration Needed)

These files either do not directly use the Anthropic SDK or their usage is limited to test environments where mocking is appropriate, or the references are in configuration/localization files.

*   **[`src/services/anthropic/NeutralAnthropicClient.ts`](src/services/anthropic/NeutralAnthropicClient.ts)**
    *   **Anthropic SDK Usage:** Yes, this file is designed to be the neutral client for Anthropic and is expected to encapsulate Anthropic SDK usage.
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (purposefully uses SDK).

*   **[`src/api/__tests__/index.test.ts`](src/api/__tests__/index.test.ts)**
    *   **Anthropic SDK Usage:** Yes, but only for testing purposes (mocked or type imports).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (test file).

*   **[`src/api/providers/__tests__/anthropic.test.ts`](src/api/providers/__tests__/anthropic.test.ts)**
    *   **Anthropic SDK Usage:** Yes, but only for testing purposes (mocked).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (test file).

*   **[`src/api/providers/__tests__/vertex.test.ts`](src/api/providers/__tests__/vertex.test.ts)**
    *   **Anthropic SDK Usage:** Yes, but only for testing purposes (mocked).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (test file).

*   **[`src/api/providers/__tests__/glama.test.ts`](src/api/providers/__tests__/glama.test.ts)**
    *   **Anthropic SDK Usage:** No direct import (commented out).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done.

*   **[`src/api/providers/__tests__/requesty.test.ts`](src/api/providers/__tests__/requesty.test.ts)**
    *   **Anthropic SDK Usage:** No direct import (commented out).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done.

*   **[`src/api/providers/__tests__/unbound.test.ts`](src/api/providers/__tests__/unbound.test.ts)**
    *   **Anthropic SDK Usage:** Yes, but only for testing purposes (type imports).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (test file).

*   **[`src/api/providers/__tests__/lmstudio.test.ts`](src/api/providers/__tests__/lmstudio.test.ts)**
    *   **Anthropic SDK Usage:** No direct import (commented out).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done.

*   **[`src/core/__tests__/TheaTask.test.ts`](src/core/__tests__/TheaTask.test.ts)**
    *   **Anthropic SDK Usage:** Yes, but only for testing purposes (type imports and mocking).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (test file).

*   **[`src/core/sliding-window/__tests__/sliding-window.test.ts`](src/core/sliding-window/__tests__/sliding-window.test.ts)**
    *   **Anthropic SDK Usage:** Yes, but only for testing purposes (type imports).
    *   **ESLint Errors/Warnings:** 0 errors, 0 warnings.
    *   **Status:** Done (test file).

*   **Other Files (Configuration, Localization, etc.):**
    *   `package-lock.json`, `package.json` (dependencies - will be removed in cleanup phase)
    *   `webview-ui/src/i18n/locales/.../settings.json` (localization strings)
    *   `src/schemas/index.ts`, `src/schemas/__tests__/index.test.ts` (schema definitions and tests)
    *   `src/exports/types.ts`, `src/exports/thea-code.d.ts` (type definitions)
    *   `src/shared/globalState.ts`, `src/shared/__tests__/checkExistApiConfig.test.ts` (global state and tests)
    *   `src/shared/api.ts` (model definitions)
    *   `src/integrations/misc/process-images.ts` (comment)
    *   `e2e/src/suite/index.ts` (e2e test configuration)
    *   `cline_docs/files_to_change.md`, `cline_docs/plan/neutral_anthropic_migration_checklist.md`, `cline_docs/architectural_notes/api_handlers/unified_architecture.md`, `cline_docs/architectural_notes/api_handlers/provider_handler_architecture.md`, `cline_docs/plan/README.md`, `cline_docs/plan/04_handler_updates_features.md`, `cline_docs/architectural_notes/tool_use/mcp/provider_mcp_integration.md`, `cline_docs/architectural_notes/tool_use/mcp/mcp_integration_implementation.md` (documentation and planning files)
    *   `webview-ui/src/utils/validate.ts` (API configuration validation)
    *   `webview-ui/src/components/settings/ApiOptions.tsx`, `webview-ui/src/components/settings/constants.ts`, `webview-ui/src/components/settings/__tests__/ApiOptions.test.tsx`, `webview-ui/src/components/chat/__tests__/ChatTextArea.test.tsx` (UI components and tests)
    *   `webview-ui/build/assets/main.js` (compiled JavaScript)
    *   **Status:** Done (references are acceptable in their context).
