# ClineProvider Refactoring Analysis

This document outlines the classes and public methods created by refactoring the original `ClineProvider`.

---

## 1. ClineStack (`./cline/ClineStack.ts`)

**Purpose:** Manages the stack of active `Cline` instances, representing the hierarchy of tasks and subtasks.

**Methods:**

*   `async addCline(cline: Cline): Promise<void>`
    *   Adds a `Cline` instance to the top of the stack.
*   `async removeCurrentCline(): Promise<Cline | undefined>`
    *   Removes the top `Cline` instance from the stack and aborts its task. Returns the removed instance.
*   `getCurrentCline(): Cline | undefined`
    *   Returns the top `Cline` instance without removing it from the stack.
*   `getSize(): number`
    *   Returns the current number of `Cline` instances in the stack.
*   `getTaskStack(): string[]`
    *   Returns an array of task IDs representing the current stack order.
*   `async finishSubTask(lastMessage?: string): Promise<void>`
    *   Removes the top `Cline` (subtask) and resumes the next `Cline` in the stack (parent task), optionally passing a message.

---

## 2. ClineStateManager (`./cline/ClineStateManager.ts`)

**Purpose:** Consolidates the management of application state, including global settings, secrets, and API configuration retrieval.

**Methods:**

*   `async getState()`
    *   Retrieves the complete application state by combining values from global state (`vscode.ExtensionContext.globalState`) and secrets (`vscode.SecretStorage`). Returns a comprehensive state object.
*   `async updateGlobalState(key: GlobalStateKey, value: any): Promise<void>`
    *   Updates a specific key in VS Code's global state.
*   `async getGlobalState(key: GlobalStateKey): Promise<any>`
    *   Retrieves a specific key's value from VS Code's global state.
*   `async setValues(values: Partial<ConfigurationValues>): Promise<void>`
    *   Updates multiple global state keys simultaneously.
*   `async storeSecret(key: SecretKey, value?: string): Promise<void>`
    *   Stores or deletes a value in VS Code's secret storage.
*   `getCustomModes?: () => Promise<ModeConfig[] | undefined>`
    *   (Property, assigned by `ClineProvider`) A function reference to retrieve custom mode configurations.

---

## 3. ClineApiManager (`./api/ClineApiManager.ts`)

**Purpose:** Handles API configurations, authentication callbacks, mode switching logic related to APIs, and building API handler instances.

**Methods:**

*   `async updateApiConfiguration(apiConfiguration: ApiConfiguration): Promise<void>`
    *   Updates the current API configuration in the global state and potentially updates the mode's default config.
*   `buildApiHandler(apiConfiguration: ApiConfiguration)`
    *   Creates and returns an API handler instance (e.g., for Anthropic, OpenAI) based on the provided configuration.
*   `async handleModeSwitch(newMode: Mode): Promise<void>`
    *   Manages the logic when the user switches modes, including loading the API configuration associated with the new mode or saving the current one as the default for that mode.
*   `async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration): Promise<void>`
    *   Saves a new API configuration profile or updates an existing one by name.
*   `async handleOpenRouterCallback(code: string): Promise<void>`
    *   Handles the OAuth callback from OpenRouter, exchanging the code for an API key and updating the configuration.
*   `async handleGlamaCallback(code: string): Promise<void>`
    *   Handles the OAuth callback from Glama, exchanging the code for an API key and updating the configuration.
*   `async handleRequestyCallback(code: string): Promise<void>`
    *   Handles the callback from Requesty, saving the API key and updating the configuration.
*   `async getApiProviders(): Promise<Record<string, any>>`
    *   Fetches available models from various supported API providers (OpenAI, OpenRouter, Glama, etc.).

---

## 4. ClineTaskHistory (`./history/ClineTaskHistory.ts`)

**Purpose:** Manages the storage, retrieval, and manipulation of task history items and their associated data (conversation logs, checkpoints).

**Methods:**

*   `async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]>`
    *   Adds a new task `HistoryItem` to the history list in global state or updates an existing one.
*   `async getTaskHistory(): Promise<HistoryItem[]>`
    *   Retrieves the complete list of `HistoryItem` objects from global state.
*   `async getTaskWithId(id: string): Promise<{...}>`
    *   Retrieves a specific `HistoryItem` by its ID, along with paths to its data files (conversation history, UI messages) and the parsed conversation history content.
*   `async showTaskWithId(id: string, getCurrentCline: () => Cline | undefined, initHistoryItem: (item: HistoryItem) => Promise<void>, postAction: () => Promise<void>): Promise<void>`
    *   Handles the logic to display a specific task from history in the webview UI, potentially initializing a new `Cline` instance with the history item.
*   `async exportTaskWithId(id: string): Promise<void>`
    *   Exports the conversation history of a specific task to a Markdown file.
*   `async deleteTaskWithId(id: string, getCurrentCline: () => Cline | undefined, finishSubTask: (message?: string) => Promise<void>): Promise<void>`
    *   Deletes a task completely, including its entry in the history state, its checkpoint data (shadow repo/branch), and its dedicated task directory on disk.
*   `async deleteTaskFromState(id: string): Promise<void>`
    *   Removes a task's `HistoryItem` only from the history list in global state.

---

## 5. ClineCacheManager (`./cache/ClineCacheManager.ts`)

**Purpose:** Manages disk caching operations, primarily for API model information.

**Methods:**

*   `async ensureCacheDirectoryExists(): Promise<string>`
    *   Checks if the cache directory exists within the extension's global storage path, creates it if necessary, and returns the path.
*   `async ensureSettingsDirectoryExists(): Promise<string>`
    *   Checks if the settings directory exists within the extension's global storage path, creates it if necessary, and returns the path.
*   `async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined>`
    *   Reads and parses JSON model data from a specified file within the cache directory.
*   `async writeModelsToCache(filename: string, data: Record<string, ModelInfo>): Promise<void>`
    *   Writes model data as JSON to a specified file within the cache directory.
*   `async clearCache(): Promise<void>`
    *   Deletes all files within the cache directory.

---

## 6. ClineMcpManager (`./mcp/ClineMcpManager.ts`)

**Purpose:** Acts as an intermediary for interacting with the `McpHub`, which manages connections to Model Control Protocol (MCP) servers.

**Methods:**

*   `setMcpHub(hub: McpHub): void`
    *   Sets the internal reference to the shared `McpHub` instance (provided by `McpServerManager`).
*   `getMcpHub(): McpHub | undefined`
    *   Returns the internal `McpHub` instance.
*   `async ensureMcpServersDirectoryExists(): Promise<string>`
    *   Checks if the platform-specific directory for MCP server configurations exists, creates it if necessary, and returns the path.
*   `async updateServerTimeout(serverName: string, timeout: number): Promise<void>`
    *   Delegates to `McpHub` to update the timeout setting for a specific server.
*   `async deleteServer(serverName: string): Promise<void>`
    *   Delegates to `McpHub` to remove a server configuration.
*   `async toggleToolAlwaysAllow(serverName: string, toolName: string, alwaysAllow: boolean): Promise<void>`
    *   Delegates to `McpHub` to toggle the "always allow" setting for a specific tool on a server.
*   `async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void>`
    *   Delegates to `McpHub` to enable or disable a specific server connection.
*   `async restartConnection(serverName: string): Promise<void>`
    *   Delegates to `McpHub` to force a reconnection attempt to a specific server.
*   `async getMcpSettingsFilePath(): Promise<string | undefined>`
    *   Delegates to `McpHub` to get the path to the main MCP settings file, with a fallback to construct the path if the hub isn't available.
*   `getAllServers(): any[]`
    *   Delegates to `McpHub` to get a list of all configured MCP servers.
*   `async registerServer(name: string, host: string, port: number): Promise<boolean>`
    *   Delegates to `McpHub` to register a new MCP server.
*   `dispose(): void`
    *   Disposes the internal `McpHub` instance.