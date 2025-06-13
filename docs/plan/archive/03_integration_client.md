# Phase 3: Integration & Client Refactoring/Implementation

**Objective:** Refactor the MCP client components and the integration layers that connect the MCP system to the rest of the application (providers, webview).

**Relevant Architectural Documents:**

- `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_plan.md` (See Proposed Directory Structure and Component Migration Plan sections)
- `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_implementation_details.md` (See Client Components and Integration Components sections)

**Key Principles:**

- **Abstraction:** Create clear interfaces and facades for interacting with the MCP system.
- **Modularity:** Isolate integration logic for different parts of the application (providers, webview).
- **Maintainability:** Simplify the interaction points with the core MCP logic.

---

## Task 3.1: Migrate/Refactor Client Components

**Objective:** Establish the base MCP client structure and refactor the SSE client factory.

**Details:**

1.  **Create `client/McpClient.ts`:**

    - **Destination:** `src/services/mcp/client/McpClient.ts`
    - **Implementation:**
        - Create an abstract base class `McpClient`.
        - Define the core interface for an MCP client, including methods like `connect(transport)`, `close()`, `listTools()`, `callTool(params)`. Refer to `@modelcontextprotocol/sdk/client` for the expected methods if available, or define a suitable abstraction based on `mcp_refactoring_implementation_details.md`.
        - The constructor should accept `clientInfo` (name, version).

2.  **Migrate and Refactor `client/SseClientFactory.ts`:**
    - **Source:** `src/services/mcp/client/SseClientFactory.ts` (as per refactoring plan, though it might not exist yet and logic might be elsewhere initially).
    - **Destination:** `src/services/mcp/client/SseClientFactory.ts`
    - **Changes:**
        - Ensure the file exists at the destination.
        - Update imports (e.g., `McpClient` from `./McpClient.ts`).
        - Refactor the `createClient` static method:
            - It should return a `Promise<McpClient>`.
            - Inside, dynamically import the MCP SDK's `Client` and `SSEClientTransport`.
            - Create an internal `SseClient` class that extends `McpClient` and wraps the SDK's `Client` instance, implementing the abstract methods.
            - Instantiate the SDK's `SSEClientTransport` with the provided `serverUrl`.
            - Instantiate the internal `SseClient`, passing `clientInfo`.
            - Call `connect()` on the internal `SseClient` instance, passing the transport.
            - Return the `SseClient` instance.
            - Include fallback logic to return a `MockClient` (also extending `McpClient`) if the SDK is not found, as shown in `mcp_refactoring_implementation_details.md`.

**Verification:**

- Confirm the existence of `McpClient.ts` and `SseClientFactory.ts` in `src/services/mcp/client/`.
- Verify `McpClient` defines the expected abstract methods.
- Verify `SseClientFactory.createClient` returns an instance compatible with `McpClient` and handles SDK import/fallback.
- Perform static analysis (TypeScript compilation).

---

## Task 3.2: Migrate/Refactor Integration Components

**Objective:** Relocate and refactor the main integration facade (`McpIntegration`) and create dedicated integration layers for providers and the webview.

**Details:**

1.  **Migrate `integration/McpIntegration.ts`:**

    - **Source:** `src/services/mcp/McpIntegration.ts`
    - **Destination:** `src/services/mcp/integration/McpIntegration.ts`
    - **Changes:**
        - Update internal imports for types (`../types/`) and core components (`../core/`).
        - Update references to use the refactored core component names (`McpToolExecutor`, `McpToolRegistry`).
        - Ensure the constructor correctly instantiates `McpToolRouter` and `McpToolExecutor` (using their `getInstance` methods if applicable) and passes down configuration (`sseConfig`).
        - Ensure methods like `initialize`, `shutdown`, `registerTool`, `routeToolUse` correctly delegate to `McpToolExecutor` or `McpToolRouter`.
        - Implement `getServerUrl()` by delegating to `McpToolExecutor` (which delegates to the provider).
        - Implement `getToolRegistry()` by delegating to `McpToolExecutor`.
        - Remove any logic specific to provider management or webview interaction; this will move to the dedicated integration classes below.

2.  **Create `integration/ProviderIntegration.ts`:**

    - **Destination:** `src/services/mcp/integration/ProviderIntegration.ts`
    - **Implementation:**
        - Create a class `ProviderIntegration` (likely a singleton using `getInstance`).
        - Manage a map (`providers`) of registered `IMcpProvider` instances, keyed by name.
        - Manage a map (`mcpToolExecutors`) of `McpToolExecutor` instances, potentially one per provider or shared. (Design decision: The plan seems to imply one executor per provider, created via `McpToolExecutor.getInstance(provider, config)`).
        - Implement `registerProvider(name, provider)`: Adds a provider, potentially starts it if the integration layer is already initialized, creates/associates an `McpToolExecutor`, and forwards events.
        - Implement `unregisterProvider(name)`: Stops and removes a provider and its associated executor.
        - Implement `initialize()`: Iterates through registered providers and calls `start()` on them.
        - Implement `shutdown()`: Iterates through registered providers and calls `stop()` on them.
        - Implement `getProvider(name)` and `getAllProviders()`.
        - Implement `getToolExecutor(name)`.
        - Forward relevant events (e.g., `tool-registered`, `provider-started`) from providers/executors.

3.  **Create `integration/WebviewIntegration.ts`:**
    - **Destination:** `src/services/mcp/integration/WebviewIntegration.ts`
    - **Implementation:**
        - Create a class `WebviewIntegration` (likely a singleton using `getInstance`).
        - Hold a reference to the `McpHub` instance (set via a method like `setMcpHub`).
        - Implement methods to interact with the `McpHub` for webview-related actions (e.g., `getAllServers`, `updateServerTimeout`, `deleteServer`, `toggleServerDisabled`, `restartConnection`). This extracts logic previously in `TheaMcpManager`.
        - Forward relevant events from the `McpHub`.

**Verification:**

- Confirm the existence of `McpIntegration.ts`, `ProviderIntegration.ts`, and `WebviewIntegration.ts` in `src/services/mcp/integration/`.
- Verify `McpIntegration` correctly delegates to core components and passes configuration.
- Verify `ProviderIntegration` manages provider lifecycles and associated executors.
- Verify `WebviewIntegration` correctly interfaces with `McpHub` (which will be migrated in the next phase).
- Perform static analysis (TypeScript compilation).

---

## Task 3.3: Update References

**Objective:** Search the codebase for imports and usages of the components refactored in this phase and update them to the new paths and potentially new APIs.

**Details:**

- **Search Scope:** Primarily within `src/services/mcp/`, but also check potential usages in `src/api/providers/` (for `McpIntegration`) and `src/core/webview/` (for `WebviewIntegration` replacing parts of `TheaMcpManager`).
- **Actions:**
    - Update import paths for `McpClient`, `SseClientFactory`, `McpIntegration`, `ProviderIntegration`, `WebviewIntegration`.
    - If any method signatures or class responsibilities changed significantly during refactoring, update the calling code accordingly. For example, code previously interacting directly with provider lifecycles might now go through `ProviderIntegration`. Code interacting with `McpHub` via `TheaMcpManager` might now use `WebviewIntegration`.

**Verification:**

- Perform a codebase-wide search for old paths/names related to the refactored components.
- Perform static analysis (TypeScript compilation) across the affected parts of the codebase.
- Run relevant unit/integration tests (expecting potential failures to be fixed in the testing phase).

---
