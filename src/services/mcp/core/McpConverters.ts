import { xmlToolUseToJson, openAiFunctionCallToNeutralToolUse } from "../../../utils/json-xml-bridge"
import { NeutralToolUseRequest, NeutralToolResult } from "../types/McpToolTypes"
import { ToolDefinition } from "../types/McpProviderTypes"

/**
 * McpConverters provides utility functions for converting between different tool use formats
 * and the MCP protocol. This serves as the bridge between the JSON-XML formats and the
 * underlying MCP protocol.
 */
export class McpConverters {
	/**
	 * Convert XML tool use format to MCP protocol format
	 * @param xmlContent XML string with tool use tags
	 * @returns MCP protocol compatible tool use request
	 */
	public static xmlToMcp(xmlContent: string): NeutralToolUseRequest {
		// First convert XML to JSON format
		const jsonString = xmlToolUseToJson(xmlContent)

		try {
			// Parse the JSON string to get the tool use request
			const toolUseRequest = JSON.parse(jsonString) as NeutralToolUseRequest

			// Validate the tool use request
			if (
				!toolUseRequest.type ||
				toolUseRequest.type !== "tool_use" ||
				!toolUseRequest.name ||
				!toolUseRequest.id ||
				!toolUseRequest.input
			) {
				throw new Error("Invalid tool use request format")
			}

			return toolUseRequest
		} catch (error) {
			throw new Error(
				`Failed to convert XML to MCP format: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Convert JSON tool use format to MCP protocol format
	 * @param jsonContent JSON object or string with tool use content
	 * @returns MCP protocol compatible tool use request
	 */
	public static jsonToMcp(jsonContent: string | Record<string, unknown>): NeutralToolUseRequest {
		try {
			let toolUseRequest: Record<string, unknown>

			if (typeof jsonContent === "string") {
				toolUseRequest = JSON.parse(jsonContent) as Record<string, unknown>
			} else {
				toolUseRequest = jsonContent
			}

			// Validate the tool use request
			if (
				!("type" in toolUseRequest) ||
				toolUseRequest.type !== "tool_use" ||
				!("name" in toolUseRequest) ||
				!("id" in toolUseRequest) ||
				!("input" in toolUseRequest)
			) {
				throw new Error("Invalid tool use request format: missing required properties")
			}

			return {
				type: "tool_use",
				id: String(toolUseRequest.id),
				name: String(toolUseRequest.name),
				input: toolUseRequest.input as Record<string, unknown>,
			}
		} catch (error) {
			throw new Error(
				`Failed to convert JSON to MCP format: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Convert OpenAI function call format to MCP protocol format
	 * @param functionCall OpenAI function call object
	 * @returns MCP protocol compatible tool use request
	 */
	public static openAiToMcp(functionCall: Record<string, unknown>): NeutralToolUseRequest {
		try {
			const toolUseRequest = openAiFunctionCallToNeutralToolUse(functionCall)

			if (!toolUseRequest) {
				throw new Error("Invalid function call format")
			}

			return toolUseRequest as NeutralToolUseRequest
		} catch (error) {
			throw new Error(
				`Failed to convert OpenAI function call to MCP format: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Helper function to escape XML special characters
	 * @param text Text to escape
	 * @returns Escaped text safe for XML
	 */
	private static escapeXml(text: string): string {
		if (typeof text !== 'string') {
			return '';
		}
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");
	}

	private static getTextSafe(item: { text?: string }): string {
		return typeof item.text === 'string' ? item.text : ''
	}

	private static isBase64Image(src: unknown): src is { media_type?: string; data?: string } {
		if (!src || typeof src !== 'object') return false
		const r = src as Record<string, unknown>
		return 'media_type' in r || 'data' in r
	}

	private static isTyped(src: unknown, t: string): boolean {
		if (!src || typeof src !== 'object') return false
		const r = src as Record<string, unknown>
		return typeof r.type === 'string' && r.type === t
	}

	private static hasUrl(src: unknown): src is { url?: string } {
		return !!src && typeof src === 'object' && 'url' in (src as Record<string, unknown>)
	}

	/**
	 * Convert MCP protocol format to XML tool result format
	 * @param result MCP protocol tool result
	 * @returns XML string with tool result tags
	 */
	public static mcpToXml(result: NeutralToolResult): string {
		return `<tool_result tool_use_id="${this.escapeXml(result.tool_use_id)}" status="${result.status}">\n${
			result.content
				.map((item: Record<string, unknown> & { type: string }) => {
					if (item.type === "text") {
						return this.escapeXml(this.getTextSafe(item as { text?: string }));
					} 
					else if ((item.type === "image" || item.type === "image_url" || item.type === "image_base64") && 'source' in item) {
						const src = (item as { source?: unknown }).source
						if (this.isTyped(src, 'base64') || this.isBase64Image(src)) {
							const s = src as { media_type?: string; data?: string }
							return `<image type="${this.escapeXml(s.media_type || '')}" data="${this.escapeXml(s.data || '')}" />`;
						} else if (this.isTyped(src, 'image_url') || this.hasUrl(src)) {
							const s = src as { url?: string }
							return `<image url="${this.escapeXml(s.url || '')}" />`;
						}
					}
					else if (item.type === "tool_use" && 'name' in item && 'input' in item) {
						const toolUseItem = item as unknown as { name: string; input: Record<string, unknown> };
						return `<tool_use name="${this.escapeXml(toolUseItem.name)}" input="${this.escapeXml(JSON.stringify(toolUseItem.input))}" />`;
					}
					else if (item.type === "tool_result" && 'tool_use_id' in item && 'content' in item) {
						const nestedItem = item as unknown as { tool_use_id: string; content: Array<{ type: string; text?: string }> };
						return `<nested_tool_result tool_use_id="${this.escapeXml(nestedItem.tool_use_id)}">${
							Array.isArray(nestedItem.content) 
								? nestedItem.content.map(subItem => 
										subItem.type === "text" ? this.escapeXml(this.getTextSafe(subItem)) : ""
									).join("\n")
								: ""
						}</nested_tool_result>`;
					}
					console.warn(`Unhandled content type in mcpToXml: ${item.type}`);
					return `<unknown type="${this.escapeXml(item.type)}" />`;
				})
				.join("\n")
		}
		${
			result.error
				? `\n<error message="${this.escapeXml(result.error.message)}"${
						result.error.details
							? ` details="${this.escapeXml(JSON.stringify(result.error.details))}"`
						: ""
					} />`
				: ""
		}
		\n</tool_result>`;
	}

	/**
	 * Convert MCP protocol format to JSON tool result format
	 * @param result MCP protocol tool result
	 * @returns JSON string with tool result content
	 */
	public static mcpToJson(result: NeutralToolResult): string {
		return JSON.stringify(result)
	}

	/**
	 * Convert MCP protocol format to OpenAI tool result format
	 * @param result MCP protocol tool result
	 * @returns OpenAI compatible tool result object
	 */
	public static mcpToOpenAi(result: NeutralToolResult): Record<string, unknown> {
		return {
			role: "tool",
			tool_call_id: result.tool_use_id,
			content: result.content.map((item) => item.text).join("\n"),
		}
	}

	/**
	 * Convert MCP tool definitions to OpenAI function definitions
	 * @param tools Map of tool names to tool definitions
	 * @returns Array of OpenAI function definitions
	 */
	public static toolDefinitionsToOpenAiFunctions(tools: Map<string, ToolDefinition>): Array<Record<string, unknown>> {
		const functions: Array<Record<string, unknown>> = []

		for (const [, definition] of tools.entries()) {
			functions.push({
				name: definition.name,
				description: definition.description || "",
				parameters: definition.paramSchema || {
					type: "object",
					properties: {},
					required: [],
				},
			})
		}

		return functions
	}
}
