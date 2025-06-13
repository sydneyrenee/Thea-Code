# Model Context Protocol (MCP) Documentation

**Date:** 2025-06-11  
**Status:** ✅ FULLY IMPLEMENTED

## Overview

This directory contains documentation for the completed Model Context Protocol (MCP) implementation in Thea Code. The MCP provides a unified system for AI models to interact with tools across all providers.

## ✅ Implementation Status: COMPLETE

The MCP system has been fully implemented and integrated:

- ✅ All 16 active providers use unified MCP integration through BaseProvider
- ✅ Support for XML, JSON, and OpenAI function call formats
- ✅ Embedded MCP server with SSE and Stdio transports
- ✅ Comprehensive tool registry and execution system
- ✅ Automatic tool discovery and format conversion
- ✅ Full test coverage and documentation

## Current Documentation

### Core Documentation

1. **[MCP Comprehensive Guide](./mcp_comprehensive_guide.md)** - Complete implementation guide with practical examples
2. **[MCP Component Guide](../../MCP_COMPONENT_GUIDE.md)** - Developer guide for working with MCP components
3. **[Migration Guide](../../MIGRATION_GUIDE.md)** - Guide for developers transitioning to the new architecture

### Architecture Documentation

4. **[Unified Architecture](../../api_handlers/unified_architecture.md)** - Overall system architecture with MCP integration
5. **[Provider Handler Architecture](../../api_handlers/provider_handler_architecture.md)** - Provider-specific architecture details

### Specialized Integration Guides

6. **[Ollama-OpenAI-MCP Integration](./ollama_openai_mcp_integration.md)** - How Ollama leverages OpenAI handler for tool use
7. **[OpenAI Function Format Integration](./openai_function_format_integration.md)** - Function calling format support
8. **[Provider MCP Integration](./provider_mcp_integration.md)** - Provider integration patterns

## Key Features Implemented

### Unified Tool System

- **Automatic Registration**: All providers inherit tool support from BaseProvider
- **Format Flexibility**: Support for XML (`<tool_name>`), JSON (`{"type": "tool_use"}`), and OpenAI function calls
- **Transparent Execution**: Format conversion and routing handled automatically

### Protocol Support

- **Multi-Format Detection**: Automatic detection of tool use format
- **Protocol Inheritance**: Providers can extend protocol handlers (e.g., Ollama extends OpenAI)
- **Consistent Interface**: All providers use `NeutralConversationHistory`

### Developer Experience

- **Simple Integration**: Extend BaseProvider and get MCP integration automatically
- **Easy Tool Addition**: Register custom tools via `registerTool()` method
- **Comprehensive Testing**: Full test suite including e2e and performance tests

## Quick Start for Developers

### Using MCP in Providers

```typescript
// All providers automatically have MCP integration
export class MyProvider extends BaseProvider {
	// Tools are automatically available - no additional setup needed
}
```

### Adding Custom Tools

```typescript
protected registerTools(): void {
  super.registerTools(); // Get standard tools

  this.mcpIntegration.registerTool({
    name: 'my_custom_tool',
    description: 'Does something useful',
    paramSchema: { /* JSON Schema */ }
  });
}
```

### Tool Usage (Automatic)

Tools work automatically across all formats:

- **XML**: `<read_file><path>example.ts</path></read_file>`
- **JSON**: `{"type": "tool_use", "name": "read_file", "input": {"path": "example.ts"}}`
- **OpenAI**: Function calls in OpenAI's schema

## Archived Documentation

Historical planning documents have been moved to [archive/](./archive/) for reference but are no longer needed for current development.

## References

- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/spec)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)
