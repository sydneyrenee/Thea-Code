import { EventEmitter } from "events"; // Import EventEmitter

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

// Mock the McpToolExecutor

// Import EventEmitter outside the factory

// Create a mock object that includes the necessary methods
// Create a mock class that extends EventEmitter and includes the mocked methods


jest.mock("../McpToolExecutor", () => {
  // Create a mock object with all necessary methods
  const mockExecutor = {
    initialize: jest.fn(async () => {}),
    shutdown: jest.fn(async () => {}),
    executeToolFromNeutralFormat: jest.fn(async (request: any) => {
      if (request.error) {
        const error = new Error(request.error);
        error.name = request.errorType || 'Error';
        throw error;
      }
      return {
        type: 'tool_result',
        tool_use_id: request.id || 'test-id',
        content: [{ type: 'text', text: 'Success' }],
        status: 'success'
      };
    }),
    // Explicitly mock EventEmitter methods that return 'this'
    on: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    removeAllListeners: jest.fn().mockReturnThis(),
    setMaxListeners: jest.fn(), // Mock setMaxListeners as well
  };

  return {
    McpToolExecutor: {
      getInstance: jest.fn(() => mockExecutor as any) // Use any to bypass complex type issues
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
  // Reset the singleton instance and explicitly create it after mock setup
  beforeEach(async () => {
    // Access private static instance property using type assertion
    (McpToolRouter as any).instance = undefined;
    
    // Reset all mocks
    jest.clearAllMocks();

    // Clean up the mock executor
    const mockExecutor = McpToolExecutor.getInstance();
    mockExecutor.removeAllListeners();
    
    // Initialize the router and wait for event handlers to be set up
    const router = McpToolRouter.getInstance();
    await new Promise(resolve => setTimeout(resolve, 0));

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
    
    // Explicitly create the McpToolRouter instance AFTER mock setup
    McpToolRouter.getInstance();
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
    
    it("should update the SSE config when provided in getInstance", async () => {
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
      
      it("should detect neutral format from string content", async () => {
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
        
        // Create a request that will trigger an error
        const invalidRequest = {
          format: "invalid-format" as ToolUseFormat,
          content: {
            type: "tool_use",
            id: "test-error",
            name: "test_tool",
            error: "Unsupported format: invalid-format",
            errorType: "FormatError"
          }
        };

        const result = await router.routeToolUse(invalidRequest);
        
        expect(result).toEqual({
          format: "invalid-format",
          content: expect.objectContaining({
            type: "tool_result",
            status: "error",
            error: {
              message: "Unsupported format: invalid-format"
            }
          })
        });
      });
    });
    
    describe("Error Handling", () => {
      beforeEach(() => {
        // Override the default success XML template
        (McpConverters.mcpToXml as jest.Mock).mockImplementation((result: any) =>
          `<tool_result tool_use_id="${result.tool_use_id}" status="${result.status}">${
            result.error ? result.error.message : "Success"
          }</tool_result>`
        );
      });

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
      it("should forward tool-registered events from the MCP tool executor", async () => {
        const router = McpToolRouter.getInstance();
        const eventHandler = jest.fn();
        const mockExecutor = McpToolExecutor.getInstance();

        // Register the event handler and wait for next tick to ensure registration is complete
        router.on("tool-registered", eventHandler);
        await new Promise(resolve => setTimeout(resolve, 0));

        // Emit the event
        mockExecutor.emit("tool-registered", "test-tool");
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(eventHandler).toHaveBeenCalledWith("test-tool");
      });
      
      it("should forward tool-unregistered events from the MCP tool executor", async () => {
        const router = McpToolRouter.getInstance();
        const eventHandler = jest.fn();
        const mockExecutor = McpToolExecutor.getInstance();

        // Register the event handler and wait for next tick
        router.on("tool-unregistered", eventHandler);
        await new Promise(resolve => setTimeout(resolve, 0));

        // Emit the event
        mockExecutor.emit("tool-unregistered", "test-tool");
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(eventHandler).toHaveBeenCalledWith("test-tool");
      });
      
      it("should forward started events from the MCP tool executor", async () => {
        const router = McpToolRouter.getInstance();
        const eventHandler = jest.fn();
        const mockExecutor = McpToolExecutor.getInstance();

        // Register the event handler and wait for next tick
        router.on("started", eventHandler);
        await new Promise(resolve => setTimeout(resolve, 0));

        // Emit the event
        const info = { url: "http://localhost:3000" };
        mockExecutor.emit("started", info);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(eventHandler).toHaveBeenCalledWith(info);
      });
      
      it("should forward stopped events from the MCP tool executor", async () => {
        const router = McpToolRouter.getInstance();
        const eventHandler = jest.fn();
        const mockExecutor = McpToolExecutor.getInstance();

        // Register the event handler and wait for next tick
        router.on("stopped", eventHandler);
        await new Promise(resolve => setTimeout(resolve, 0));

        // Emit the event
        mockExecutor.emit("stopped");
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(eventHandler).toHaveBeenCalled();
      });
});
});