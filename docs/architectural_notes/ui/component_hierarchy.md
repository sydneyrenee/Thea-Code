# Component Hierarchy Documentation

**Date:** 2025-06-14  
**Status:** Current Implementation Analysis  
**Purpose:** Document the React component hierarchy and relationships

## Component Tree Structure

```
App.tsx (Root)
├── QueryClientProvider
├── TranslationProvider
├── ExtensionStateContextProvider
└── MainApp
    ├── WelcomeView (conditional)
    ├── TabContent
    │   ├── ChatView (default)
    │   ├── SettingsView
    │   ├── HistoryView
    │   ├── McpView
    │   └── PromptsView
```

## Root Level Components

### App.tsx
**Location**: `webview-ui/src/App.tsx`
**Purpose**: Application shell and routing
**Key Responsibilities**:
- Provider setup (Query, Translation, State)
- Tab-based navigation management
- Global message handling from extension
- View lifecycle coordination

```typescript
const App = () => {
    const [tab, setTab] = useState<Tab>("chat")
    
    // Message handling for navigation
    useEvent("message", (event) => {
        const message: ExtensionMessage = event.data
        const newTab = tabsByMessageAction[message.action]
        if (newTab) setTab(newTab)
    })
}
```

## Provider Components

### ExtensionStateContextProvider
**Location**: `webview-ui/src/context/ExtensionStateContext.tsx`
**Purpose**: Global state management
**Data Provided**:
- Extension configuration and settings
- API provider configurations
- Task history and current task state
- UI preferences and feature flags

### TranslationProvider  
**Location**: `webview-ui/src/i18n/TranslationContext.tsx`
**Purpose**: Internationalization support
**Features**:
- Multi-language support (13+ languages)
- Namespace-based translations
- Dynamic language switching
- Fallback to English for missing translations

### QueryClientProvider
**Purpose**: Async state management
**Features**:
- Caching for API responses
- Background refetching
- Optimistic updates
- Error handling

## Main View Components

### 1. ChatView
**Location**: `webview-ui/src/components/chat/ChatView.tsx`
**Purpose**: Primary AI interaction interface
**Component Hierarchy**:
```
ChatView
├── ChatHeader (task info, model selection)
├── MessagesList
│   └── ChatRow[] (individual messages)
│       ├── MessageContent
│       ├── ToolVisualization (file ops, web browse, etc.)
│       └── ActionButtons (approve, retry, etc.)
├── InputArea
│   ├── ImageAttachment
│   ├── TextInput (with auto-resize)
│   └── SubmitButton
└── ActionButtons (primary/secondary actions)
```

**Key Features**:
- Real-time message streaming
- Tool execution visualization  
- Auto-approval controls
- Image attachment support
- Task state management (running, paused, completed)

### 2. SettingsView
**Location**: `webview-ui/src/components/settings/SettingsView.tsx`
**Purpose**: Configuration management
**Component Hierarchy**:
```
SettingsView
├── SettingsTabs
│   ├── ApiTab
│   │   ├── ProviderSelector
│   │   ├── ModelSelector
│   │   └── ApiKeyInput
│   ├── FeaturesTab
│   │   ├── ToolToggles
│   │   ├── AutoApprovalSettings
│   │   └── BrowserSettings
│   ├── PerformanceTab
│   │   ├── RateLimiting
│   │   ├── DelaySettings
│   │   └── ResourceLimits
│   └── UITab
│       ├── ThemeSelector
│       ├── LanguageSelector
│       └── SoundSettings
└── ActionButtons (save, reset, etc.)
```

### 3. HistoryView
**Location**: `webview-ui/src/components/history/HistoryView.tsx`
**Purpose**: Task history management
**Component Hierarchy**:
```
HistoryView
├── HistoryHeader
│   ├── SearchInput
│   ├── FilterControls
│   └── BulkActions
├── HistoryList
│   └── HistoryItem[]
│       ├── TaskPreview
│       ├── TaskMetadata (date, duration, tokens)
│       └── TaskActions (resume, delete, export)
└── Pagination
```

### 4. McpView
**Location**: `webview-ui/src/components/mcp/McpView.tsx`
**Purpose**: MCP server management
**Component Hierarchy**:
```
McpView
├── ServerList
│   └── ServerItem[]
│       ├── ServerStatus
│       ├── ServerInfo
│       └── ServerActions
├── ToolRegistry
│   └── ToolItem[]
│       ├── ToolInfo
│       └── ToolControls
└── DebugPanel
    ├── LogViewer
    └── ConnectionStatus
```

### 5. PromptsView  
**Location**: `webview-ui/src/components/prompts/PromptsView.tsx`
**Purpose**: Custom prompt management
**Component Hierarchy**:
```
PromptsView
├── PromptCategories
├── PromptList
│   └── PromptItem[]
│       ├── PromptPreview
│       ├── PromptMetadata
│       └── PromptActions
├── PromptEditor
│   ├── TemplateEditor
│   ├── VariableManager
│   └── PreviewPane
└── ImportExport
```

## Modern UI Component Library

### Chat Components (`components/ui/chat/`)

#### Chat (Container)
```
Chat
├── ChatProvider (context)
├── ChatMessages
│   └── ChatMessage[]
│       ├── ChatMessageHeader
│       │   ├── ChatMessageAvatar
│       │   └── MessageBadges
│       ├── ChatMessageContent
│       └── ChatMessageActions
└── ChatInput
    ├── ChatInputField (autosize textarea)
    └── ChatInputSubmit
```

**Design Patterns**:
- **Provider Pattern**: ChatProvider wraps components
- **Compound Components**: Chat.Messages, Chat.Input  
- **Render Props**: Flexible content rendering
- **Hooks**: useChatUI, useChatInput, useChatMessage

### Core UI Components (`components/ui/`)

#### VSCode Components
**Location**: `webview-ui/src/components/ui/vscode-components.tsx`
**Purpose**: Native VS Code UI component wrappers
**Components**:
- VSCodeButton (primary, secondary appearances)
- VSCodeTextField (input with validation)
- VSCodeTextArea (resizable text input)
- VSCodeCheckbox (boolean input)
- VSCodeDropdown (select input)
- VSCodePanels (tab container)

#### Layout Components
- **Container**: Standard content wrapper
- **Stack**: Vertical/horizontal spacing
- **Grid**: CSS Grid layout helper
- **Separator**: Visual dividers

#### Form Components
- **Input**: Enhanced text input with validation
- **AutosizeTextarea**: Growing text area
- **Button**: Enhanced button with loading states
- **Badge**: Status and category indicators

## Component Communication Patterns

### 1. **Props Down, Events Up**
```typescript
// Parent to child - props
<ChatMessage message={message} isLast={isLast} />

// Child to parent - callbacks
<ChatInput onSubmit={handleSubmit} />
```

### 2. **Context for Global State**
```typescript
// Provide global state
<ExtensionStateContext.Provider value={state}>

// Consume in any child
const { apiConfiguration } = useExtensionState()
```

### 3. **Message Passing to Extension**
```typescript
// From component to extension
vscode.postMessage({
    type: "newTask",
    text: userInput,
    images: attachedImages
})
```

### 4. **Custom Hooks for Logic**
```typescript
// Encapsulate component logic
const useChatInput = () => {
    const { input, setInput, append } = useChatUI()
    
    const handleSubmit = useCallback(async () => {
        await append({ role: "user", content: input })
        setInput("")
    }, [input, append, setInput])
    
    return { handleSubmit }
}
```

## Component State Management

### Local State (useState)
- Component-specific UI state
- Form inputs and validation
- Temporary UI states (loading, expanded)

### Global State (Context)
- Extension configuration
- User preferences  
- Current task state
- Message history

### Server State (React Query)
- API responses
- Cached configurations
- Background sync data

## Component Lifecycle Patterns

### View Mounting/Unmounting
```typescript
// In App.tsx
const renderView = () => {
    switch (tab) {
        case "chat": return <ChatView />
        case "settings": return <SettingsView />
        // Other views unmount when not active
    }
}
```

### Cleanup on Navigation
```typescript
// SettingsView checks for unsaved changes
const checkUnsaveChanges = (callback) => {
    if (hasUnsavedChanges) {
        // Show confirmation dialog
        showConfirmation(() => callback())
    } else {
        callback()
    }
}
```

### Memory Management
- Components clean up subscriptions in useEffect cleanup
- Large lists use virtual scrolling
- Images are lazy loaded

## Testing Patterns

### Component Testing
```typescript
// Mock providers for isolation
const renderWithProviders = (component) => {
    return render(
        <ExtensionStateContextProvider value={mockState}>
            <TranslationProvider>
                {component}
            </TranslationProvider>
        </ExtensionStateContextProvider>
    )
}
```

### Message Testing
```typescript
// Test message handling
const triggerMessage = (action) => {
    window.dispatchEvent(new MessageEvent("message", {
        data: { action }
    }))
}
```

## Performance Considerations

### Lazy Loading
- Views are not pre-loaded
- Heavy components load on demand
- Code splitting at the view level

### Memoization
- useMemo for expensive computations
- useCallback for stable function references
- React.memo for pure components

### Virtual Scrolling
- Large message lists in ChatView
- Task history pagination
- Tool execution logs

## Related Documentation

- [Webview Architecture](./webview_architecture.md)
- [State Management](./state_management.md)
- [Communication Protocols](./communication_protocols.md)
