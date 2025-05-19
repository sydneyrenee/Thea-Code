# Phase 5: Testing & Validation

**Objective:** Comprehensively test the refactored MCP system, including core components, providers, transports, integrations, and API handler updates, ensuring functionality, consistency, and robustness.

**Relevant Architectural Documents:**
*   `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_plan.md` (See Testing Strategy)
*   `cline_docs/architectural_notes/tool_use/mcp/ollama_openai_mcp_test_plan.md`
*   `cline_docs/architectural_notes/tool_use/mcp/provider_mcp_integration_test_plan.md`
*   `cline_docs/architectural_notes/tool_use/mcp/sse_transport_implementation_plan.md` (See Test Implementation)

**Key Principles:**
*   **Thoroughness:** Cover all refactored and new components at multiple levels (unit, integration, E2E).
*   **Regression Prevention:** Ensure existing functionality remains intact.
*   **Consistency:** Verify uniform behavior across different providers and formats where expected.
*   **Coverage:** Aim for defined code coverage targets.

---

## Task 5.1: Update/Create Unit Tests

**Objective:** Ensure all individual components of the refactored MCP system have adequate unit tests using Jest.

**Details:**
*   **Scope:** All files within `src/services/mcp/` (core, providers, transport, client, integration, management, types) and relevant API handlers in `src/api/providers/`.
*   **Actions:**
    1.  **Update Existing Tests:** Locate existing Jest tests (`__tests__` directories) for components that were moved or renamed (e.g., `McpToolExecutor` -> `McpToolExecutor`, `EmbeddedMcpProvider` -> `EmbeddedMcpProvider`). Update file paths, import statements, class names, and method calls to match the refactored code.
    2.  **Create New Tests:** Write new Jest unit tests for all newly created components:
        *   `core/McpToolExecutor.ts` (if significantly changed from `McpToolExecutor`)
        *   `providers/MockMcpProvider.ts`
        *   `providers/RemoteMcpProvider.ts`
        *   `transport/SseTransport.ts`
        *   `transport/StdioTransport.ts`
        *   `client/McpClient.ts` (if concrete methods exist)
        *   `client/SseClientFactory.ts` (test client creation, SDK import fallback)
        *   `integration/ProviderIntegration.ts` (test provider registration, lifecycle management)
        *   `integration/WebviewIntegration.ts` (test delegation to `McpHub`)
    3.  **Refine Handler Tests:** Update unit tests for `BaseProvider`, `OpenAiHandler`, `OllamaHandler`, `AnthropicHandler`, etc., focusing on:
        *   Correct initialization of `McpIntegration`.
        *   Correct usage of `processToolUse`.
        *   Correct implementation of protocol-specific logic (e.g., `OllamaHandler` using `OpenAiHandler.extractToolCalls`).
        *   Correct formatting of tool results before yielding.
    4.  **Mocking:** Utilize Jest's mocking capabilities (`jest.mock`, `jest.spyOn`) extensively to isolate components. Use `MockMcpProvider` where an `IMcpProvider` dependency is needed. Mock transport layers when testing providers, and mock providers/core components when testing integration layers. Mock the actual `@modelcontextprotocol/sdk` imports where necessary, especially for testing fallback logic. Reference mocking strategies in `ollama_openai_mcp_test_plan.md`.

**Verification:**
*   All unit tests within the relevant scopes pass successfully (`npm test` or `jest`).
*   New tests cover the core functionality of new components.
*   Updated tests correctly reflect the refactored code structure and logic.

---

## Task 5.2: Update/Create Integration Tests

**Objective:** Verify the interactions and data flow between different layers and components of the refactored MCP system.

**Details:**
*   **Scope:** Interactions between core, providers, transport, client, integration layers, and API handlers.
*   **Actions:**
    1.  **Update Existing Tests:** Adapt existing integration tests to the new structure and component names.
    2.  **Create New Tests:** Write new Jest integration tests covering key interaction points:
        *   **Provider-Transport:** Test `EmbeddedMcpProvider` correctly starting/stopping/using `SseTransport` and `StdioTransport`.
        *   **Client-Server (SSE):** Test `SseClientFactory` creating a client that successfully connects to and interacts with an `EmbeddedMcpProvider` using `SseTransport` (listing/calling tools). Reference `sse_transport_implementation_plan.md` test examples.
        *   **Core-Provider:** Test `McpToolExecutor` correctly delegating execution to `EmbeddedMcpProvider`.
        *   **API Handler-Integration:** Test `BaseProvider` (and specific handlers like `OllamaHandler`) correctly routing calls through `McpIntegration` -> `McpToolRouter` -> `McpToolExecutor` -> `EmbeddedMcpProvider` for different formats (XML, JSON, OpenAI). Verify the full request-response cycle including format conversions. Reference `provider_mcp_integration_test_plan.md`.
        *   **Integration-Management:** Test `WebviewIntegration` interacting with `McpHub`, and `ProviderIntegration` managing `IMcpProvider` instances.
    3.  **Cross-Provider Consistency:** Implement tests (as described in `provider_mcp_integration_test_plan.md`) that execute the same logical tool call via different handlers (e.g., Ollama vs OpenAI directly, if applicable) and verify consistent results from the MCP system.
    4.  **Mocking:** Use mocks primarily for external dependencies (like actual model APIs or the base `@modelcontextprotocol/sdk` if testing specific error conditions) but use real instances of the interacting components under test where possible.

**Verification:**
*   All integration tests pass successfully.
*   Key interaction points between layers are covered.
*   Tool execution flow works correctly for different formats through the integrated system.

---

## Task 5.3: Update/Create End-to-End (E2E) Tests

**Objective:** Validate the complete system flow, including interaction with actual AI models (primarily Ollama) and execution of real tools via the refactored MCP system.

**Details:**
*   **Scope:** Full application flow involving user input (simulated), API handler, MCP system, tool execution, and response generation.
*   **Environment:** Requires a running Ollama instance configured to use tools (function calling). API keys/endpoints for other models if testing them E2E.
*   **Actions:**
    1.  **Update Existing E2E Tests:** Adapt any existing E2E tests that involve tool use to the refactored structure.
    2.  **Create New E2E Tests:**
        *   **Ollama Tool Use:** Create tests specifically for `OllamaHandler` where the prompt should trigger function calling. Verify that the Ollama model generates a function call, it's processed by the MCP system, the correct tool (e.g., a mock `read_file`) is executed via `EmbeddedMcpProvider`, and the result is correctly sent back to the Ollama model. Reference `provider_mcp_integration_test_plan.md`.
        *   **Real Tool Execution:** Test the execution of actual tools registered in `BaseProvider` (e.g., `read_file` on a test file) triggered by a model interaction.
        *   **Error Handling:** Test scenarios where the tool execution fails within the `EmbeddedMcpProvider` and verify the error is propagated back correctly.
    3.  **Configuration:** Ensure E2E tests can be configured with the necessary environment variables (Ollama URL, etc.) and potentially skipped in environments where these are not available.

**Verification:**
*   Key E2E scenarios involving Ollama function calling and MCP tool execution pass successfully against a live Ollama instance.
*   Real tool execution (e.g., file system operations) works as expected.
*   Error propagation in E2E scenarios is handled correctly.

---

## Task 5.4: Manual Testing

**Objective:** Perform exploratory and scenario-based manual testing to catch issues not covered by automated tests.

**Details:**
*   **Scope:** User-facing functionality related to models that use tools, configuration of MCP servers (if UI exists via `McpHub`/`WebviewIntegration`), and general stability.
*   **Actions:**
    *   Interact with the application using Ollama (and other models if configured) and prompts designed to trigger various tools.
    *   Test edge cases for tool inputs and outputs.
    *   Test error conditions (e.g., tool not found, tool execution error).
    *   If applicable, test UI elements related to MCP server management provided via `WebviewIntegration`.
    *   Test system behavior under concurrent requests if relevant (SSE transport should improve this).

**Verification:**
*   Manual test plan executed.
*   No critical or high-severity issues found related to the refactoring.
*   User experience remains consistent or improved.

---

## Task 5.5: Code Coverage Analysis

**Objective:** Measure and ensure adequate code coverage for the refactored MCP components and updated handlers.

**Details:**
*   **Tool:** Jest (`--coverage` flag).
*   **Actions:**
    1.  Run the full suite of unit and integration tests with coverage enabled.
    2.  Analyze the generated coverage report.
    3.  Identify areas within the refactored code (`src/services/mcp/`, updated `src/api/providers/`) with low coverage.
    4.  Write additional unit or integration tests to improve coverage, focusing on critical paths, branches, and error handling.
    5.  Re-run coverage analysis.
*   **Target:** Aim for the project's standard coverage target (e.g., 80% as mentioned in `provider_mcp_integration_test_plan.md`), particularly for the newly structured MCP code.

**Verification:**
*   Code coverage report meets the defined target for the refactored areas.
*   Any significant gaps below the target are justified or have corresponding tasks created to address them.

---

## Task 5.6: Bug Fixing

**Objective:** Address and resolve bugs identified during unit, integration, E2E, and manual testing.

**Details:**
*   **Scope:** Any defects found in the refactored MCP system or related components.
*   **Actions:**
    1.  Prioritize bugs based on severity (Critical, High, Medium, Low).
    2.  Assign developers to fix identified bugs.
    3.  Ensure fixes include corresponding regression tests (unit or integration).
    4.  Re-run relevant tests to verify fixes.
    5.  Track bug resolution status.

**Verification:**
*   All critical and high-severity bugs identified during the testing phase are resolved and verified.
*   Regression tests for fixes are added and passing.

---