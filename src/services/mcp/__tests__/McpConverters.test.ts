import { McpConverters } from "../core/McpConverters"
import { ToolDefinition } from "../types/McpProviderTypes"
import { NeutralToolResult } from "../types/McpToolTypes"

// Mock the json-xml-bridge utilities
jest.mock("../../../utils/json-xml-bridge", () => ({
	jsonToolUseToXml: jest.fn((json) => `<mock_xml>${json}</mock_xml>`),
	xmlToolUseToJson: jest.fn(() => '{"type":"tool_use","id":"test","name":"test_tool","input":{"param":"test"}}'),
	openAiFunctionCallToNeutralToolUse: jest.fn(() => ({
		type: "tool_use",
		id: "test",
		name: "test_tool",
		input: { param: "test" },
	})),
	neutralToolUseToOpenAiFunctionCall: jest.fn(),
}))

describe("McpConverters", () => {
	describe("toolDefinitionsToOpenAiFunctions", () => {
		test("should convert tool definitions to OpenAI function definitions", () => {
			// Create a map of tool definitions
			const tools = new Map<string, ToolDefinition>()

			tools.set("test_tool", {
				name: "test_tool",
				description: "A test tool",
				paramSchema: {
					type: "object",
					properties: {
						param: {
							type: "string",
							description: "A test parameter",
						},
					},
					required: ["param"],
				},
				handler: () => ({ content: [] }),
			})

			tools.set("another_tool", {
				name: "another_tool",
				description: "Another test tool",
				paramSchema: {
					type: "object",
					properties: {
						option: {
							type: "boolean",
							description: "A boolean option",
						},
						count: {
							type: "number",
							description: "A number parameter",
						},
					},
					required: ["option"],
				},
				handler: () => ({ content: [] }),
			})

			// Convert to OpenAI functions
			const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools)

			// Verify the conversion
			expect(functions).toHaveLength(2)

			// Check the first function
			expect(functions[0]).toEqual({
				name: "test_tool",
				description: "A test tool",
				parameters: {
					type: "object",
					properties: {
						param: {
							type: "string",
							description: "A test parameter",
						},
					},
					required: ["param"],
				},
			})

			// Check the second function
			expect(functions[1]).toEqual({
				name: "another_tool",
				description: "Another test tool",
				parameters: {
					type: "object",
					properties: {
						option: {
							type: "boolean",
							description: "A boolean option",
						},
						count: {
							type: "number",
							description: "A number parameter",
						},
					},
					required: ["option"],
				},
			})
		})

		test("should handle tool definitions without schemas", () => {
			// Create a map of tool definitions without schemas
			const tools = new Map<string, ToolDefinition>()

			tools.set("simple_tool", {
				name: "simple_tool",
				description: "A simple tool without schema",
				handler: () => ({ content: [] }),
			})

			// Convert to OpenAI functions
			const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools)

			// Verify the conversion
			expect(functions).toHaveLength(1)
			expect(functions[0]).toEqual({
				name: "simple_tool",
				description: "A simple tool without schema",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
			})
		})

		test("should handle tool definitions without descriptions", () => {
			// Create a map of tool definitions without descriptions
			const tools = new Map<string, ToolDefinition>()

			tools.set("no_description", {
				name: "no_description",
				handler: () => ({ content: [] }),
			})

			// Convert to OpenAI functions
			const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools)

			// Verify the conversion
			expect(functions).toHaveLength(1)
			expect(functions[0]).toEqual({
				name: "no_description",
				description: "",
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
			})
		})

		test("should handle empty tool map", () => {
			// Create an empty map of tool definitions
			const tools = new Map<string, ToolDefinition>()

			// Convert to OpenAI functions
			const functions = McpConverters.toolDefinitionsToOpenAiFunctions(tools)

			// Verify the conversion
			expect(functions).toHaveLength(0)
			expect(functions).toEqual([])
		})
	})

	describe("format conversion", () => {
		test("should convert XML to MCP format", () => {
			const xmlContent = '<tool_use id="test" name="test_tool"><param>test</param></tool_use>'
			const result = McpConverters.xmlToMcp(xmlContent)

			expect(result).toEqual({
				type: "tool_use",
				id: "test",
				name: "test_tool",
				input: { param: "test" },
			})
		})

		test("should convert JSON to MCP format", () => {
			const jsonContent = {
				type: "tool_use",
				id: "test",
				name: "test_tool",
				input: { param: "test" },
			}

			const result = McpConverters.jsonToMcp(jsonContent)

			expect(result).toEqual({
				type: "tool_use",
				id: "test",
				name: "test_tool",
				input: { param: "test" },
			})
		})

		test("should convert OpenAI function call to MCP format", () => {
			const functionCall = {
				function_call: {
					name: "test_tool",
					arguments: '{"param":"test"}',
				},
			}

			const result = McpConverters.openAiToMcp(functionCall)

			expect(result).toEqual({
				type: "tool_use",
				id: "test",
				name: "test_tool",
				input: { param: "test" },
			})
		})

		test("should convert basic text content to XML", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test",
				content: [{ type: "text", text: "Test result" }],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('tool_use_id="test"')
			expect(result).toContain('status="success"')
			expect(result).toContain("Test result")
		})

		test("should properly escape XML special characters", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [{ type: "text", text: "Text with <special> & \"characters\"" }],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('tool_use_id="test-123"')
			expect(result).toContain("Text with &lt;special&gt; &amp; &quot;characters&quot;")
		})

		test("should handle image content with base64 data", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [{ 
					type: "image", 
					source: {
						type: "base64",
						media_type: "image/png",
						data: "base64data"
					}
				}],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('<image type="image/png" data="base64data" />')
		})

		test("should handle image content with URL", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [{ 
					type: "image_url", 
					source: {
						type: "image_url",
						url: "https://example.com/image.png"
					}
				}],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('<image url="https://example.com/image.png" />')
		})

		test("should handle mixed content types", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [
					{ type: "text", text: "Text result" },
					{ 
						type: "image", 
						source: {
							type: "base64",
							media_type: "image/png",
							data: "base64data"
						}
					}
				],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain("Text result")
			expect(result).toContain('<image type="image/png" data="base64data" />')
		})

		test("should handle error details", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [{ type: "text", text: "Error occurred" }],
				status: "error",
				error: {
					message: "Something went wrong",
					details: { code: 500, reason: "Internal error" }
				}
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('status="error"')
			expect(result).toContain('<error message="Something went wrong"')
			expect(result).toContain('details="{&quot;code&quot;:500,&quot;reason&quot;:&quot;Internal error&quot;}"')
		})

		test("should handle tool_use content type", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [{ 
					type: "tool_use", 
					name: "test_tool",
					input: { param: "value" }
				}],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('<tool_use name="test_tool" input="{&quot;param&quot;:&quot;value&quot;}" />')
		})

		test("should handle nested tool_result content type", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "parent-123",
				content: [{ 
					type: "tool_result", 
					tool_use_id: "child-456",
					content: [{ type: "text", text: "Nested result" }],
					status: "success"
				}],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('<nested_tool_result tool_use_id="child-456">Nested result</nested_tool_result>')
		})

		test("should handle unrecognized content types", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test-123",
				content: [{ type: "unknown_type", someProperty: "value" }],
				status: "success",
			}

			const result = McpConverters.mcpToXml(mcpResult)

			expect(result).toContain('<unknown type="unknown_type" />')
		})

		test("should convert MCP format to JSON", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test",
				content: [{ type: "text", text: "Test result" }],
				status: "success",
			}

			const result = McpConverters.mcpToJson(mcpResult)
			const parsed = JSON.parse(result) as unknown as NeutralToolResult

			expect(parsed).toEqual(mcpResult)
		})

		test("should convert MCP format to OpenAI", () => {
			const mcpResult: NeutralToolResult = {
				type: "tool_result",
				tool_use_id: "test",
				content: [{ type: "text", text: "Test result" }],
				status: "success",
			}

			const result = McpConverters.mcpToOpenAi(mcpResult)

			expect(result).toEqual({
				role: "tool",
				tool_call_id: "test",
				content: "Test result",
			})
		})
	})
})
