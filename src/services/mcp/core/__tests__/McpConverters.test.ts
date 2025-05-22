// npx jest src/services/mcp/core/__tests__/McpConverters.test.ts

import { describe, expect, it } from "@jest/globals";
import { McpConverters } from "../McpConverters";
import { NeutralToolResult } from "../../types/McpToolTypes";
import { ToolDefinition } from "../../types/McpProviderTypes";

describe("McpConverters", () => {
  describe("XML Format Conversion", () => {
    describe("xmlToMcp", () => {
      it("should convert valid XML tool use to neutral format", () => {
        const xmlContent = `
          <read_file>
            <path>src/main.js</path>
          </read_file>
        `;

        const result = McpConverters.xmlToMcp(xmlContent);

        expect(result).toEqual({
          type: "tool_use",
          id: expect.any(String),
          name: "read_file",
          input: {
            path: "src/main.js"
          }
        });
      });

      it("should handle XML with multiple parameters", () => {
        const xmlContent = `
          <read_file>
            <path>src/main.js</path>
            <start_line>10</start_line>
            <end_line>20</end_line>
          </read_file>
        `;

        const result = McpConverters.xmlToMcp(xmlContent);

        expect(result).toEqual({
          type: "tool_use",
          id: expect.any(String),
          name: "read_file",
          input: {
            path: "src/main.js",
            start_line: "10",
            end_line: "20"
          }
        });
      });

      // Note: The current implementation of xmlToolUseToJson is robust and doesn't throw errors
      // for malformed XML or invalid tool use formats, so we're focusing on testing the successful cases
    });

    describe("mcpToXml", () => {
      it("should convert neutral tool result to XML format", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "read_file-123",
          content: [
            { type: "text", text: "File content here" }
          ],
          status: "success"
        };

        const result = McpConverters.mcpToXml(neutralResult);

        expect(result).toContain('<tool_result tool_use_id="read_file-123" status="success">');
        expect(result).toContain("File content here");
        expect(result).toContain("</tool_result>");
      });

      it("should include error information in XML when present", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "read_file-123",
          content: [],
          status: "error",
          error: {
            message: "File not found"
          }
        };

        const result = McpConverters.mcpToXml(neutralResult);

        expect(result).toContain('<tool_result tool_use_id="read_file-123" status="error">');
        expect(result).toContain('<error message="File not found"');
        expect(result).toContain("</tool_result>");
      });

      it("should include error details in XML when present", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "read_file-123",
          content: [],
          status: "error",
          error: {
            message: "File not found",
            details: { path: "src/main.js" }
          }
        };

        const result = McpConverters.mcpToXml(neutralResult);

        expect(result).toContain('<tool_result tool_use_id="read_file-123" status="error">');
        expect(result).toContain('<error message="File not found"');
        expect(result).toContain('details="{&quot;path&quot;:&quot;src/main.js&quot;}"');
        expect(result).toContain("</tool_result>");
      });

      it("should handle image content in the result", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "screenshot-123",
          content: [
            { 
              type: "image", 
              source: {
                media_type: "image/png",
                data: "base64data"
              }
            }
          ],
          status: "success"
        };

        const result = McpConverters.mcpToXml(neutralResult);

        expect(result).toContain('<tool_result tool_use_id="screenshot-123" status="success">');
        expect(result).toContain('<image type="image/png" data="base64data" />');
        expect(result).toContain("</tool_result>");
      });
    });
  });

  describe("JSON Format Conversion", () => {
    describe("jsonToMcp", () => {
      it("should convert valid JSON string to neutral format", () => {
        const jsonString = JSON.stringify({
          type: "tool_use",
          id: "execute_command-123",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        });

        const result = McpConverters.jsonToMcp(jsonString);

        expect(result).toEqual({
          type: "tool_use",
          id: "execute_command-123",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        });
      });

      it("should convert valid JSON object to neutral format", () => {
        const jsonObject = {
          type: "tool_use",
          id: "execute_command-123",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        };

        const result = McpConverters.jsonToMcp(jsonObject);

        expect(result).toEqual({
          type: "tool_use",
          id: "execute_command-123",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        });
      });

      it("should throw an error for malformed JSON string", () => {
        const malformedJson = `{
          "type": "tool_use",
          "id": "execute_command-123",
          "name": "execute_command",
          "input": {
            "command": "ls -la"
          }
        `;

        expect(() => McpConverters.jsonToMcp(malformedJson)).toThrow();
      });

      it("should throw an error for invalid tool use format", () => {
        const invalidJson = JSON.stringify({
          type: "not_a_tool_use",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        });

        expect(() => McpConverters.jsonToMcp(invalidJson)).toThrow("Invalid tool use request format");
      });

      it("should throw an error for missing required properties", () => {
        const invalidJson = JSON.stringify({
          type: "tool_use",
          name: "execute_command"
          // Missing id and input
        });

        expect(() => McpConverters.jsonToMcp(invalidJson)).toThrow("Invalid tool use request format");
      });
    });

    describe("mcpToJson", () => {
      it("should convert neutral tool result to JSON string", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "execute_command-123",
          content: [
            { type: "text", text: "Command output" }
          ],
          status: "success"
        };

        const result = McpConverters.mcpToJson(neutralResult);
        const parsedResult = JSON.parse(result) as Record<string, unknown>;

        expect(parsedResult).toEqual({
          type: "tool_result",
          tool_use_id: "execute_command-123",
          content: [
            { type: "text", text: "Command output" }
          ],
          status: "success"
        });
      });

      it("should include error information in JSON when present", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "execute_command-123",
          content: [],
          status: "error",
          error: {
            message: "Command failed"
          }
        };

        const result = McpConverters.mcpToJson(neutralResult);
        const parsedResult = JSON.parse(result) as Record<string, unknown>;

        expect(parsedResult).toEqual({
          type: "tool_result",
          tool_use_id: "execute_command-123",
          content: [],
          status: "error",
          error: {
            message: "Command failed"
          }
        });
      });
    });
  });

  describe("OpenAI Format Conversion", () => {
    describe("openAiToMcp", () => {
      it("should convert OpenAI function call to neutral format", () => {
        const openAiFunctionCall = {
          function_call: {
            id: "function-123",
            name: "execute_command",
            arguments: JSON.stringify({
              command: "ls -la"
            })
          }
        };

        const result = McpConverters.openAiToMcp(openAiFunctionCall);

        expect(result).toEqual({
          type: "tool_use",
          id: "function-123",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        });
      });

      it("should handle OpenAI tool calls array format", () => {
        const openAiToolCalls = {
          tool_calls: [
            {
              id: "tool-123",
              type: "function",
              function: {
                name: "execute_command",
                arguments: JSON.stringify({
                  command: "ls -la"
                })
              }
            }
          ]
        };

        const result = McpConverters.openAiToMcp(openAiToolCalls);

        expect(result).toEqual({
          type: "tool_use",
          id: "tool-123",
          name: "execute_command",
          input: {
            command: "ls -la"
          }
        });
      });

      it("should handle malformed arguments by using raw string", () => {
        const openAiFunctionCall = {
          function_call: {
            id: "function-123",
            name: "execute_command",
            arguments: "{command: ls -la}" // Invalid JSON
          }
        };

        const result = McpConverters.openAiToMcp(openAiFunctionCall);

        expect(result).toEqual({
          type: "tool_use",
          id: "function-123",
          name: "execute_command",
          input: {
            raw: "{command: ls -la}"
          }
        });
      });

      it("should throw an error for invalid function call format", () => {
        const invalidFunctionCall = {
          not_a_function_call: {
            name: "execute_command"
          }
        };

        expect(() => McpConverters.openAiToMcp(invalidFunctionCall)).toThrow("Invalid function call format");
      });
    });

    describe("mcpToOpenAi", () => {
      it("should convert neutral tool result to OpenAI format", () => {
        const neutralResult: NeutralToolResult = {
          type: "tool_result",
          tool_use_id: "function-123",
          content: [
            { type: "text", text: "Command output line 1" },
            { type: "text", text: "Command output line 2" }
          ],
          status: "success"
        };

        const result = McpConverters.mcpToOpenAi(neutralResult);

        expect(result).toEqual({
          role: "tool",
          tool_call_id: "function-123",
          content: "Command output line 1\nCommand output line 2"
        });
      });
    });
  });

  describe("Tool Definition Conversion", () => {
    it("should convert tool definitions to OpenAI function definitions", () => {
      const toolDefinitions = new Map<string, ToolDefinition>();
      
      toolDefinitions.set("read_file", {
        name: "read_file",
        description: "Read a file from the filesystem",
        paramSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            start_line: { type: "number" },
            end_line: { type: "number" }
          },
          required: ["path"]
        },
        handler: () => Promise.resolve({ content: [] })
      });
      
      toolDefinitions.set("execute_command", {
        name: "execute_command",
        description: "Execute a shell command",
        paramSchema: {
          type: "object",
          properties: {
            command: { type: "string" }
          },
          required: ["command"]
        },
        handler: () => Promise.resolve({ content: [] })
      });

      const result = McpConverters.toolDefinitionsToOpenAiFunctions(toolDefinitions);

      expect(result).toEqual([
        {
          name: "read_file",
          description: "Read a file from the filesystem",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" },
              start_line: { type: "number" },
              end_line: { type: "number" }
            },
            required: ["path"]
          }
        },
        {
          name: "execute_command",
          description: "Execute a shell command",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string" }
            },
            required: ["command"]
          }
        }
      ]);
    });

    it("should handle tool definitions without description or paramSchema", () => {
      const toolDefinitions = new Map<string, ToolDefinition>();
      
      toolDefinitions.set("minimal_tool", {
        name: "minimal_tool",
        handler: () => Promise.resolve({ content: [] })
      });

      const result = McpConverters.toolDefinitionsToOpenAiFunctions(toolDefinitions);

      expect(result).toEqual([
        {
          name: "minimal_tool",
          description: "",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ]);
    });
  });
});