// npx jest src/services/mcp/core/__tests__/McpToolRouter.test.ts

import { describe, expect, it, beforeEach, jest, afterEach } from "@jest/globals";
import { McpToolRouter } from "../McpToolRouter";
import { McpToolExecutor } from "../McpToolExecutor";
import { McpConverters } from "../McpConverters";
import { 
  NeutralToolUseRequest, 
  NeutralToolResult, 
  ToolUseFormat, 
  ToolUseRequestWithFormat, 
  ToolResultWithFormat 
} from "../../types/McpToolTypes";
import { SseTransportConfig } from "../../types/McpTransportTypes";
import { EventEmitter } from "events";

// Mock the McpToolExecutor
jest.mock("../McpToolExecutor", () => {
  const mockExecutor = {
    getInstance: jest.fn(),
    initialize: jest.fn().mockImplementation(() => Promise.resolve()),
    shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
    executeToolFromNeutralFormat: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn()
  };
  
  return {
    McpToolExecutor: {
      getInstance: jest.fn().mockReturnValue(mockExecutor)
    }
  };
});

// Mock the McpConverters
jest.mock("../McpConverters", () => {
  return {
    McpConverters: {
      xmlToMcp: jest.fn(),
      jsonToMcp: jest.fn(),
      openAiToMcp: jest.fn(),
      mcpToXml: jest.fn(),
      mcpToJson: jest.fn(),
      mcpToOpenAi: jest.fn()
    }
  };
});

describe("McpToolRouter", () => {
  // Reset the singleton instance before each test
  beforeEach(() => {
    // Access private static instance property using type assertion
    (McpToolRouter as any).instance = undefined;
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up default mock implementations
    const mockExecutor = McpToolExecutor.getInstance();
    
    // Make the mock executor an event emitter
    (mockExecutor as any).emit = jest.fn();
    
    // Set up default mock implementations for McpConverters
    (McpConverters.xmlToMcp as jest.Mock).mockImplementation((xml) => ({
      type: "tool_use",
      id: "xml-123",
      name: "read_file",
      input: { path: "test.txt" }
    }));
    
    (McpConverters.jsonToMcp as jest.Mock).mockImplementation((json) => ({
      type: "tool_use",
      id: "json-123",
      name: "execute_command",
      input: { command: "ls -la" }
    }));
    
    (McpConverters.openAiToMcp as jest.Mock).mockImplementation((openai) => ({
      type: "tool_use",
      id: "openai-123",
      name: "search_files",
      input: { path: ".", regex: "test" }
    }));
    
    (McpConverters.mcpToXml as jest.Mock).mockImplementation((result: any) =>
      `<tool_result tool_use_id="${result.tool_use_id}" status="${result.status}">Success</tool_result>`
    );
    
    (McpConverters.mcpToJson as jest.Mock).mockImplementation((result) => 
      JSON.stringify(result)
    );
    
    (McpConverters.mcpToOpenAi as jest.Mock).mockImplementation((result: any) => ({
      role: "tool",
      tool_call_id: result.tool_use_id,
      content: "Success"
    }));
    
    // Set up default mock implementation for executeToolFromNeutralFormat
    (mockExecutor.executeToolFromNeutralFormat as jest.Mock).mockImplementation(async (request: any) => ({
      type: "tool_result",
      tool_use_id: request.id,
      content: [{ type: "text", text: "Success" }],
      status: "success"
    }));
  });
  
  afterEach(() => {
    // Clean up any event listeners
    const instance = McpToolRouter.getInstance();
    instance.removeAllListeners();
  });
  
  describe("Singleton Pattern", () => {
    it("should return the same instance when getInstance is called multiple times", () => {
      const instance1 = McpToolRouter.getInstance();
      const instance2 = McpToolRouter.getInstance();
      
      expect(instance1).toBe(instance2);
    });
    
    it("should update the SSE config when provided in getInstance", () => {
      const instance1 = McpToolRouter.getInstance();
      const config: SseTransportConfig = {
        port: 3001,
        hostname: "localhost",
        allowExternalConnections: true
      };
      
      const instance2 = McpToolRouter.getInstance(config);
      
      expect(instance1).toBe(instance2);
      // We can't directly test the private sseConfig property, but we can verify
      // that the same instance is returned
    });
  });
  
  describe("Initialization and Shutdown", () => {
    it("should initialize the MCP tool executor when initialize is called", async () => {
      const router = McpToolRouter.getInstance();
      
      await router.initialize();
      
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.initialize).toHaveBeenCalled();
    });
    
    it("should shutdown the MCP tool executor when shutdown is called", async () => {
      const router = McpToolRouter.getInstance();
      
      await router.shutdown();
      
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.shutdown).toHaveBeenCalled();
    });
  });
  
  describe("Format Detection", () => {
    it("should detect XML format from string content", () => {
      const router = McpToolRouter.getInstance();
      const content = "<read_file><path>test.txt</path></read_file>";
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.XML);
    });
    
    it("should detect JSON format from string content", () => {
      const router = McpToolRouter.getInstance();
      const content = JSON.stringify({
        name: "execute_command",
        input: { command: "ls -la" }
      });
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.JSON);
    });
    
    it("should detect OpenAI format from string content", () => {
      const router = McpToolRouter.getInstance();
      const content = JSON.stringify({
        function_call: {
          name: "execute_command",
          arguments: JSON.stringify({ command: "ls -la" })
        }
      });
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.OPENAI);
    });
    
    it("should detect neutral format from string content", () => {
      const router = McpToolRouter.getInstance();
      const content = JSON.stringify({
        type: "tool_use",
        id: "test-123",
        name: "execute_command",
        input: { command: "ls -la" }
      });
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.NEUTRAL);
    });
    
    it("should detect OpenAI format from object content", () => {
      const router = McpToolRouter.getInstance();
      const content = {
        function_call: {
          name: "execute_command",
          arguments: JSON.stringify({ command: "ls -la" })
        }
      };
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.OPENAI);
    });
    
    it("should detect neutral format from object content", () => {
      const router = McpToolRouter.getInstance();
      const content = {
        type: "tool_use",
        id: "test-123",
        name: "execute_command",
        input: { command: "ls -la" }
      };
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.NEUTRAL);
    });
    
    it("should default to JSON format for object content that doesn't match other formats", () => {
      const router = McpToolRouter.getInstance();
      const content = {
        name: "execute_command",
        input: { command: "ls -la" }
      };
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.JSON);
    });
    
    it("should default to XML format for string content that can't be parsed as JSON", () => {
      const router = McpToolRouter.getInstance();
      const content = "This is not valid JSON or XML";
      
      const format = router.detectFormat(content);
      
      expect(format).toBe(ToolUseFormat.XML);
    });
  });
  
  describe("Tool Use Routing", () => {
    it("should route XML format tool use requests", async () => {
      const router = McpToolRouter.getInstance();
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.XML,
        content: "<read_file><path>test.txt</path></read_file>"
      };
      
      const result = await router.routeToolUse(request);
      
      // Verify conversion to MCP format
      expect(McpConverters.xmlToMcp).toHaveBeenCalledWith(request.content);
      
      // Verify execution
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.executeToolFromNeutralFormat).toHaveBeenCalled();
      
      // Verify conversion back to XML
      expect(McpConverters.mcpToXml).toHaveBeenCalled();
      
      // Verify result format
      expect(result.format).toBe(ToolUseFormat.XML);
    });
    
    it("should route JSON format tool use requests", async () => {
      const router = McpToolRouter.getInstance();
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.JSON,
        content: JSON.stringify({
          name: "execute_command",
          input: { command: "ls -la" }
        })
      };
      
      const result = await router.routeToolUse(request);
      
      // Verify conversion to MCP format
      expect(McpConverters.jsonToMcp).toHaveBeenCalledWith(request.content);
      
      // Verify execution
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.executeToolFromNeutralFormat).toHaveBeenCalled();
      
      // Verify conversion back to JSON
      expect(McpConverters.mcpToJson).toHaveBeenCalled();
      
      // Verify result format
      expect(result.format).toBe(ToolUseFormat.JSON);
    });
    
    it("should route OpenAI format tool use requests", async () => {
      const router = McpToolRouter.getInstance();
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.OPENAI,
        content: {
          function_call: {
            name: "search_files",
            arguments: JSON.stringify({ path: ".", regex: "test" })
          }
        }
      };
      
      const result = await router.routeToolUse(request);
      
      // Verify conversion to MCP format
      expect(McpConverters.openAiToMcp).toHaveBeenCalledWith(request.content);
      
      // Verify execution
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.executeToolFromNeutralFormat).toHaveBeenCalled();
      
      // Verify conversion back to OpenAI
      expect(McpConverters.mcpToOpenAi).toHaveBeenCalled();
      
      // Verify result format
      expect(result.format).toBe(ToolUseFormat.OPENAI);
    });
    
    it("should route neutral format tool use requests (string)", async () => {
      const router = McpToolRouter.getInstance();
      const neutralRequest: NeutralToolUseRequest = {
        type: "tool_use",
        id: "neutral-123",
        name: "list_files",
        input: { path: "." }
      };
      
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.NEUTRAL,
        content: JSON.stringify(neutralRequest)
      };
      
      const result = await router.routeToolUse(request);
      
      // Verify execution
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.executeToolFromNeutralFormat).toHaveBeenCalledWith(neutralRequest);
      
      // Verify result format
      expect(result.format).toBe(ToolUseFormat.NEUTRAL);
    });
    
    it("should route neutral format tool use requests (object)", async () => {
      const router = McpToolRouter.getInstance();
      const neutralRequest: NeutralToolUseRequest = {
        type: "tool_use",
        id: "neutral-123",
        name: "list_files",
        input: { path: "." }
      };
      
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.NEUTRAL,
        content: neutralRequest as unknown as Record<string, unknown>
      };
      
      const result = await router.routeToolUse(request);
      
      // Verify execution
      const mockExecutor = McpToolExecutor.getInstance();
      expect(mockExecutor.executeToolFromNeutralFormat).toHaveBeenCalledWith(neutralRequest);
      
      // Verify result format
      expect(result.format).toBe(ToolUseFormat.NEUTRAL);
    });
    
    it("should throw an error for invalid neutral format (missing properties)", async () => {
      const router = McpToolRouter.getInstance();
      const invalidRequest: ToolUseRequestWithFormat = {
        format: ToolUseFormat.NEUTRAL,
        content: {
          // Missing required properties
          type: "tool_use"
        }
      };
      
      await expect(router.routeToolUse(invalidRequest)).resolves.toEqual({
        format: ToolUseFormat.NEUTRAL,
        content: expect.objectContaining({
          type: "tool_result",
          status: "error",
          error: expect.objectContaining({
            message: expect.stringContaining("Invalid tool use request format")
          })
        })
      });
    });
    
    it("should throw an error for unsupported format", async () => {
      const router = McpToolRouter.getInstance();
      const invalidRequest = {
        format: "invalid-format" as ToolUseFormat,
        content: "invalid content"
      };
      
      await expect(router.routeToolUse(invalidRequest)).resolves.toEqual({
        format: "invalid-format",
        content: expect.objectContaining({
          type: "tool_result",
          status: "error",
          error: expect.objectContaining({
            message: expect.stringContaining("Unsupported format")
          })
        })
      });
    });
  });
  
  describe("Error Handling", () => {
    it("should handle conversion errors", async () => {
      const router = McpToolRouter.getInstance();
      
      // Set up mock to throw an error
      (McpConverters.xmlToMcp as jest.Mock).mockImplementationOnce(() => {
        throw new Error("Conversion error");
      });
      
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.XML,
        content: "<invalid>xml</invalid>"
      };
      
      const result = await router.routeToolUse(request);
      
      expect(result.format).toBe(ToolUseFormat.XML);
      expect(result.content).toContain("Conversion error");
    });
    
    it("should handle execution errors", async () => {
      const router = McpToolRouter.getInstance();
      const mockExecutor = McpToolExecutor.getInstance();
      
      // Set up mock to throw an error
      (mockExecutor.executeToolFromNeutralFormat as jest.Mock).mockImplementationOnce(() => {
        throw new Error("Execution error");
      });
      
      const request: ToolUseRequestWithFormat = {
        format: ToolUseFormat.XML,
        content: "<read_file><path>test.txt</path></read_file>"
      };
      
      const result = await router.routeToolUse(request);
      
      expect(result.format).toBe(ToolUseFormat.XML);
      expect(result.content).toContain("Execution error");
    });
  });
  
  describe("Event Forwarding", () => {
    it("should forward tool-registered events from the MCP tool executor", () => {
      const router = McpToolRouter.getInstance();
      const eventHandler = jest.fn();
      
      router.on("tool-registered", eventHandler);
      
      // Get the event handler registered with the executor
      const mockExecutor = McpToolExecutor.getInstance();
      const onCall = (mockExecutor.on as jest.Mock).mock.calls.find(
        call => call[0] === "tool-registered"
      );
      
      if (!onCall) {
        fail("No tool-registered event handler registered");
        return;
      }
      
      // Call the event handler
      const eventCallback = onCall[1] as any;
      eventCallback("test-tool");
      
      expect(eventHandler).toHaveBeenCalledWith("test-tool");
    });
    
    it("should forward tool-unregistered events from the MCP tool executor", () => {
      const router = McpToolRouter.getInstance();
      const eventHandler = jest.fn();
      
      router.on("tool-unregistered", eventHandler);
      
      // Get the event handler registered with the executor
      const mockExecutor = McpToolExecutor.getInstance();
      const onCall = (mockExecutor.on as jest.Mock).mock.calls.find(
        call => call[0] === "tool-unregistered"
      );
      
      if (!onCall) {
        fail("No tool-unregistered event handler registered");
        return;
      }
      
      // Call the event handler
      const eventCallback = onCall[1] as any;
      eventCallback("test-tool");
      
      expect(eventHandler).toHaveBeenCalledWith("test-tool");
    });
    
    it("should forward started events from the MCP tool executor", () => {
      const router = McpToolRouter.getInstance();
      const eventHandler = jest.fn();
      
      router.on("started", eventHandler);
      
      // Get the event handler registered with the executor
      const mockExecutor = McpToolExecutor.getInstance();
      const onCall = (mockExecutor.on as jest.Mock).mock.calls.find(
        call => call[0] === "started"
      );
      
      if (!onCall) {
        fail("No started event handler registered");
        return;
      }
      
      // Call the event handler
      const eventCallback = onCall[1] as any;
      const info = { url: "http://localhost:3000" };
      eventCallback(info);
      
      expect(eventHandler).toHaveBeenCalledWith(info);
    });
    
    it("should forward stopped events from the MCP tool executor", () => {
      const router = McpToolRouter.getInstance();
      const eventHandler = jest.fn();
      
      router.on("stopped", eventHandler);
      
      // Get the event handler registered with the executor
      const mockExecutor = McpToolExecutor.getInstance();
      const onCall = (mockExecutor.on as jest.Mock).mock.calls.find(
        call => call[0] === "stopped"
      );
      
      if (!onCall) {
        fail("No stopped event handler registered");
        return;
      }
      
      // Call the event handler
      const eventCallback = onCall[1] as any;
      eventCallback();
      
      expect(eventHandler).toHaveBeenCalled();
    });
  });
});