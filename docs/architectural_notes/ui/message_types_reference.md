# Message Types Reference

**Date:** 2025-06-14  
**Status:** Current Implementation Analysis  
**Purpose:** Comprehensive reference for all message types used in extension-webview communication

## WebviewMessage Types (Webview → Extension)

### Task Management

#### newTask
**Purpose**: Start a new AI task
```typescript
{
    type: "newTask",
    text: string,           // Task description
    images?: string[]       // Optional image attachments (base64)
}
```

#### clearTask  
**Purpose**: Cancel current task
```typescript
{
    type: "clearTask"
}
```

#### askResponse
**Purpose**: User response to AI questions
```typescript
{
    type: "askResponse", 
    askResponse: TheaAskResponse,  // "yesButtonTapped" | "noButtonTapped" | "messageResponse"
    text?: string,                 // Optional response text
    images?: string[]              // Optional image attachments
}
```

#### showTaskWithId
**Purpose**: Resume task from history
```typescript
{
    type: "showTaskWithId",
    text: string                   // Task ID to resume
}
```

#### deleteTaskWithId
**Purpose**: Delete task from history
```typescript
{
    type: "deleteTaskWithId", 
    text: string                   // Task ID to delete
}
```

#### exportCurrentTask
**Purpose**: Export current task to file
```typescript
{
    type: "exportCurrentTask"
}
```

### API Configuration

#### apiConfiguration
**Purpose**: Update API provider settings
```typescript
{
    type: "apiConfiguration",
    apiConfiguration: ApiConfiguration
}

interface ApiConfiguration {
    apiProvider: string           // "anthropic" | "openai" | "openrouter" | etc.
    anthropicApiKey?: string
    anthropicBaseUrl?: string
    openaiApiKey?: string
    openaiBaseUrl?: string
    openaiModelId?: string
    // ... provider-specific fields
}
```

#### mode
**Purpose**: Switch AI mode/model
```typescript
{
    type: "mode",
    text: Mode                    // Mode identifier
}
```

### Auto-Approval Settings

#### alwaysAllowReadOnly
**Purpose**: Toggle read-only file auto-approval
```typescript
{
    type: "alwaysAllowReadOnly",
    bool: boolean
}
```

#### alwaysAllowWrite
**Purpose**: Toggle file write auto-approval
```typescript
{
    type: "alwaysAllowWrite", 
    bool: boolean
}
```

#### alwaysAllowExecute
**Purpose**: Toggle command execution auto-approval
```typescript
{
    type: "alwaysAllowExecute",
    bool: boolean
}
```

#### alwaysAllowBrowser
**Purpose**: Toggle browser tool auto-approval
```typescript
{
    type: "alwaysAllowBrowser",
    bool: boolean
}
```

#### alwaysAllowMcp
**Purpose**: Toggle MCP tool auto-approval
```typescript
{
    type: "alwaysAllowMcp",
    bool: boolean
}
```

#### alwaysAllowModeSwitch
**Purpose**: Toggle mode switching auto-approval
```typescript
{
    type: "alwaysAllowModeSwitch",
    bool: boolean
}
```

#### alwaysAllowSubtasks
**Purpose**: Toggle subtask creation auto-approval
```typescript
{
    type: "alwaysAllowSubtasks",
    bool: boolean
}
```

#### alwaysApproveResubmit
**Purpose**: Toggle request retry auto-approval
```typescript
{
    type: "alwaysApproveResubmit",
    bool: boolean
}
```

### Performance Settings

#### requestDelaySeconds
**Purpose**: Set delay between requests
```typescript
{
    type: "requestDelaySeconds",
    value: number                 // Seconds to wait
}
```

#### rateLimitSeconds
**Purpose**: Set rate limiting interval
```typescript
{
    type: "rateLimitSeconds", 
    value: number                 // Rate limit in seconds
}
```

#### writeDelayMs
**Purpose**: Set file write delay
```typescript
{
    type: "writeDelayMs",
    value: number                 // Milliseconds to wait
}
```

#### terminalOutputLineLimit
**Purpose**: Set terminal output line limit
```typescript
{
    type: "terminalOutputLineLimit",
    value: number                 // Maximum lines to capture
}
```

#### terminalShellIntegrationTimeout
**Purpose**: Set shell integration timeout
```typescript
{
    type: "terminalShellIntegrationTimeout",
    value: number                 // Timeout in seconds
}
```

### UI Settings

#### soundEnabled
**Purpose**: Toggle sound notifications
```typescript
{
    type: "soundEnabled",
    bool: boolean
}
```

#### ttsEnabled
**Purpose**: Toggle text-to-speech
```typescript
{
    type: "ttsEnabled",
    bool: boolean
}
```

#### ttsSpeed
**Purpose**: Set text-to-speech speed
```typescript
{
    type: "ttsSpeed",
    value: number                 // Speed multiplier (0.5 - 2.0)
}
```

#### language
**Purpose**: Change UI language
```typescript
{
    type: "language",
    text: Language                // Language code ("en", "es", "fr", etc.)
}
```

#### diffEnabled
**Purpose**: Toggle diff view for file changes
```typescript
{
    type: "diffEnabled",
    bool: boolean
}
```

### Tool Settings

#### browserToolEnabled
**Purpose**: Toggle browser tool availability
```typescript
{
    type: "browserToolEnabled",
    bool: boolean
}
```

#### browserViewportSize
**Purpose**: Set browser viewport size
```typescript
{
    type: "browserViewportSize",
    text: string                  // Format: "1920x1080"
}
```

#### remoteBrowserHost
**Purpose**: Set remote browser host
```typescript
{
    type: "remoteBrowserHost",
    text: string                  // URL or "auto" for auto-discovery
}
```

#### maxReadFileLine
**Purpose**: Set maximum lines to read from files
```typescript
{
    type: "maxReadFileLine",
    value: number
}
```

#### maxWorkspaceFiles
**Purpose**: Set maximum workspace files to include in context
```typescript
{
    type: "maxWorkspaceFiles",
    value: number
}
```

#### screenshotQuality
**Purpose**: Set screenshot quality
```typescript
{
    type: "screenshotQuality",
    value: number                 // 1-100 quality percentage
}
```

### File Management

#### selectImages
**Purpose**: Open file picker for images
```typescript
{
    type: "selectImages"
}
```

#### showTheaIgnoredFiles
**Purpose**: Toggle display of ignored files
```typescript
{
    type: "showTheaIgnoredFiles",
    bool: boolean
}
```

### Custom Instructions

#### customInstructions
**Purpose**: Update custom instructions
```typescript
{
    type: "customInstructions",
    text: string                  // Custom instruction text
}
```

#### updateSupportPrompt
**Purpose**: Update support prompt templates
```typescript
{
    type: "updateSupportPrompt",
    values: Record<string, string>  // Prompt key-value pairs
}
```

#### resetSupportPrompt
**Purpose**: Reset support prompt to default
```typescript
{
    type: "resetSupportPrompt",
    text: string                  // Prompt key to reset
}
```

### Lifecycle Events

#### webviewDidLaunch
**Purpose**: Initial webview startup signal
```typescript
{
    type: "webviewDidLaunch"
}
```

#### didShowAnnouncement
**Purpose**: Mark announcement as seen
```typescript
{
    type: "didShowAnnouncement"
}
```

## ExtensionMessage Types (Extension → Webview)

### State Synchronization

#### state
**Purpose**: Full state synchronization
```typescript
{
    type: "state",
    state: ExtensionState
}

interface ExtensionState {
    version?: string
    osInfo?: "win32" | "unix"
    uriScheme?: string
    
    // Configuration
    apiConfiguration?: ApiConfiguration
    customInstructions?: string
    
    // Auto-approval settings
    alwaysAllowReadOnly?: boolean
    alwaysAllowWrite?: boolean
    alwaysAllowExecute?: boolean
    // ... all other settings
    
    // Task state
    currentTaskItem?: HistoryItem
    taskHistory?: HistoryItem[]
    clineMessages?: TheaMessage[]
    
    // UI state
    showWelcome?: boolean
    didHydrateState?: boolean
    
    // MCP state
    mcpServers?: McpServer[]
}
```

### Real-Time Updates

#### clineMessage
**Purpose**: Real-time task execution updates
```typescript
{
    type: "clineMessage",
    clineMessage: TheaMessage
}

interface TheaMessage {
    ts: number
    type: "say" | "ask"
    say?: TheaSay
    ask?: TheaAsk
    text?: string
    images?: string[]
    tool?: string
    isStreaming?: boolean
    // ... additional properties based on message type
}
```

### UI Actions

#### invoke
**Purpose**: Trigger specific UI actions
```typescript
{
    type: "invoke",
    invoke: string,               // Action name
    text?: string,                // Optional data
    images?: string[]             // Optional images
}
```

**Common invoke actions**:
- `"setChatBoxMessage"` - Set chat input text
- `"sendMessage"` - Send message immediately
- `"focusChatBox"` - Focus chat input

#### action  
**Purpose**: Navigation and UI state changes
```typescript
{
    type: "action",
    action: string                // Action name
}
```

**Common actions**:
- `"chatButtonClicked"` - Switch to chat view
- `"settingsButtonClicked"` - Switch to settings view
- `"historyButtonClicked"` - Switch to history view
- `"mcpButtonClicked"` - Switch to MCP view
- `"promptsButtonClicked"` - Switch to prompts view
- `"didBecomeVisible"` - Webview became visible

### Response Messages

#### selectedImages
**Purpose**: Response to selectImages request
```typescript
{
    type: "selectedImages",
    images: string[]              // Selected image paths
}
```

#### browserConnectionResult
**Purpose**: Browser connection test result
```typescript
{
    type: "browserConnectionResult", 
    success: boolean,
    text: string,                 // Status message
    values?: {
        endpoint: string          // Connection endpoint
    }
}
```

#### error
**Purpose**: Error notifications
```typescript
{
    type: "error",
    text: string                  // Error message
}
```

### Text-to-Speech

#### ttsStart
**Purpose**: TTS playback started
```typescript
{
    type: "ttsStart",
    text: string                  // Text being spoken
}
```

#### ttsStop
**Purpose**: TTS playback stopped
```typescript
{
    type: "ttsStop", 
    text: string                  // Text that was being spoken
}
```

### Batch Messages

#### batch
**Purpose**: Multiple messages in one payload (performance optimization)
```typescript
{
    type: "batch",
    messages: ExtensionMessage[] // Array of messages to process
}
```

## TheaMessage Subtypes

### Say Types (TheaSay)
AI providing information to user:

- `"task"` - Task-level information
- `"text"` - General text response
- `"tool"` - Tool execution information
- `"api_req_started"` - API request initiated
- `"api_req_finished"` - API request completed
- `"error"` - Error information
- `"completion_result"` - Task completion summary

### Ask Types (TheaAsk)
AI requesting user input/approval:

- `"followup"` - Follow-up question
- `"command"` - Command execution approval
- `"completion_result"` - Task completion confirmation
- `"tool"` - Tool usage approval
- `"browser_action"` - Browser action approval
- `"mcp_tool"` - MCP tool approval

### Ask Response Types (TheaAskResponse)
User responses to AI questions:

- `"yesButtonTapped"` - Approval granted
- `"noButtonTapped"` - Approval denied  
- `"messageResponse"` - Custom text response

## Message Flow Examples

### Starting a New Task
```typescript
// 1. User clicks "Start Task" in webview
webview → extension: {
    type: "newTask",
    text: "Create a React component",
    images: []
}

// 2. Extension creates task and starts execution
extension → webview: {
    type: "clineMessage", 
    clineMessage: {
        ts: Date.now(),
        type: "say",
        say: "task",
        text: "Starting new task: Create a React component"
    }
}

// 3. AI asks for file permission
extension → webview: {
    type: "clineMessage",
    clineMessage: {
        ts: Date.now(),
        type: "ask", 
        ask: "tool",
        text: "Can I create the file Component.tsx?"
    }
}

// 4. User approves
webview → extension: {
    type: "askResponse",
    askResponse: "yesButtonTapped"
}
```

### Updating Settings
```typescript
// 1. User toggles auto-approval setting
webview → extension: {
    type: "alwaysAllowWrite",
    bool: true
}

// 2. Extension updates state and syncs back
extension → webview: {
    type: "state",
    state: {
        // ... full state with updated alwaysAllowWrite: true
    }
}
```

## Related Documentation

- [Communication Protocols](./communication_protocols.md)
- [State Management](./state_management.md)
- [Webview Architecture](./webview_architecture.md)
