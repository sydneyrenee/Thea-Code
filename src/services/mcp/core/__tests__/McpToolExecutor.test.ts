/* eslint-disable */
// npx jest src/services/mcp/core/__tests__/McpToolExecutor.test.ts

import { describe, expect, it, beforeEach, jest, afterEach } from "@jest/globals";
import { McpToolExecutor } from "../McpToolExecutor";
import { McpToolRegistry } from "../McpToolRegistry";
import { NeutralToolUseRequest, NeutralToolResult } from "../../types/McpToolTypes";
import { ToolDefinition, ToolCallResult } from "../../types/McpProviderTypes";
import { SseTransportConfig } from "../../types/McpTransportTypes";
import { EventEmitter } from "events";

// Define interface for the mock EmbeddedMcpProvider
interface MockEmbeddedMcpProviderInstance extends EventEmitter {
  start: jest.Mock;
  stop: jest.Mock;
  registerToolDefinition: jest.Mock;
  unregisterTool: jest.Mock;
  executeTool: jest.Mock;
  getServerUrl: jest.Mock;
}

// Mock the EmbeddedMcpProvider module
jest.mock("../../providers/EmbeddedMcpProvider", () => {
  // Create a mock class that extends EventEmitter
  const MockEmbeddedMcpProvider = jest.fn().mockImplementation(() => {
    const instance = new EventEmitter() as MockEmbeddedMcpProviderInstance;
    
    // Add mock methods
    instance.start = jest.fn().mockImplementation(() => Promise.resolve());
    instance.stop = jest.fn().mockImplementation(() => Promise.resolve());
    instance.registerToolDefinition = jest.fn();
    instance.unregisterTool = jest.fn().mockReturnValue(true);
    instance.executeTool = jest.fn().mockImplementation(async (name, args) => {
      if (name === "error-tool") {
        return {
          content: [{ type: "text", text: "Error executing tool" }],
          isError: true
        };
      }
      
      if (name === "throw-error-tool") {
        throw new Error("Tool execution failed");
      }
      
      return {
        content: [{ type: "text", text: "Success" }]
      };
    });
    instance.getServerUrl = jest.fn().mockReturnValue(new URL("http://localhost:3000"));
    
    return instance;
  });
  
  return {
    EmbeddedMcpProvider: MockEmbeddedMcpProvider
  };
});

// Mock the McpToolRegistry
jest.mock("../McpToolRegistry", () => {
  const mockRegistry = {
    getInstance: jest.fn(),
    registerTool: jest.fn(),
    unregisterTool: jest.fn().mockReturnValue(true),
    getTool: jest.fn(),
    getAllTools: jest.fn(),
    hasTool: jest.fn(),
    executeTool: jest.fn()
  };
  
  return {
    McpToolRegistry: {
      getInstance: jest.fn().mockReturnValue(mockRegistry)
    }
  };
});

describe("McpToolExecutor", () => {
  // Reset the singleton instance before each test
  beforeEach(() => {
    // Access private static instance property using type assertion
    (McpToolExecutor as any).instance = undefined;
    
    // Reset all mocks
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // Clean up any event listeners
    const instance = McpToolExecutor.getInstance();
    instance.removeAllListeners();
  });
  
  describe("Singleton Pattern", () => {
    it("should return the same instance when getInstance is called multiple times", () => {
      const instance1 = McpToolExecutor.getInstance();
      const instance2 = McpToolExecutor.getInstance();
      
      expect(instance1).toBe(instance2);
    });
    
    it("should update the SSE config when provided in getInstance", () => {
      const instance1 = McpToolExecutor.getInstance();
      const config: SseTransportConfig = {
        port: 3001,
        hostname: "localhost",
        allowExternalConnections: true
      };
      
      const instance2 = McpToolExecutor.getInstance(config);
      
      expect(instance1).toBe(instance2);
      // We can't directly test the private sseConfig property, but we can verify
      // that the same instance is returned
    });
  });
  
  describe("Initialization and Shutdown", () => {
    it("should initialize the MCP provider when initialize is called", async () => {
      const executor = McpToolExecutor.getInstance();
      
      await executor.initialize();
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.start).toHaveBeenCalled();
    });
    
    it("should not initialize the MCP provider if already initialized", async () => {
      const executor = McpToolExecutor.getInstance();
      
      await executor.initialize();
      await executor.initialize(); // Call initialize again
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      // start should only be called once
      expect(mockProvider.start).toHaveBeenCalledTimes(1);
    });
    
    it("should shutdown the MCP provider when shutdown is called", async () => {
      const executor = McpToolExecutor.getInstance();
      
      await executor.initialize();
      await executor.shutdown();
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.stop).toHaveBeenCalled();
    });
    
    it("should not shutdown the MCP provider if not initialized", async () => {
      const executor = McpToolExecutor.getInstance();
      
      await executor.shutdown();
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.stop).not.toHaveBeenCalled();
    });
  });
  
  describe("Tool Registration", () => {
    it("should register a tool with both the MCP provider and the tool registry", () => {
      const executor = McpToolExecutor.getInstance();
      const toolDefinition: ToolDefinition = {
        name: "test-tool",
        description: "Test tool",
        handler: async () => ({ content: [] })
      };
      
      executor.registerTool(toolDefinition);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.registerToolDefinition).toHaveBeenCalledWith(toolDefinition);
      expect(McpToolRegistry.getInstance().registerTool).toHaveBeenCalledWith(toolDefinition);
    });
    
    it("should unregister a tool from both the MCP provider and the tool registry", () => {
      const executor = McpToolExecutor.getInstance();
      
      const result = executor.unregisterTool("test-tool");
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.unregisterTool).toHaveBeenCalledWith("test-tool");
      expect(McpToolRegistry.getInstance().unregisterTool).toHaveBeenCalledWith("test-tool");
      expect(result).toBe(true);
    });
  });
  
  describe("Tool Execution", () => {
    it("should execute a tool with valid input in neutral format", async () => {
      const executor = McpToolExecutor.getInstance();
      const request: NeutralToolUseRequest = {
        type: "tool_use",
        id: "test-id",
        name: "test-tool",
        input: { param: "value" }
      };
      
      const result = await executor.executeToolFromNeutralFormat(request);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.executeTool).toHaveBeenCalledWith("test-tool", { param: "value" });
      expect(result).toEqual({
        type: "tool_result",
        tool_use_id: "test-id",
        content: [{ type: "text", text: "Success" }],
        status: "success",
        error: undefined
      });
    });
    
    it("should handle errors when executing a tool", async () => {
      const executor = McpToolExecutor.getInstance();
      const request: NeutralToolUseRequest = {
        type: "tool_use",
        id: "error-id",
        name: "error-tool",
        input: {}
      };
      
      const result = await executor.executeToolFromNeutralFormat(request);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.executeTool).toHaveBeenCalledWith("error-tool", {});
      expect(result).toEqual({
        type: "tool_result",
        tool_use_id: "error-id",
        content: [{ type: "text", text: "Error executing tool" }],
        status: "error",
        error: {
          message: "Error executing tool"
        }
      });
    });
    
    it("should handle exceptions when executing a tool", async () => {
      const executor = McpToolExecutor.getInstance();
      const request: NeutralToolUseRequest = {
        type: "tool_use",
        id: "exception-id",
        name: "throw-error-tool",
        input: {}
      };
      
      const result = await executor.executeToolFromNeutralFormat(request);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(mockProvider.executeTool).toHaveBeenCalledWith("throw-error-tool", {});
      expect(result).toEqual({
        type: "tool_result",
        tool_use_id: "exception-id",
        content: [{
          type: "text",
          text: "Error executing tool 'throw-error-tool': Tool execution failed"
        }],
        status: "error",
        error: {
          message: "Tool execution failed"
        }
      });
    });
  });
  
  describe("Event Handling", () => {
    it("should forward tool-registered events from the MCP provider", () => {
      const executor = McpToolExecutor.getInstance();
      const eventHandler = jest.fn();
      
      executor.on("tool-registered", eventHandler);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      // Emit the event from the provider
      mockProvider.emit("tool-registered", "test-tool");
      
      expect(eventHandler).toHaveBeenCalledWith("test-tool");
    });
    
    it("should forward tool-unregistered events from the MCP provider", () => {
      const executor = McpToolExecutor.getInstance();
      const eventHandler = jest.fn();
      
      executor.on("tool-unregistered", eventHandler);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      // Emit the event from the provider
      mockProvider.emit("tool-unregistered", "test-tool");
      
      expect(eventHandler).toHaveBeenCalledWith("test-tool");
    });
    
    it("should forward started events from the MCP provider", () => {
      const executor = McpToolExecutor.getInstance();
      const eventHandler = jest.fn();
      
      executor.on("started", eventHandler);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      // Emit the event from the provider
      const info = { url: "http://localhost:3000" };
      mockProvider.emit("started", info);
      
      expect(eventHandler).toHaveBeenCalledWith(info);
    });
    
    it("should forward stopped events from the MCP provider", () => {
      const executor = McpToolExecutor.getInstance();
      const eventHandler = jest.fn();
      
      executor.on("stopped", eventHandler);
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      // Emit the event from the provider
      mockProvider.emit("stopped");
      
      expect(eventHandler).toHaveBeenCalled();
    });
  });
  
  describe("Accessors", () => {
    it("should return the tool registry", () => {
      const executor = McpToolExecutor.getInstance();
      const registry = executor.getToolRegistry();
      
      expect(registry).toBe(McpToolRegistry.getInstance());
    });
    
    it("should return the server URL", () => {
      const executor = McpToolExecutor.getInstance();
      const url = executor.getServerUrl();
      
      // Get the mock EmbeddedMcpProvider instance
      const mockProvider = require("../../providers/EmbeddedMcpProvider").EmbeddedMcpProvider.mock.results[0].value;
      
      expect(url).toEqual(mockProvider.getServerUrl());
    });
  });
});