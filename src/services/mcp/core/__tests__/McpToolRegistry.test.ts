// npx jest src/services/mcp/core/__tests__/McpToolRegistry.test.ts

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpToolRegistry } from "../McpToolRegistry";
import { ToolDefinition, ToolCallResult } from "../../types/McpProviderTypes";

describe("McpToolRegistry", () => {
  // Reset the singleton instance before each test
  beforeEach(() => {
    // Access private static instance property using type assertion
    (McpToolRegistry as any).instance = undefined;
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance when getInstance is called multiple times", () => {
      const instance1 = McpToolRegistry.getInstance();
      const instance2 = McpToolRegistry.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe("Tool Registration", () => {
    it("should register a tool successfully", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockTool("test-tool");
      
      registry.registerTool(mockTool);
      
      expect(registry.hasTool("test-tool")).toBe(true);
      expect(registry.getTool("test-tool")).toBe(mockTool);
    });

    it("should emit an event when a tool is registered", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockTool("event-test-tool");
      
      // Set up event listener
      const eventHandler = jest.fn();
      registry.on("tool-registered", eventHandler);
      
      registry.registerTool(mockTool);
      
      expect(eventHandler).toHaveBeenCalledWith("event-test-tool");
    });

    it("should override an existing tool with the same name", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool1 = createMockTool("duplicate-tool", "Description 1");
      const mockTool2 = createMockTool("duplicate-tool", "Description 2");
      
      registry.registerTool(mockTool1);
      registry.registerTool(mockTool2);
      
      const retrievedTool = registry.getTool("duplicate-tool");
      expect(retrievedTool).toBe(mockTool2);
      expect(retrievedTool?.description).toBe("Description 2");
    });
  });

  describe("Tool Retrieval", () => {
    it("should return undefined when getting a non-existent tool", () => {
      const registry = McpToolRegistry.getInstance();
      
      const tool = registry.getTool("non-existent-tool");
      
      expect(tool).toBeUndefined();
    });

    it("should retrieve all registered tools", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool1 = createMockTool("tool1");
      const mockTool2 = createMockTool("tool2");
      
      registry.registerTool(mockTool1);
      registry.registerTool(mockTool2);
      
      const allTools = registry.getAllTools();
      
      expect(allTools.size).toBe(2);
      expect(allTools.get("tool1")).toBe(mockTool1);
      expect(allTools.get("tool2")).toBe(mockTool2);
    });

    it("should return a copy of the tools map, not the original", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockTool("tool1");
      
      registry.registerTool(mockTool);
      
      const allTools = registry.getAllTools();
      
      // Modify the returned map
      allTools.delete("tool1");
      
      // Original registry should still have the tool
      expect(registry.hasTool("tool1")).toBe(true);
    });
  });

  describe("Tool Unregistration", () => {
    it("should unregister a tool successfully", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockTool("tool-to-remove");
      
      registry.registerTool(mockTool);
      expect(registry.hasTool("tool-to-remove")).toBe(true);
      
      const result = registry.unregisterTool("tool-to-remove");
      
      expect(result).toBe(true);
      expect(registry.hasTool("tool-to-remove")).toBe(false);
    });

    it("should return false when trying to unregister a non-existent tool", () => {
      const registry = McpToolRegistry.getInstance();
      
      const result = registry.unregisterTool("non-existent-tool");
      
      expect(result).toBe(false);
    });

    it("should emit an event when a tool is unregistered", () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockTool("event-unregister-tool");
      
      registry.registerTool(mockTool);
      
      // Set up event listener
      const eventHandler = jest.fn();
      registry.on("tool-unregistered", eventHandler);
      
      registry.unregisterTool("event-unregister-tool");
      
      expect(eventHandler).toHaveBeenCalledWith("event-unregister-tool");
    });

    it("should not emit an event when trying to unregister a non-existent tool", () => {
      const registry = McpToolRegistry.getInstance();
      
      // Set up event listener
      const eventHandler = jest.fn();
      registry.on("tool-unregistered", eventHandler);
      
      registry.unregisterTool("non-existent-tool");
      
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe("Tool Execution", () => {
    it("should execute a registered tool successfully", async () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockTool("executable-tool");
      
      registry.registerTool(mockTool);
      
      const result = await registry.executeTool("executable-tool", { param: "value" });
      
      expect(result).toEqual({
        content: [{ type: "text", text: "Success" }]
      });
      expect(mockTool.handler).toHaveBeenCalledWith({ param: "value" });
    });

    it("should throw an error when executing a non-existent tool", async () => {
      const registry = McpToolRegistry.getInstance();
      
      await expect(registry.executeTool("non-existent-tool"))
        .rejects
        .toThrow("Tool 'non-existent-tool' not found");
    });

    it("should propagate errors from tool handlers", async () => {
      const registry = McpToolRegistry.getInstance();
      const mockTool = createMockToolWithError("error-tool", "Test error");
      
      registry.registerTool(mockTool);
      
      await expect(registry.executeTool("error-tool"))
        .rejects
        .toThrow("Error executing tool 'error-tool': Test error");
    });
  });
});

// Helper function to create a mock tool definition
function createMockTool(name: string, description: string = "Test tool"): ToolDefinition {
  const mockHandler = jest.fn((_args: Record<string, unknown>) => {
    return Promise.resolve({
      content: [{ type: "text", text: "Success" }]
    } as ToolCallResult);
  });
  
  return {
    name,
    description,
    paramSchema: {
      type: "object",
      properties: {
        param: { type: "string" }
      }
    },
    handler: mockHandler
  };
}

// Helper function to create a mock tool that throws an error
function createMockToolWithError(name: string, errorMessage: string): ToolDefinition {
  const mockHandler = jest.fn((_args: Record<string, unknown>) => {
    return Promise.reject(new Error(errorMessage));
  });
  
  return {
    name,
    description: "Error tool",
    handler: mockHandler
  };
}