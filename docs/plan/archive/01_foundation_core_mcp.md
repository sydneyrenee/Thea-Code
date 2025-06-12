# Phase 1: Foundation & Core MCP Refactoring

**Objective:** Establish the new directory structure for the MCP service and migrate/refactor the core components responsible for tool registration, execution, routing, and format conversion.

**Relevant Architectural Documents:**
*   `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_plan.md` (See Proposed Directory Structure and Component Migration Plan sections)
*   `cline_docs/architectural_notes/tool_use/mcp/mcp_refactoring_implementation_details.md` (See Type Definitions and Core Components sections)

**Key Principles:**
*   **Modularity:** Group related components logically.
*   **Separation of Concerns:** Each component should have a clear, distinct responsibility.
*   **Maintainability:** Refactoring should make the code easier to understand and modify.

---

## Task 1.1: Establish New Directory Structure

**Objective:** Create the foundational directory structure for the refactored MCP service within `src/services/mcp/`.

**Details:**
*   Ensure the base directory `src/services/mcp/` exists.
*   Create the following subdirectories directly under `src/services/mcp/`:
    *   `core/` (For core logic: registry, executor, router, converters)
    *   `providers/` (For MCP server implementations: embedded, remote, mock)
    *   `transport/` (For communication layers: SSE, Stdio)
    *   `client/` (For MCP client implementations)
    *   `integration/` (For integration facades: main, provider, webview)
    *   `management/` (For managing MCP instances: hub, manager)
    *   `types/` (For shared TypeScript type definitions)
*   Create placeholder `.gitkeep` files within each new directory if needed to ensure they are committed to version control even when initially empty.

**Verification:**
*   Confirm the existence of all specified subdirectories under `src/services/mcp/`.

---

## Task 1.2: Define Core Types

**Objective:** Create and populate the TypeScript definition files for shared MCP types.

**Details:**

1.  **Create `types/McpToolTypes.ts`:**
    *   **File Path:** `src/services/mcp/types/McpToolTypes.ts`
    *   **Content:** Define interfaces and enums related to tool use requests and results, based on `mcp_refactoring_implementation_details.md`:
        ```typescript
        // src/services/mcp/types/McpToolTypes.ts

        /**
         * Interface for tool use request in a neutral format
         */
        export interface NeutralToolUseRequest {
          type: 'tool_use';
          id: string;
          name: string;
          input: Record<string, unknown>;
        }

        /**
         * Interface for tool result in a neutral format
         */
        export interface NeutralToolResult {
          type: 'tool_result';
          tool_use_id: string;
          content: Array<{
            type: string;
            text?: string;
            [key: string]: unknown;
          }>;
          status: 'success' | 'error';
          error?: {
            message: string;
            details?: unknown;
          };
        }

        /**
         * Enum for supported tool use formats
         */
        export enum ToolUseFormat {
          XML = 'xml',
          JSON = 'json',
          OPENAI = 'openai',
          NEUTRAL = 'neutral'
        }

        /**
         * Interface for tool use request with format information
         */
        export interface ToolUseRequestWithFormat {
          format: ToolUseFormat;
          content: string | Record<string, unknown>;
        }

        /**
         * Interface for tool result with format information
         */
        export interface ToolResultWithFormat {
          format: ToolUseFormat;
          content: string | Record<string, unknown>;
        }
        ```

2.  **Create `types/McpProviderTypes.ts`:**
    *   **File Path:** `src/services/mcp/types/McpProviderTypes.ts`
    *   **Content:** Define interfaces related to MCP providers, tool definitions, and resources, based on `mcp_refactoring_implementation_details.md`:
        ```typescript
        // src/services/mcp/types/McpProviderTypes.ts

        /**
         * Interface for tool call result
         */
        export interface ToolCallResult {
          content: Array<{
            type: string;
            text?: string;
            [key: string]: unknown;
          }>;
          isError?: boolean;
          _meta?: Record<string, unknown>;
          [key: string]: unknown;
        }

        /**
         * Interface for tool definitions that can be registered with the embedded MCP server
         */
        export interface ToolDefinition {
          name: string;
          description?: string;
          paramSchema?: Record<string, any>; // JSON Schema for parameters
          handler: (args: Record<string, unknown>) => Promise<ToolCallResult>;
        }

        /**
         * Interface for resource definitions that can be registered with the embedded MCP server
         */
        export interface ResourceDefinition {
          uri: string;
          name: string;
          mimeType?: string;
          description?: string;
          handler: () => Promise<string | Buffer>;
        }

        /**
         * Interface for resource template definitions that can be registered with the embedded MCP server
         */
        export interface ResourceTemplateDefinition {
          uriTemplate: string;
          name: string;
          description?: string;
          mimeType?: string;
          handler: (params: Record<string, string>) => Promise<string | Buffer>;
        }

        /**
         * Interface for MCP provider (Server implementation)
         */
        export interface IMcpProvider {
          start(): Promise<void>;
          stop(): Promise<void>;
          registerToolDefinition(definition: ToolDefinition): void;
          unregisterTool(name: string): boolean;
          executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
          getServerUrl(): URL | undefined;
          isRunning(): boolean;
          // Add other methods as needed (e.g., for resources)
        }
        ```

3.  **Create `types/McpTransportTypes.ts`:**
    *   **File Path:** `src/services/mcp/types/McpTransportTypes.ts`
    *   **Content:** Define interfaces related to MCP transport layers, based on `mcp_refactoring_implementation_details.md`:
        ```typescript
        // src/services/mcp/types/McpTransportTypes.ts

        /**
         * Configuration options for the SSE transport
         * (Moved from config/SseTransportConfig.ts during refactoring)
         */
        export interface SseTransportConfig {
          port?: number;
          hostname?: string;
          allowExternalConnections?: boolean;
          eventsPath?: string;
          apiPath?: string;
        }

        /**
         * Interface for MCP transport layer
         */
        export interface IMcpTransport {
          start(): Promise<void>;
          close(): Promise<void>;
          getPort?(): number; // Optional as StdioTransport might not have a port
          onerror?: (error: Error) => void;
          onclose?: () => void;
          // Add other transport-specific methods/properties if needed
        }

        // Add StdioTransportConfig if needed
        export interface StdioTransportConfig {
          command: string;
          args?: string[];
          env?: Record<string, string>;
        }
        ```

**Verification:**
*   Confirm the existence and content of the three type definition files in `src/services/mcp/types/`.
*   Ensure interfaces and enums match the specifications.

---

## Task 1.3: Migrate/Refactor Core Components

**Objective:** Move the core MCP logic components to the `core/` subdirectory, rename classes as planned, and update their internal structure and references.

**Details:**

1.  **Migrate `McpToolRegistry.ts`:**
    *   **Source:** `src/services/mcp/McpToolRegistry.ts`
    *   **Destination:** `src/services/mcp/core/McpToolRegistry.ts`
    *   **Changes:**
        *   Update internal imports (e.g., for types) to use paths relative to the new `types/` directory (e.g., `import { ToolDefinition, ToolCallResult } from "../types/McpProviderTypes";`).
        *   Ensure the singleton pattern (`getInstance`) is correctly implemented.
        *   No major functional changes expected, primarily relocation and import updates.

2.  **Migrate and Rename `McpToolExecutor.ts` to `McpToolExecutor.ts`:**
    *   **Source:** `src/services/mcp/McpToolExecutor.ts`
    *   **Destination:** `src/services/mcp/core/McpToolExecutor.ts`
    *   **Changes:**
        *   Rename the class from `McpToolExecutor` to `McpToolExecutor`.
        *   Update internal imports for types (from `../types/`) and other components (e.g., `../providers/EmbeddedMcpProvider`, `../core/McpToolRegistry`).
        *   **Crucially:** Update references to `EmbeddedMcpProvider` to use the *new* name `EmbeddedMcpProvider` (this provider will be refactored in Phase 2, but update the reference here).
        *   Update the constructor and `getInstance` method (if using singleton) to reflect the new class name.
        *   Review methods like `executeToolFromNeutralFormat` to ensure they interact correctly with the (future refactored) `EmbeddedMcpProvider`.
        *   Remove any format conversion logic that should now reside solely in `McpConverters`.

3.  **Migrate `McpToolRouter.ts`:**
    *   **Source:** `src/services/mcp/McpToolRouter.ts`
    *   **Destination:** `src/services/mcp/core/McpToolRouter.ts`
    *   **Changes:**
        *   Update internal imports for types (from `../types/`) and other components (e.g., `../core/McpToolExecutor`, `../core/McpConverters`).
        *   Update references to `McpToolExecutor` to use the *new* name `McpToolExecutor`.
        *   Ensure methods like `routeToolUse`, `convertToMcp`, `convertFromMcp` correctly reference `McpConverters` and `McpToolExecutor`.

4.  **Migrate `McpConverters.ts`:**
    *   **Source:** `src/services/mcp/McpConverters.ts`
    *   **Destination:** `src/services/mcp/core/McpConverters.ts`
    *   **Changes:**
        *   Update internal imports for types (from `../types/`).
        *   Ensure all format conversion logic (XML<->MCP, JSON<->MCP, OpenAI<->MCP, ToolDef->OpenAI Func) resides here.
        *   Verify method signatures match the plan in `mcp_refactoring_implementation_details.md`.

5.  **Update References:** After moving/renaming, search the codebase (especially within `src/services/mcp/`) for old paths or class names (`McpToolExecutor`) and update them to point to the new locations and names (`McpToolExecutor`).

**Verification:**
*   Confirm the four core component files exist in `src/services/mcp/core/`.
*   Confirm class names match the refactoring plan (`McpToolExecutor`).
*   Perform static analysis (e.g., TypeScript compilation) to check for broken imports or incorrect references within the `core/` directory and immediate dependencies.
*   Run existing unit tests related to these components (they may fail due to dependency changes, which will be addressed later, but check for compilation errors).

---