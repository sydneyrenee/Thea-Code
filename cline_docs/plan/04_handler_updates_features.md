# Phase 4: Handler Updates & Feature Integration

**Objective:** Update the API provider handlers (`BaseProvider`, `OpenAiHandler`, `OllamaHandler`, `AnthropicHandler`, etc.) to correctly integrate with the refactored MCP system (using `McpIntegration`) and implement specific features like OpenAI function format support for compatible models.

**Relevant Architectural Documents:**
*   `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_plan.md`
*   `cline_docs/architectural_notes/tool_use/mcp/mcp_integration_implementation.md`
*   `cline_docs/architectural_notes/tool_use/mcp/provider_mcp_integration.md`
*   `cline_docs/architectural_notes/tool_use/mcp/ollama_openai_mcp_integration.md`
*   `cline_docs/architectural_notes/tool_use/mcp/openai_function_format_integration.md`

**Key Principles:**
*   **Consistency:** Ensure all handlers use the `McpIntegration` facade for tool processing.
*   **Protocol Adherence:** Leverage protocol-specific handlers (like `OpenAiHandler`) for common logic where applicable.
*   **Feature Completeness:** Implement OpenAI function format integration for compatible handlers.

---

## Task 4.1: Update `BaseProvider`

**Objective:** Ensure the `BaseProvider` correctly initializes `McpIntegration`, registers common tools, and provides the updated `processToolUse` method.

**Details:**
*   **File:** `src/api/providers/base-provider.ts`
*   **Changes:**
    *   **Constructor:** Verify that the constructor correctly gets the singleton instance of the refactored `McpIntegration` (from `src/services/mcp/integration/McpIntegration.ts`) using `McpIntegration.getInstance()` and calls `initialize()` on it.
    *   **`registerTools()`:** Implement or verify the registration of common tools (like `read_file`, `write_to_file`, `list_files`, `search_files`, `apply_diff`, `insert_content`, `search_and_replace`, `ask_followup_question`) using `this.mcpIntegration.registerTool()`. Ensure the `paramSchema` for each tool matches the expected JSON schema format and includes descriptions. The `handler` function within the `ToolDefinition` can be a placeholder or throw an error, as the actual execution is handled by the `EmbeddedMcpProvider` based on the registration.
    *   **`processToolUse()`:** Verify the method signature accepts `content: string | Record<string, unknown>` and correctly calls `this.mcpIntegration.routeToolUse(content)`, returning its result. Ensure appropriate type handling if `routeToolUse` returns different types based on format. (The previous plan suggested ensuring a string return, but it might be better to return the structured result from `routeToolUse` and let the specific handler format it if needed). Revisit this based on `McpIntegration.routeToolUse`'s final implementation.

**Verification:**
*   Review `BaseProvider` code for correct `McpIntegration` instantiation and initialization.
*   Verify common tools are registered with correct schemas in `registerTools`.
*   Verify `processToolUse` correctly delegates to `McpIntegration.routeToolUse`.
*   Perform static analysis (TypeScript compilation).

---

## Task 4.2: Update `OpenAiHandler`

**Objective:** Expose tool detection logic and ensure correct integration with `BaseProvider.processToolUse`.

**Details:**
*   **File:** `src/api/providers/openai.ts`
*   **Changes:**
    *   **Expose Helpers:** Ensure the public methods `extractToolCalls(delta: any): any[]` and `hasToolCalls(delta: any): boolean` are implemented correctly as per `ollama_openai_mcp_integration.md` and `provider_mcp_integration.md`. These should parse the `delta.tool_calls` array from the OpenAI API response.
    *   **`createMessage()`:**
        *   Within the stream processing loop, verify that `delta.tool_calls` is checked.
        *   If tool calls exist, iterate through them.
        *   For each `toolCall`, construct the input object for `processToolUse` (including `id`, `name`, and parsed `input` from `toolCall.function.arguments`).
        *   Call `await this.processToolUse(toolUseObject)`. **Note:** Ensure the input is the structured object, not a stringified version, as `McpIntegration.routeToolUse` should handle the routing based on the object structure likely inferred as 'openai' format internally or explicitly passed.
        *   Format the result returned by `processToolUse` into the OpenAI tool result format (`{ role: 'tool', tool_call_id: ..., content: ... }`) before yielding it.

**Verification:**
*   Verify the existence and correctness of `extractToolCalls` and `hasToolCalls`.
*   Review `createMessage` loop to confirm correct detection of `tool_calls`.
*   Confirm `processToolUse` is called with the structured tool use object.
*   Confirm the result is correctly formatted before yielding.
*   Perform static analysis. Run unit tests for `OpenAiHandler`.

---

## Task 4.3: Update `OllamaHandler`

**Objective:** Integrate `OllamaHandler` with `OpenAiHandler` for tool detection, implement OpenAI function format prompting, and maintain fallback logic.

**Details:**
*   **File:** `src/api/providers/ollama.ts`
*   **Changes:**
    *   **Constructor:**
        *   Add a private property `openAiHandler: OpenAiHandler`.
        *   Instantiate `OpenAiHandler` within the constructor, passing necessary options (API key can be dummy, Base URL should point to Ollama's OpenAI-compatible endpoint).
    *   **`createMessage()`:**
        *   **Get Tools:** Call `this.mcpIntegration.getToolRegistry().getAllTools()` to get available tools.
        *   **Convert Tools:** Call `McpConverters.toolDefinitionsToOpenAiFunctions(availableTools)` to get the list of functions in OpenAI format.
        *   **API Call:** Include the `functions` array and `function_call: 'auto'` in the `this.client.chat.completions.create` call.
        *   **Stream Processing:**
            *   Inside the loop, first call `this.openAiHandler.extractToolCalls(delta)`.
            *   **If `toolCalls.length > 0`:** Process these using the logic similar to `OpenAiHandler` (Task 4.2): construct the tool use object and call `await this.processToolUse(toolUseObject)`. Format the result for yielding (likely OpenAI tool result format, as Ollama mimics it).
            *   **Else (No OpenAI tool calls detected):** Execute the *existing* fallback logic to detect XML or JSON tool use patterns within `delta.content`. If detected, parse the content, create the tool use object, call `await this.processToolUse(toolUseObject)`, format the result (appropriate for XML/JSON context if needed, though MCP should return neutral), and yield.
            *   **Else (No tool use detected):** Process as regular text content using the `HybridMatcher` or similar logic.

**Verification:**
*   Verify `OpenAiHandler` is instantiated in the constructor.
*   Verify tools are fetched, converted, and passed to the Ollama API call.
*   Verify the primary tool detection path uses `openAiHandler.extractToolCalls`.
*   Verify the fallback XML/JSON detection logic is preserved and correctly calls `processToolUse`.
*   Verify results from `processToolUse` are formatted correctly before yielding in both primary and fallback paths.
*   Perform static analysis. Run unit and integration tests for `OllamaHandler`.

---

## Task 4.4: Update Other Provider Handlers (e.g., `AnthropicHandler`)

**Objective:** Ensure other provider handlers correctly detect their native tool formats and route through `BaseProvider.processToolUse`.

**Details:**
*   **Files:** `src/api/providers/anthropic.ts`, potentially others like `gemini.ts`, `vertex.ts` etc.
*   **Changes (Example for `AnthropicHandler`):**
    *   **`createMessage()`:**
        *   Within the stream processing loop, verify the logic that detects Anthropic's `tool_use` content blocks (`chunk.content_block.type === "tool_use"`).
        *   If a `tool_use` block is detected, extract the `id`, `name`, and `input`.
        *   Construct the tool use object: `{ id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input }`.
        *   Call `await this.processToolUse(toolUseObject)`.
        *   Format the result returned by `processToolUse` into the Anthropic tool result format (`{ type: 'tool_result', tool_use_id: ..., content: ..., is_error?: ... }`) before yielding. (Note: `processToolUse` should ideally return a structured neutral result allowing easy formatting).

*   **Changes (General for other handlers):**
    *   Review each handler's `createMessage` method.
    *   Identify the logic responsible for detecting tool use requests specific to that provider's API format.
    *   Ensure this logic correctly extracts the necessary information (ID, name, input/arguments).
    *   Ensure `this.processToolUse(toolUseObject)` is called with the structured data.
    *   Ensure the result from `processToolUse` is formatted back into the provider-specific tool result format before yielding.

**Verification:**
*   Review each provider handler's `createMessage` method for correct tool detection specific to its API.
*   Confirm `processToolUse` is called with a structured object.
*   Confirm results are formatted correctly for the specific provider before yielding.
*   Perform static analysis. Run unit tests for each handler.

---

## Task 4.5: Update References

**Objective:** Search the codebase for any remaining incorrect usages or references related to the handler updates.

**Details:**
*   **Search Scope:** Primarily `src/api/providers/`. Check tests related to these providers.
*   **Actions:** Ensure all tool processing logic consistently uses the `processToolUse` method inherited from `BaseProvider` and that results are handled correctly.

**Verification:**
*   Perform static analysis (TypeScript compilation).
*   Run unit and integration tests for all provider handlers.

---