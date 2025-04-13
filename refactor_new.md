# Proposed Refactoring Plan for ClineProvider.ts

This document outlines a plan to refactor the current `./src/core/webview/ClineProvider.ts` based on the modular structure observed in the `../Roo-Code-mlx` branch (documented in `refactor_analysis.md`).

---

## Target Modules & Responsibilities

1.  **`ClineStack`**: Manage the stack (`clineStack` array) of active `Cline` instances.
2.  **`ClineStateManager`**: Consolidate access and retrieval of application state (global state, secrets). Uses `ContextProxy`.
3.  **`ClineApiManager`**: Manage API configuration profiles (load/save/list/switch), handle OAuth callbacks. Uses `ProviderSettingsManager` (current branch's config manager) and `ContextProxy`.
4.  **`ClineTaskHistory`**: Manage task history array in global state, handle task data persistence (reading/writing conversation logs), task deletion including checkpoints. Uses `ContextProxy`.
5.  **`ClineCacheManager`**: Manage disk cache for models, ensure cache/settings directories exist. Uses `ContextProxy`.
6.  **`ClineMcpManager`**: Manage interactions with the `McpHub`, handle MCP server directory. Holds `mcpHub` instance.

---

## Proposed Mapping from Current `ClineProvider.ts`

### 1. To `ClineStack.ts`

*   **Property:** `clineStack: Cline[]`
*   **Methods:**
    *   `async addClineToStack(cline: Cline)` (Lines 128-140) - *Core logic*
    *   `async removeClineFromStack()` (Lines 144-169) - *Core logic*
    *   `getCurrentCline(): Cline | undefined` (Lines 173-178)
    *   `getClineStackSize(): number` (Lines 181-183)
    *   `getCurrentTaskStack(): string[]` (Lines 185-187)
    *   `async finishSubTask(lastMessage?: string)` (Lines 192-198)

### 2. To `ClineStateManager.ts`

*   **Properties:**
    *   Needs `contextProxy: ContextProxy`
    *   Needs `providerSettingsManager: ProviderSettingsManager`
    *   Needs `customModesManager: CustomModesManager`
    *   Needs reference `getCustomModes()` (Set by new `ClineProvider`)
*   **Methods:**
    *   `async getState()` (Lines 1269-1344) - *Core logic consolidation*
    *   `async getStateToPostToWebview()` (Lines 1132-1261) - *Formats state from `getState()`*
    *   `async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K])` (Lines 1364-1366) - *Delegate to `contextProxy`*
    *   `getGlobalState<K extends keyof GlobalState>(key: K)` (Lines 1370-1372) - *Delegate to `contextProxy`*
    *   `async setValue<K extends keyof TheaCodeSettings>(key: K, value: TheaCodeSettings[K])` (Lines 1374-1376) - *Delegate to `contextProxy`*
    *   `getValue<K extends keyof TheaCodeSettings>(key: K)` (Lines 1378-1380) - *Delegate to `contextProxy`*
    *   `getValues()` (Lines 1382-1384) - *Delegate to `contextProxy`*
    *   `async setValues(values: TheaCodeSettings)` (Lines 1386-1388) - *Delegate to `contextProxy`*

### 3. To `ClineApiManager.ts`

*   **Properties:**
    *   Needs `contextProxy: ContextProxy`
    *   Needs `providerSettingsManager: ProviderSettingsManager`
    *   Needs `outputChannel: vscode.OutputChannel`
*   **Methods:**
    *   `async updateApiConfiguration(providerSettings: ProviderSettings)` (Lines 788-807) - *Core logic, uses `contextProxy` and `providerSettingsManager`*
    *   `async handleModeSwitch(newMode: Mode)` (Lines 742-785) - *Core logic, uses `providerSettingsManager`*
    *   `async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration)` (Lines 998-1016) - *Uses `providerSettingsManager`*
    *   `async handleOpenRouterCallback(code: string)` (Lines 917-947)
    *   `async handleGlamaCallback(code: string)` (Lines 951-978)
    *   `async handleRequestyCallback(code: string)` (Lines 982-994)
    *   `buildApiHandler(providerSettings: ProviderSettings)` (Would be added, likely calling the existing top-level `buildApiHandler`)

### 4. To `ClineTaskHistory.ts`

*   **Properties:**
    *   Needs `contextProxy: ContextProxy`
    *   Needs `workspaceDir: string` (from `cwd` getter)
*   **Methods:**
    *   `async getTaskWithId(id: string): Promise<{...}>` (Lines 1020-1055) - *Core logic*
    *   `async showTaskWithId(id: string)` (Lines 1057-1065) - *Requires callbacks passed in*
    *   `async exportTaskWithId(id: string)` (Lines 1067-1070)
    *   `async deleteTaskWithId(id: string)` (Lines 1073-1118) - *Core logic, includes checkpoint deletion*
    *   `async deleteTaskFromState(id: string)` (Lines 1120-1125)
    *   `async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]>` (Lines 1346-1358) - *Core logic*

### 5. To `ClineCacheManager.ts`

*   **Properties:**
    *   Needs `context: vscode.ExtensionContext` (or `contextProxy`)
*   **Methods:**
    *   `async ensureCacheDirectoryExists()` (Lines 896-900)
    *   `async ensureSettingsDirectoryExists()` (Lines 889-893)
    *   `async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined>` (Lines 903-913)
    *   `writeModelsToCache(filename: string, data: Record<string, ModelInfo>)` (Would be added, similar to `readModelsFromCache`)

### 6. To `ClineMcpManager.ts`

*   **Properties:**
    *   Needs `mcpHub?: McpHub`
*   **Methods:**
    *   `async ensureMcpServersDirectoryExists(): Promise<string>` (Lines 865-887)
    *   `getMcpHub(): McpHub | undefined` (Lines 1435-1437) - *Accessor*
    *   `setMcpHub(hub: McpHub)` (Would be added)
    *   Other delegation methods (`updateServerTimeout`, `deleteServer`, etc.) would need to be added, mirroring the structure in `refactor_analysis.md`, delegating calls to the `mcpHub` instance.

### 7. Remaining in `ClineProvider.ts` (Refactored Version)

*   **Properties:**
    *   Static: `sideBarId`, `tabPanelId`, `activeInstances`
    *   Instance: `disposables`, `view`, `isViewLaunched`, `workspaceTracker`, `latestAnnouncementId`, `settingsImportedAt`, `context`, `outputChannel`, `renderContext`
    *   Manager Instances: `contextProxy`, `providerSettingsManager`, `customModesManager`, **plus new managers** (`clineStackManager`, `clineStateManager`, `clineApiManager`, `clineTaskHistory`, `clineCacheManager`, `clineMcpManager`)
*   **Methods:**
    *   `constructor` (Lines 91-123) - *Initializes all managers*
    *   `dispose` (Lines 205-233) - *Disposes managers*
    *   Static Methods: `getVisibleInstance`, `getInstance`, `isActiveTask`, `handleCodeAction`, `handleTerminalAction` (Lines 235-338) - *Largely unchanged, use managers internally*
    *   `resolveWebviewView` (Lines 340-445) - *Sets up webview, HTML, main message listener, initializes state via managers*
    *   `initClineWithTask` (Lines 454-492) - *Orchestrates: gets state via `clineStateManager`, creates `Cline`, adds via `clineStackManager`*
    *   `initClineWithHistoryItem` (Lines 494-558) - *Orchestrates: gets state/history via managers, creates `Cline`, adds via `clineStackManager`*
    *   `postMessageToWebview` (Lines 560-562)
    *   `getHMRHtmlContent` (Lines 564-639)
    *   `getHtmlContent` (Lines 652-724)
    *   `setWebviewMessageListener` (Lines 732-736) - *Sets up `webviewMessageHandler`, which will delegate actions to appropriate managers*
    *   `cancelTask` (Lines 809-850) - *Orchestrates: delegates abort/history fetch/re-init to managers*
    *   `updateCustomInstructions` (Lines 852-861) - *Delegates state update to `clineStateManager`, updates current `Cline`*
    *   `resetState` (Lines 1398-1415) - *Delegates to `contextProxy`, `providerSettingsManager`, `customModesManager`, potentially others*
    *   `log` (Lines 1419-1422)
    *   `getTelemetryProperties` (Lines 1444-1489) - *Gets state via `clineStateManager`*
    *   Getters: `cwd`, `viewLaunched`, `messages` (Lines 1392-1394, 1426-1432)

---

This mapping provides a blueprint for splitting the current monolithic `ClineProvider.ts` into more focused, maintainable modules, following the pattern established in the other branch.