# Model Context Protocol (MCP) Documentation

**Date:** 2025-05-05

## Overview

This directory contains comprehensive documentation for the Model Context Protocol (MCP) implementation in Thea Code. The MCP provides a standardized way for AI models to interact with external tools, resources, and prompts.

## Document Structure

The documentation is organized into several documents, each focusing on a specific aspect of the MCP implementation:

1. **[MCP Comprehensive Guide](./mcp_comprehensive_guide.md)**: A complete technical overview of the MCP protocol, its implementation in Thea Code, and integration with various components.

2. **[SSE Transport Implementation Plan](./sse_transport_implementation_plan.md)**: Detailed plan for switching from StdioTransport to SSETransport, including code changes, testing strategy, and migration approach.

3. **[OpenAI Function Format Integration](./openai_function_format_integration.md)**: Guide for integrating MCP tools with OpenAI-compatible models using the function calling format.

4. **[MCP Integration Implementation](./mcp_integration_implementation.md)**: Detailed guide for implementing MCP integration in provider handlers.

5. **[Ollama-OpenAI-MCP Integration](./ollama_openai_mcp_integration.md)**: Architectural overview of how the Ollama handler integrates with the OpenAI handler and MCP system.

## Key Components

The MCP implementation in Thea Code consists of several key components:

- **EmbeddedMcpServer**: A server implementation that runs in the same process as the client
- **McpToolRegistry**: A registry of tools that can be called by the server
- **UnifiedMcpToolSystem**: A system that manages tools from multiple sources
- **McpIntegration**: A class that integrates MCP with the rest of the system
- **McpConverters**: A class that converts between different tool formats
- **McpToolRouter**: A class that routes tool use requests to the appropriate handler

## Integration Points

The MCP system integrates with several other components in Thea Code:

- **Provider Handlers**: The provider handlers use the MCP system to process tool use requests from models
- **OpenAI-Compatible Models**: Models like Ollama can use the function calling format to interact with MCP tools
- **Tool Implementations**: The actual implementations of tools that are registered with the MCP system

## Implementation Status

The MCP implementation is currently in development, with the following status:

- **Core Components**: Implemented and tested
- **SSE Transport**: Planned for implementation
- **OpenAI Function Format Integration**: Planned for implementation
- **Provider Handler Integration**: Partially implemented

## Next Steps

The following steps are planned for the MCP implementation:

1. Implement the SSE transport to replace the StdioTransport
2. Integrate the OpenAI function format with the MCP system
3. Update all provider handlers to use the MCP system
4. Add comprehensive testing for all components
5. Document the API for tool developers

## Contributing

When contributing to the MCP implementation, please follow these guidelines:

1. **Maintain Backward Compatibility**: Ensure that changes don't break existing functionality
2. **Add Tests**: Add tests for all new functionality
3. **Update Documentation**: Update the documentation to reflect changes
4. **Follow Coding Standards**: Follow the project's coding standards
5. **Consider Performance**: Ensure that changes don't negatively impact performance

## References

- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/spec)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)