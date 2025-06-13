# MCP Component Structure Developer Guide

**Date:** 2025-06-11  
**Audience:** Developers working with the MCP system internals

## Overview

This guide provides an overview of the MCP (Model Context Protocol) component structure in `src/services/mcp/` and how to work with each component.

## Directory Structure

```
src/services/mcp/
├── core/                    # Core MCP functionality
│   ├── McpConverters.ts     # Format conversion utilities
│   ├── McpToolExecutor.ts   # Tool execution engine
│   ├── McpToolRegistry.ts   # Tool registration and management
│   └── McpToolRouter.ts     # Request routing and format detection
├── integration/             # Integration layer
│   ├── McpIntegration.ts    # Main facade/singleton
│   ├── ProviderIntegration.ts # Provider-specific integration
│   └── WebviewIntegration.ts  # Webview integration utilities
├── management/              # Server and hub management
│   └── McpHub.ts           # MCP server management
├── providers/               # MCP provider implementations
│   ├── EmbeddedMcpProvider.ts # Local embedded provider
│   └── MockMcpProvider.ts     # Testing mock provider
├── transport/               # Transport layer
│   ├── SseTransport.ts      # Server-Sent Events transport
│   └── StdioTransport.ts    # Standard I/O transport
├── types/                   # Type definitions
│   ├── McpProviderTypes.ts  # Provider-related types
│   ├── McpToolTypes.ts      # Tool-related types
│   └── McpTransportTypes.ts # Transport-related types
└── __tests__/              # Comprehensive test suite
    ├── e2e/                # End-to-end tests
    ├── performance/        # Performance tests
    └── *.test.ts           # Unit tests
```

## Core Components

### McpIntegration (Integration Facade)

**File:** `src/services/mcp/integration/McpIntegration.ts`

The main entry point for all MCP functionality. Provides a singleton interface that coordinates all MCP components.

```typescript
// Primary usage
const mcpIntegration = McpIntegration.getInstance()

// Tool registration
mcpIntegration.registerTool({
	name: "custom_tool",
	description: "My custom tool",
	paramSchema: {
		/* JSON Schema */
	},
})

// Tool execution
const result = await mcpIntegration.routeToolUse({
	format: ToolUseFormat.XML,
	content: "<tool_name><param>value</param></tool_name>",
})

// Server management
await mcpIntegration.initialize()
const serverUrl = mcpIntegration.getServerUrl()
```

**Key Responsibilities:**

- Provides singleton access to MCP system
- Coordinates tool registration and execution
- Manages MCP server lifecycle
- Forwards events from internal components

### McpToolRouter (Core Routing)

**File:** `src/services/mcp/core/McpToolRouter.ts`

Handles format detection and routing of tool use requests to the appropriate execution engine.

```typescript
// Automatic format detection and routing
const result = await mcpToolRouter.routeToolUse({
	format: ToolUseFormat.AUTO_DETECT, // Detects XML, JSON, or OpenAI format
	content: toolUseContent,
})
```

**Key Responsibilities:**

- Detects tool use format (XML/JSON/OpenAI)
- Routes requests to McpToolExecutor
- Provides consistent interface regardless of input format
- Handles errors and validation

### McpToolExecutor (Execution Engine)

**File:** `src/services/mcp/core/McpToolExecutor.ts`

The core execution engine that manages the MCP server and executes tools.

```typescript
// Direct tool execution (usually called via router)
const executor = McpToolExecutor.getInstance()
const result = await executor.executeTool("read_file", { path: "example.ts" })
```

**Key Responsibilities:**

- Manages embedded MCP server lifecycle
- Executes tool calls via MCP protocol
- Handles tool results and errors
- Provides server URL for external connections

### McpToolRegistry (Tool Management)

**File:** `src/services/mcp/core/McpToolRegistry.ts`

Central registry for all available tools in the system.

```typescript
const registry = McpToolRegistry.getInstance()

// Register a tool
registry.registerTool({
	name: "analyze_code",
	description: "Analyze code for patterns",
	paramSchema: {
		type: "object",
		properties: {
			file_path: { type: "string" },
		},
		required: ["file_path"],
	},
})

// Get registered tools
const tools = registry.getTools()
const tool = registry.getTool("analyze_code")
```

**Key Responsibilities:**

- Stores tool definitions and schemas
- Validates tool registrations
- Provides tool lookup functionality
- Manages tool lifecycle

### McpConverters (Format Conversion)

**File:** `src/services/mcp/core/McpConverters.ts`

Utility functions for converting between different tool use formats and MCP protocol.

```typescript
// Convert XML to MCP format
const mcpRequest = McpConverters.xmlToMcp("<read_file><path>example.ts</path></read_file>")

// Convert JSON to MCP format
const jsonRequest = { type: "tool_use", name: "read_file", input: { path: "example.ts" } }
const mcpRequest2 = McpConverters.jsonToMcp(jsonRequest)

// Convert OpenAI function call to MCP format
const functionCall = { name: "read_file", arguments: '{"path":"example.ts"}' }
const mcpRequest3 = McpConverters.openAiToMcp(functionCall)
```

**Key Responsibilities:**

- Converts between XML, JSON, and OpenAI formats
- Transforms to/from MCP protocol format
- Handles format validation and error cases
- Provides consistent conversion interface

## Transport Layer

### SseTransport (HTTP/SSE Transport)

**File:** `src/services/mcp/transport/SseTransport.ts`

Implements Server-Sent Events transport for MCP communication.

```typescript
// Configure SSE transport
const config: SseTransportConfig = {
	host: "localhost",
	port: 3000,
	path: "/mcp",
}

const transport = new SseTransport(config)
await transport.start()
```

**Key Features:**

- HTTP-based transport using Server-Sent Events
- Configurable host, port, and path
- Used for web-based MCP clients
- Supports real-time bidirectional communication

### StdioTransport (Process Transport)

**File:** `src/services/mcp/transport/StdioTransport.ts`

Implements standard input/output transport for process-based MCP communication.

```typescript
const transport = new StdioTransport()
await transport.start()
```

**Key Features:**

- Process-based communication via stdin/stdout
- Used for embedded MCP servers
- Lower overhead than HTTP transport
- Suitable for internal tool execution

## Type Definitions

### ToolDefinition Interface

**File:** `src/services/mcp/types/McpProviderTypes.ts`

```typescript
interface ToolDefinition {
	name: string
	description: string
	paramSchema: {
		type: "object"
		properties: Record<string, any>
		required?: string[]
	}
}
```

### ToolUseRequest Interface

**File:** `src/services/mcp/types/McpToolTypes.ts`

```typescript
interface ToolUseRequest {
	format: ToolUseFormat
	content: string | object
}

enum ToolUseFormat {
	XML = "xml",
	JSON = "json",
	OPENAI = "openai",
	AUTO_DETECT = "auto",
}
```

### SseTransportConfig Interface

**File:** `src/services/mcp/types/McpTransportTypes.ts`

```typescript
interface SseTransportConfig {
	host?: string
	port?: number
	path?: string
	cors?: boolean
}
```

## Development Patterns

### 1. Adding a New Tool

```typescript
// 1. Define tool in your provider's registerTools method
protected registerTools(): void {
  super.registerTools(); // Get standard tools

  this.mcpIntegration.registerTool({
    name: 'my_new_tool',
    description: 'Description of what the tool does',
    paramSchema: {
      type: 'object',
      properties: {
        required_param: { type: 'string', description: 'Required parameter' },
        optional_param: { type: 'number', description: 'Optional parameter' }
      },
      required: ['required_param']
    }
  });
}
```

### 2. Custom Format Support

```typescript
// Extend McpConverters for custom formats
class CustomConverters extends McpConverters {
	static customFormatToMcp(customInput: CustomFormat): McpToolRequest {
		return {
			method: "tools/call",
			params: {
				name: customInput.toolName,
				arguments: customInput.parameters,
			},
		}
	}
}
```

### 3. Testing MCP Components

```typescript
// Test tool registration
test("should register custom tool", () => {
	const registry = McpToolRegistry.getInstance()
	registry.registerTool(customTool)

	expect(registry.getTool("custom_tool")).toBeDefined()
})

// Test tool execution
test("should execute tool via integration", async () => {
	const integration = McpIntegration.getInstance()
	const result = await integration.routeToolUse({
		format: ToolUseFormat.XML,
		content: "<read_file><path>test.ts</path></read_file>",
	})

	expect(result.success).toBe(true)
})
```

## Configuration

### Environment Variables

```bash
# MCP Server Configuration
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=3000
MCP_SERVER_PATH=/mcp

# Transport Selection
MCP_TRANSPORT=sse  # or 'stdio'

# Debug Settings
MCP_DEBUG=true
MCP_LOG_LEVEL=info
```

### Runtime Configuration

```typescript
// Configure MCP integration
const config: SseTransportConfig = {
	host: process.env.MCP_SERVER_HOST || "localhost",
	port: parseInt(process.env.MCP_SERVER_PORT || "3000"),
	path: process.env.MCP_SERVER_PATH || "/mcp",
}

const mcpIntegration = McpIntegration.getInstance(config)
```

## Best Practices

1. **Use the Integration Facade**: Always use `McpIntegration` rather than calling core components directly
2. **Register Tools Early**: Register tools in provider constructors via `registerTools()`
3. **Handle All Formats**: Support XML, JSON, and OpenAI formats for maximum compatibility
4. **Test Tool Integration**: Include MCP integration tests for any new providers
5. **Follow Type Definitions**: Use provided TypeScript interfaces for type safety
6. **Error Handling**: Always handle tool execution errors gracefully
7. **Performance**: Be mindful of tool execution performance, especially for frequently called tools

## Debugging

### Enable Debug Logging

```typescript
// Set environment variable
process.env.MCP_DEBUG = "true"

// Or configure programmatically
const integration = McpIntegration.getInstance()
integration.setDebugMode(true)
```

### Common Issues

- **Tool Not Found**: Check tool registration in `registerTools()`
- **Format Detection Failed**: Verify input format matches expected patterns
- **Server Not Starting**: Check port availability and configuration
- **Transport Errors**: Verify transport configuration and network connectivity

For more information, see the test files in `src/services/mcp/__tests__/` for comprehensive examples of usage patterns.
