# Phase 2: Provider & Transport Refactoring/Implementation

**Objective:** Refactor the existing MCP server implementation into distinct provider components (`Embedded`, `Mock`, `Remote`) and implement separate transport layer components (`SSE`, `Stdio`).

**Relevant Architectural Documents:**

- `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_plan.md` (See Proposed Directory Structure and Component Migration Plan sections)
- `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_implementation_details.md` (See Provider Components and Transport Components sections)
- `cline_docs/architectural_notes/tool_use/mcp/sse_transport_implementation_plan.md` (Details the SSE transport specifics)

**Key Principles:**

- **Decoupling:** Separate provider logic (tool handling) from transport logic (communication).
- **Flexibility:** Allow different provider types (embedded, remote) and transport mechanisms.
- **Testability:** Enable easier testing of providers and transports independently.

---

## Task 2.1: Migrate/Refactor Provider Components

**Objective:** Relocate and refactor the MCP server implementations into the `providers/` directory, renaming and adapting them to the new structure.

**Details:**

1.  **Migrate and Rename `EmbeddedMcpProvider.ts` to `providers/EmbeddedMcpProvider.ts`:**

    - **Source:** `src/services/mcp/EmbeddedMcpProvider.ts`
    - **Destination:** `src/services/mcp/providers/EmbeddedMcpProvider.ts`
    - **Changes:**
        - Rename the class from `EmbeddedMcpProvider` to `EmbeddedMcpProvider`.
        - Implement the `IMcpProvider` interface defined in `../types/McpProviderTypes.ts`.
        - Update internal imports for types (`../types/`) and core components (`../core/`).
        - **Crucially:** Remove all transport-specific logic (SSE and Stdio setup, connection handling, port management). This logic will move to the dedicated transport classes (Task 2.2).
        - Modify the constructor to accept an `IMcpTransport` instance and potentially configuration (`SseTransportConfig` or `StdioTransportConfig`). Store the transport instance internally.
        - Update `start()` and `stop()` methods to delegate connection management to the internal transport instance (`this.transport.start()`, `this.transport.close()`).
        - Retain logic related to tool registration (`registerToolDefinition`, `registerHandlers`), tool execution delegation (`executeTool`), and managing the underlying MCP server instance (`@modelcontextprotocol/sdk/server/mcp.js` or mock).
        - Update `getServerUrl()` to potentially retrieve URL/port information from the transport instance.

2.  **Create `providers/MockMcpProvider.ts`:**

    - **Destination:** `src/services/mcp/providers/MockMcpProvider.ts`
    - **Implementation:**
        - Create a new class `MockMcpProvider` implementing `IMcpProvider`.
        - Extract the mock server logic previously embedded within `EmbeddedMcpProvider.ts` (or `mcp_refactoring_implementation_details.md`).
        - Implement the `IMcpProvider` methods (`start`, `stop`, `registerToolDefinition`, `unregisterTool`, `executeTool`, `getServerUrl`, `isRunning`) with minimal mock behavior suitable for testing components that depend on a provider. It should manage a simple in-memory map of registered tools.

3.  **Create `providers/RemoteMcpProvider.ts`:**
    - **Destination:** `src/services/mcp/providers/RemoteMcpProvider.ts`
    - **Implementation:**
        - Create a new class `RemoteMcpProvider` implementing `IMcpProvider`.
        - The constructor should accept the URL of the remote MCP server.
        - Implement `start()`: Use `SseClientFactory` (created in Phase 3 - note dependency) to create an MCP client instance and connect to the remote server URL. Store the client instance.
        - Implement `stop()`: Close the connection using the stored client instance.
        - Implement `registerToolDefinition`/`unregisterTool`: These might log a warning or throw an error, as tools are typically managed by the remote server itself. Alternatively, they could store definitions locally for informational purposes.
        - Implement `executeTool()`: Delegate the call to the internal MCP client instance (`this.client.callTool(...)`). Handle potential errors from the remote call.
        - Implement `getServerUrl()`: Return the configured remote server URL.
        - Implement `isRunning()`: Return the connection status of the internal client.

**Verification:**

- Confirm the existence of `EmbeddedMcpProvider.ts`, `MockMcpProvider.ts`, and `RemoteMcpProvider.ts` in `src/services/mcp/providers/`.
- Confirm class names match the refactoring plan (`EmbeddedMcpProvider`).
- Verify all three classes implement the `IMcpProvider` interface.
- Verify `EmbeddedMcpProvider` no longer contains direct transport setup logic (SSE/Stdio).
- Perform static analysis (TypeScript compilation) to check for errors.

---

## Task 2.2: Implement Transport Components

**Objective:** Create dedicated classes for handling SSE and Stdio transport mechanisms, extracting logic from the old `EmbeddedMcpProvider`.

**Details:**

1.  **Migrate `config/SseTransportConfig.ts`:**

    - **Source:** `src/services/mcp/config/SseTransportConfig.ts`
    - **Destination:** `src/services/mcp/transport/config/SseTransportConfig.ts`
    - **Changes:**
        - Relocate the file.
        - Update any files that were importing it from the old location (primarily the refactored `EmbeddedMcpProvider` and the new `SseTransport`).

2.  **Create `transport/SseTransport.ts`:**

    - **Destination:** `src/services/mcp/transport/SseTransport.ts`
    - **Implementation:**
        - Create a class `SseTransport` implementing `IMcpTransport` (from `../types/McpTransportTypes.ts`).
        - Import `SseTransportConfig` from `./config/SseTransportConfig.ts`.
        - The constructor should accept `SseTransportConfig`.
        - Encapsulate the logic for creating, starting, and managing an SSE server using `@modelcontextprotocol/sdk/server/sse.js` (or its mock equivalent). This includes setting up the HTTP server, handling `/events` and `/api` paths, CORS configuration, etc. This logic is extracted from the old `EmbeddedMcpProvider.ts` and `sse_transport_implementation_plan.md`.
        - Implement `start()`: Initialize and start the underlying SSE server.
        - Implement `close()`: Properly shut down the underlying SSE server and release the port.
        - Implement `getPort()`: Return the actual port the server is listening on.
        - Implement `onerror` and `onclose` properties/setters to allow the provider to attach handlers.

3.  **Create `transport/StdioTransport.ts`:**
    - **Destination:** `src/services/mcp/transport/StdioTransport.ts`
    - **Implementation:**
        - Create a class `StdioTransport` implementing `IMcpTransport`.
        - Import `StdioTransportConfig` from `../types/McpTransportTypes.ts`.
        - The constructor should accept `StdioTransportConfig`.
        - Encapsulate the logic for creating and managing a Stdio transport using `@modelcontextprotocol/sdk/server/stdio.js` (or its mock equivalent). This includes spawning the child process and managing stdin/stdout/stderr. This logic might need to be inferred or adapted if not explicitly present in the old `EmbeddedMcpProvider`.
        - Implement `start()`: Start the underlying Stdio transport/process.
        - Implement `close()`: Properly terminate the underlying process and close streams.
        - Implement `getPort()`: This might return `undefined` or `0` as Stdio doesn't use network ports.
        - Implement `onerror` and `onclose` properties/setters.
        - Expose the `stderr` stream if required, as shown in `mcp_refactoring_implementation_details.md`.

**Verification:**

- Confirm the existence of `SseTransport.ts` and `StdioTransport.ts` in `src/services/mcp/transport/`.
- Confirm `SseTransportConfig.ts` is in `src/services/mcp/transport/config/`.
- Verify both transport classes implement the `IMcpTransport` interface.
- Verify transport-specific logic (HTTP server, process spawning) resides within these classes.
- Perform static analysis (TypeScript compilation).

---

## Task 2.3: Update `EmbeddedMcpProvider` for Transport Integration

**Objective:** Modify the `EmbeddedMcpProvider` (refactored in Task 2.1) to correctly instantiate and utilize the appropriate transport component based on configuration.

**Details:**

- **File:** `src/services/mcp/providers/EmbeddedMcpProvider.ts`
- **Changes:**
    - Update the constructor:
        - Accept a configuration object that specifies _which_ transport to use (e.g., `{ type: 'sse', config: SseTransportConfig }` or `{ type: 'stdio', config: StdioTransportConfig }`).
        - Based on the `type`, instantiate either `SseTransport` or `StdioTransport`, passing the relevant config.
        - Store the instantiated transport object in the `this.transport` property (which should be typed as `IMcpTransport`).
    - Update `start()`: Ensure it calls `this.transport.start()`.
    - Update `stop()`: Ensure it calls `this.transport.close()`.
    - Update `getServerUrl()`: If using SSE, get the URL details from `this.transport.getPort()` and the hostname from config. Return `undefined` or a placeholder for Stdio.
    - Connect the underlying MCP server instance (`this.server`) to the transport instance (`this.server.connect(this.transport)`), likely within the `start()` method after the transport is started.

**Verification:**

- Review the `EmbeddedMcpProvider` constructor and `start`/`stop`/`getServerUrl` methods to confirm correct transport instantiation and delegation.
- Perform static analysis (TypeScript compilation).
- Run unit tests for `EmbeddedMcpProvider` (potentially using mock transports) to verify delegation.

---
