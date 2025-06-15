# Settings Storage and Rollback Mechanisms in Thea-Code

## Overview

Thea-Code implements a sophisticated multi-layered state management and rollback system designed to protect against breaking changes from AI models while maintaining persistence across sessions. This document provides a comprehensive overview of how settings are stored and how the snapshot/rollback mechanisms work.

## Settings Storage Architecture

### Storage Layers

Thea-Code employs a hierarchical settings storage system with three distinct layers:

1. **Global State** - Stored in VS Code's `globalState` storage
2. **Secret State** - Stored in VS Code's secure `secrets` storage
3. **Provider Profiles** - Stored in VS Code's `secrets` storage as JSON

### Core Storage Components

#### 1. ContextProxy (`src/core/config/ContextProxy.ts`)

The `ContextProxy` serves as the central abstraction layer for all settings storage operations:

- **Purpose**: Abstracts VS Code's storage APIs and provides caching for performance
- **Caching Strategy**: Maintains in-memory caches for both global state and secrets
- **Initialization**: Loads all settings into memory on startup for fast access
- **Schema Validation**: Uses Zod schemas to validate settings on read/write operations

**Key Features**:
- **Pass-through keys**: Some keys like `taskHistory` bypass caching for real-time updates
- **Unified API**: Provides consistent getter/setter methods regardless of storage type
- **Error handling**: Graceful degradation when schema validation fails
- **Export/Import**: Supports settings backup and restore operations

```typescript
// Example usage
const contextProxy = new ContextProxy(vscode.ExtensionContext);
await contextProxy.initialize();

// Get/set values with type safety
const apiKey = contextProxy.getValue('apiKey'); // from secrets
const theme = contextProxy.getValue('theme'); // from global state
```

#### 2. TheaStateManager (`src/core/webview/thea/TheaStateManager.ts`)

The `TheaStateManager` consolidates application state for the webview:

- **State Aggregation**: Combines settings from multiple sources into a unified state object
- **Default Values**: Provides sensible defaults for all configuration options
- **Type Safety**: Ensures type-safe access to all state properties
- **Legacy Support**: Maintains backward compatibility with older settings formats

#### 3. ProviderSettingsManager (`src/core/config/ProviderSettingsManager.ts`)

Manages API provider configurations with profile support:

- **Profile Management**: Create, save, load, and delete named API configurations
- **Unique IDs**: Each configuration gets a unique identifier for reference
- **Mode Configurations**: Link specific modes to specific API configurations
- **Atomic Operations**: All operations are wrapped in locks to prevent data corruption
- **Validation**: Schema validation ensures configuration integrity

### Storage Schema Organization

#### Global Settings (Non-Secret)
Stored in VS Code's `globalState`, includes:
- UI preferences (`diffEnabled`, `soundEnabled`, `theme`)
- Behavior settings (`alwaysAllowWrite`, `enableCheckpoints`)
- Performance settings (`writeDelayMs`, `terminalOutputLineLimit`)
- Feature flags (`experiments`, `mcpEnabled`)
- Application state (`taskHistory`, `currentApiConfigName`)

#### Secret Settings
Stored in VS Code's secure `secrets` storage:
- API keys for all providers (`apiKey`, `openRouterApiKey`, etc.)
- Authentication tokens (`awsAccessKey`, `awsSecretKey`)
- Sensitive configuration data

#### Provider Profiles
Stored as JSON in secrets storage:
- Named API configurations with settings and credentials
- Mode-to-configuration mappings
- Current active configuration tracking

## Checkpoint/Snapshot System

### Overview

The checkpoint system provides git-based versioning of workspace files to enable rollback functionality when AI operations cause unwanted changes.

### Core Components

#### 1. ShadowCheckpointService (`src/services/checkpoints/ShadowCheckpointService.ts`)

The abstract base class that implements the core checkpoint functionality:

**Key Features**:
- **Shadow Git Repository**: Creates a separate git repository to track workspace changes
- **Workspace Isolation**: Uses `core.worktree` to point to the actual workspace
- **Automatic Exclusions**: Respects `.gitignore` and adds sensible defaults (`.git`, `node_modules`, etc.)
- **Nested Git Handling**: Temporarily disables nested git repositories during operations
- **Event System**: Emits events for checkpoint creation, restoration, and errors

**Storage Models**:
- **RepoPerTaskCheckpointService**: Each task gets its own repository
- **RepoPerWorkspaceCheckpointService**: Shared repository with task-specific branches

#### 2. TaskCheckpointManager (`src/core/TaskCheckpointManager.ts`)

Orchestrates checkpoint operations for individual tasks:

**Initialization Process**:
1. Checks if checkpoints are enabled in settings (`enableCheckpoints`)
2. Determines storage type (`checkpointStorage`: "task" or "workspace")
3. Creates appropriate service instance
4. Initializes shadow git repository
5. Creates initial checkpoint if none exists

**Checkpoint Lifecycle**:
```typescript
// Automatic checkpoint on significant operations
task.checkpointSave(); // Creates snapshot before major changes

// Manual restore operations
task.checkpointRestore({
  ts: messageTimestamp,
  commitHash: "abc123",
  mode: "restore" // or "preview"
});

// Diff viewing
task.checkpointDiff({
  ts: messageTimestamp,
  commitHash: "abc123", 
  mode: "checkpoint"
});
```

### Rollback Protection Mechanisms

#### 1. Automatic Checkpoint Creation

Checkpoints are automatically created at strategic points:
- **Task Initialization**: Before any AI operations begin
- **Major Operations**: Before file writes, command executions, or browser actions
- **User Requests**: When explicitly requested through the UI

#### 2. Granular Rollback Options

The system provides multiple rollback granularities:

**Preview Mode**:
- Shows what would be restored without making changes
- Allows users to inspect differences before committing to rollback
- Non-destructive operation

**Restore Mode**:
- Actually restores files to the checkpoint state
- Truncates conversation history to the checkpoint point
- Updates task state to reflect the rollback

#### 3. Conversation History Integration

Checkpoints are tightly integrated with conversation history:
- Each checkpoint is linked to a specific message timestamp
- Rollback truncates both files AND conversation history
- Maintains consistency between AI conversation state and file state
- Prevents "orphaned" messages that reference non-existent file states

### Protection Against AI Model Breaking Changes

#### 1. Proactive Checkpointing

The system creates checkpoints before any potentially destructive operations:
- **File Operations**: Before write_to_file, str_replace_editor operations
- **Command Execution**: Before running terminal commands
- **Browser Operations**: Before browser-based file modifications
- **Bulk Operations**: Before processing multiple files

#### 2. Error Recovery

When AI operations fail or produce unexpected results:
- **Automatic Detection**: Monitors for common failure patterns
- **Easy Rollback**: One-click restoration to last known good state
- **Partial Rollback**: Can rollback to any previous checkpoint, not just the latest
- **State Consistency**: Ensures both files and conversation state are restored together

#### 3. User Control

Users have complete control over the checkpoint system:
- **Enable/Disable**: Can turn checkpoints on/off globally
- **Storage Choice**: Can choose between task-based or workspace-based storage
- **Manual Triggers**: Can manually create checkpoints at any time
- **Selective Restoration**: Can choose exactly which checkpoint to restore to

### Storage Configuration

#### Checkpoint Storage Types

**Task Storage** (`checkpointStorage: "task"`):
- Each task gets its own git repository
- Complete isolation between tasks
- Higher storage usage but better organization
- Default and recommended setting

**Workspace Storage** (`checkpointStorage: "workspace"`):
- Single git repository with task-specific branches
- Shared storage, lower disk usage
- Potential for cross-task conflicts
- Experimental feature

#### Storage Locations

Checkpoints are stored in VS Code's global storage directory:
```
{globalStorageUri}/
├── tasks/
│   └── {taskId}/
│       └── checkpoints/  # Task-based storage
└── checkpoints/
    └── {workspaceHash}/  # Workspace-based storage
```

### Integration with Webview UI

#### Checkpoint UI Components

The webview UI provides rich checkpoint management:

**CheckpointSaved Component**:
- Shows when checkpoints are created
- Displays commit hash and metadata
- Indicates current checkpoint status

**CheckpointMenu Component**:
- Diff viewing functionality
- Preview and restore options
- User-friendly controls for rollback operations

**Settings Integration**:
- Checkbox to enable/disable checkpoints
- Storage type selection (planned)
- Integration with global settings system

#### Real-time Updates

The checkpoint system provides real-time feedback:
- **Progress Indicators**: Shows checkpoint creation/restoration progress
- **Status Updates**: Displays current checkpoint in the UI
- **Error Notifications**: Alerts users to checkpoint failures
- **Success Confirmations**: Confirms successful operations

## Data Flow and Synchronization

### Settings Synchronization

1. **Extension Startup**:
   - ContextProxy initializes and loads all settings
   - TheaStateManager consolidates state for webview
   - Webview receives initial state via message passing

2. **Settings Changes**:
   - User modifies settings in webview UI
   - Settings are sent to extension via message
   - Extension validates and stores changes
   - Updated state is broadcast back to webview

3. **Cross-Session Persistence**:
   - All settings persist across VS Code restarts
   - Secrets are encrypted by VS Code's secure storage
   - Global state survives extension updates

### Checkpoint Synchronization

1. **Checkpoint Creation**:
   - Git operations stage all workspace changes
   - Commit creates immutable snapshot
   - Event system notifies UI of new checkpoint
   - Message history is updated with checkpoint metadata

2. **Rollback Operations**:
   - Git reset/clean operations restore file state
   - Conversation history is truncated appropriately
   - UI is updated to reflect current state
   - Any pending operations are cancelled

## Security and Data Protection

### Sensitive Data Handling

- **API Keys**: Stored in VS Code's encrypted secrets storage
- **Credentials**: Never stored in plain text or logs
- **Isolation**: Each workspace maintains separate git repositories
- **Access Control**: Checkpoints respect VS Code's security model

### Data Integrity

- **Schema Validation**: All settings are validated against Zod schemas
- **Atomic Operations**: Settings changes are atomic to prevent corruption
- **Error Recovery**: Graceful degradation when settings become corrupted
- **Backup Support**: Export/import functionality for settings backup

### Privacy Considerations

- **Local Storage**: All data remains on the user's machine
- **No External Services**: Checkpoints don't require cloud storage
- **Workspace Isolation**: Different workspaces maintain separate states
- **Selective Sharing**: Users control what data is included in exports

## Performance Considerations

### Caching Strategy

- **In-Memory Caching**: ContextProxy caches frequently accessed settings
- **Lazy Loading**: Large data structures loaded on demand
- **Efficient Updates**: Only changed settings trigger storage operations
- **Batch Operations**: Multiple settings changes can be batched

### Checkpoint Performance

- **Incremental Snapshots**: Git only stores changes between checkpoints
- **Background Operations**: Checkpoint creation doesn't block UI
- **Efficient Diffs**: Git-based diffs are fast and space-efficient
- **Cleanup**: Old checkpoints can be automatically pruned

### Memory Management

- **Weak References**: TaskCheckpointManager uses weak references to prevent memory leaks
- **Event Cleanup**: Event listeners are properly removed on disposal
- **Resource Management**: Git operations properly clean up resources
- **Bounded Growth**: Checkpoint storage has configurable limits

## Configuration Options

### User-Configurable Settings

```typescript
interface CheckpointSettings {
  enableCheckpoints: boolean;        // Enable/disable checkpoint system
  checkpointStorage: "task" | "workspace"; // Storage strategy
  // Future additions:
  // maxCheckpoints: number;         // Maximum checkpoints per task
  // autoCleanup: boolean;          // Automatic cleanup of old checkpoints
  // compressionLevel: number;      // Checkpoint compression level
}
```

### Advanced Configuration

While not exposed in the UI, the system supports:
- Custom exclusion patterns
- Checkpoint retention policies
- Performance tuning parameters
- Debug logging levels

## Error Handling and Recovery

### Graceful Degradation

When checkpoints fail:
1. System continues operating without checkpoints
2. User is notified of the limitation
3. Alternative backup strategies may be suggested
4. Settings can be used to re-enable when issues are resolved

### Common Failure Scenarios

- **Disk Space**: Insufficient storage for checkpoint repository
- **Permissions**: File system access restrictions
- **Git Issues**: Corrupted git repositories or git unavailable
- **Workspace Changes**: Workspace moved or deleted during operation

### Recovery Procedures

- **Automatic Retry**: Transient failures trigger automatic retry
- **Manual Recovery**: Users can manually reset checkpoint system
- **Alternative Storage**: Fallback to different storage locations
- **Support Diagnostics**: Detailed logging for troubleshooting

## Future Enhancements

### Planned Features

1. **Selective Checkpointing**: Choose which files to include in checkpoints
2. **Checkpoint Annotations**: Add user notes to checkpoints
3. **Merge Capabilities**: Merge changes from different checkpoints
4. **Cloud Backup**: Optional cloud storage for checkpoints
5. **Collaborative Checkpoints**: Share checkpoints between team members

### Performance Improvements

1. **Compression**: Compress checkpoint data to save space
2. **Deduplication**: Remove duplicate content across checkpoints
3. **Streaming**: Stream large checkpoint operations for better UI responsiveness
4. **Parallel Processing**: Parallelize git operations where safe

### Enhanced UI

1. **Visual Diff**: Rich diff viewing with syntax highlighting
2. **Checkpoint Browser**: Navigate through checkpoint history
3. **Bulk Operations**: Select and manage multiple checkpoints
4. **Search**: Find specific checkpoints by content or metadata

## Conclusion

Thea-Code's settings storage and rollback mechanisms provide a robust foundation for safe AI-assisted development. The multi-layered storage system ensures that user preferences and sensitive data are properly managed, while the git-based checkpoint system offers comprehensive protection against unwanted changes.

Key strengths of the system:

1. **Type Safety**: Comprehensive TypeScript types and Zod validation
2. **Performance**: Efficient caching and incremental operations
3. **Reliability**: Atomic operations and graceful error handling
4. **Security**: Encrypted storage for sensitive data
5. **User Control**: Comprehensive configuration options
6. **Integration**: Seamless integration with VS Code's native storage APIs

This architecture enables users to confidently use AI assistance knowing that they can always rollback to a previous state if something goes wrong, while maintaining fast and reliable access to their settings and preferences.
