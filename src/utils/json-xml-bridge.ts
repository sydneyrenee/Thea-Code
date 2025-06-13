/**
 * JSON-XML Bridge
 *
 * This utility provides a bridge between JSON and XML formats for model responses,
 * allowing models that prefer JSON to work with the existing XML-based system.
 *
 * It includes:
 * 1. A JSON matcher similar to XmlMatcher for detecting JSON patterns in streaming text
 * 2. Conversion functions between JSON and XML formats
 * 3. A format detector to determine whether a response is using JSON or XML
 * 4. Tool use conversion between JSON and XML formats
 * 5. OpenAI function call conversion to neutral format
 */
import { XmlMatcher, XmlMatcherResult } from "./xml-matcher"

/**
 * Helper function to safely convert values to strings for template literals
 */
function safeStringify(value: unknown): string {
	if (typeof value === "string") {
		return value
	}
	if (value === null || value === undefined) {
		return ""
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value)
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value)
		} catch {
			return "[object Object]"
		}
	}
	// For other types like functions, symbols, etc.
	return "[unknown]"
}

/**
 * Helper function to safely parse any JSON value (not just objects)
 */
function safeJsonParseAny(jsonString: string): unknown {
	try {
		return JSON.parse(jsonString)
	} catch {
		return jsonString // Return the original string if parsing fails
	}
}

export interface GenericParsedJson {
	type?: string
	content?: unknown
	text?: unknown
	[key: string]: unknown // Allow for arbitrary properties
}

export interface FormatDetectedJson extends GenericParsedJson {
	tool_calls?: unknown
	function_call?: unknown
}

export interface ThinkingJsonObject {
	type: "thinking"
	content: string
}

export interface ToolUseJsonObject {
	type: "tool_use"
	id?: string
	name: string
	input: Record<string, unknown>
}

export interface ToolResultContentItem {
	type: "text" | "image"
	text?: string
	source?: {
		type: "base64"
		media_type: string
		data: string
	}
}

export interface ToolResultJsonObject {
	type: "tool_result"
	tool_use_id: string
	status?: string
	content: ToolResultContentItem[]
	error?: {
		message: string
		details?: unknown
	}
}

export interface OpenAIFunctionCall {
	function_call?: {
		id?: string
		name: string
		arguments: string // JSON string
	}
	tool_calls?: Array<{
		id?: string
		type: "function"
		function: {
			name: string
			arguments: string // JSON string
		}
	}>
}

/**
 * Result from the JsonMatcher
 */
export interface JsonMatcherResult {
	matched: boolean
	data: string | object
	type?: string
	text?: string // Added for non-matched text
}

/**
 * JsonMatcher - Similar to XmlMatcher but for JSON objects in streaming text
 *
 * This class detects and extracts JSON objects from streaming text, particularly
 * focusing on reasoning/thinking blocks and tool usage.
 */
export class JsonMatcher {
	private buffer = ""
	private objectDepth = 0
	private inString = false
	private escapeNext = false

	/**
	 * Create a new JsonMatcher
	 *
	 * @param matchType The type of JSON object to match (e.g., "thinking", "tool_use")
	 */
	constructor(readonly matchType: string) {}

	/**
	 * Update the matcher with a new chunk of text
	 *
	 * @param chunk New text chunk to process
	 * @returns Array of matched results
	 */
	update(chunk: string): JsonMatcherResult[] {
		this.buffer += chunk
		return this.processBuffer()
	}

	/**
	 * Process any remaining content and return final results
	 *
	 * @param chunk Optional final chunk to process
	 * @returns Array of matched results
	 */
	final(chunk?: string): JsonMatcherResult[] {
		if (chunk) {
			this.buffer += chunk
		}

		const results = this.processBuffer()

		// If there's any remaining text, treat it as non-matched
		if (this.buffer.trim()) {
			const textResult: JsonMatcherResult = {
				matched: false,
				data: this.buffer,
				text: this.buffer,
			}

			this.buffer = ""

			return [textResult]
		}

		return results
	}

	/**
	 * Process the current buffer to extract JSON objects
	 *
	 * @returns Array of matched results
	 */
	private processBuffer(): JsonMatcherResult[] {
		const results: JsonMatcherResult[] = []
		let startIndex = 0

		while (startIndex < this.buffer.length) {
			// Look for the start of a JSON object
			const objectStart = this.buffer.indexOf("{", startIndex)

			if (objectStart === -1) {
				// No more JSON objects in buffer
				if (startIndex < this.buffer.length) {
					// Process remaining text as non-matched
					const text = this.buffer.substring(startIndex)
					const textResult: JsonMatcherResult = {
						matched: false,
						data: text,
						text: text,
					}

					results.push(textResult)
					this.buffer = ""
				}
				break
			}

			// Process text before JSON object as non-matched
			if (objectStart > startIndex) {
				const text = this.buffer.substring(startIndex, objectStart)
				const textResult: JsonMatcherResult = {
					matched: false,
					data: text,
					text: text,
				}

				results.push(textResult)
			}

			// Find the end of the JSON object
			const objectEnd = this.findObjectEnd(objectStart)
			if (objectEnd === -1) {
				// Incomplete JSON object, wait for more chunks
				this.buffer = this.buffer.substring(startIndex)
				break
			}

			// Process JSON object
			const jsonStr = this.buffer.substring(objectStart, objectEnd + 1)
			try {
				const jsonObj = JSON.parse(jsonStr) as unknown as GenericParsedJson

				// Check if this is a matching object type
				if (jsonObj.type === this.matchType) {
					const matchedResult: JsonMatcherResult = {
						matched: true,
						data:
							typeof jsonObj.content === "string" ||
							(typeof jsonObj.content === "object" && jsonObj.content !== null)
								? jsonObj.content
								: typeof jsonObj.text === "string" ||
									  (typeof jsonObj.text === "object" && jsonObj.text !== null)
									? jsonObj.text
									: jsonObj,
						type: this.matchType,
					}

					results.push(matchedResult)
				} else {
					// Not a matching object, treat as non-matched
					const textResult: JsonMatcherResult = {
						matched: false,
						data: jsonStr,
						text: jsonStr,
					}

					results.push(textResult)
				}
			} catch {
				// Invalid JSON, treat as text
				const textResult: JsonMatcherResult = {
					matched: false,
					data: jsonStr,
					text: jsonStr,
				}

				results.push(textResult)
			}

			startIndex = objectEnd + 1
		}

		// Update buffer to contain only unprocessed text
		this.buffer = this.buffer.substring(startIndex)

		return results
	}

	/**
	 * Find the matching closing brace for a JSON object
	 *
	 * @param start Starting index of the opening brace
	 * @returns Index of the matching closing brace, or -1 if not found
	 */
	private findObjectEnd(start: number): number {
		let depth = 0
		let inString = false
		let escapeNext = false

		// Initialize depth based on the starting brace
		if (this.buffer[start] === "{") {
			depth = 1
		} else {
			return -1 // Should always start with an opening brace
		}

		for (let i = start + 1; i < this.buffer.length; i++) {
			const char = this.buffer[i]

			if (escapeNext) {
				escapeNext = false
				continue
			}

			if (char === "\\") {
				escapeNext = true
				continue
			}

			if (char === '"') {
				inString = !inString
			} else if (!inString) {
				if (char === "{") {
					depth++
				} else if (char === "}") {
					depth--
					if (depth === 0) {
						return i
					}
				}
			}
		}

		return -1 // Incomplete object
	}
}

/**
 * Format detector to determine whether a response is using JSON or XML
 */
export class FormatDetector {
	/**
	 * Detect the format of a text chunk
	 *
	 * @param content Text content to analyze
	 * @returns Format type: 'json', 'xml', or 'unknown'
	 */
	detectFormat(content: string): "json" | "xml" | "unknown" {
		// Check for XML pattern
		if (content.includes("<think>") || content.match(/<\w+>/) || content.includes("<tool_result>")) {
			return "xml"
		}

		// Check for JSON pattern
		if (content.includes("{") && content.includes("}")) {
			try {
				// Try to parse a sample to confirm it's JSON
				const startIndex = content.indexOf("{")
				const endIndex = content.lastIndexOf("}")

				if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
					const sample = content.substring(startIndex, endIndex + 1)
					// Attempt to parse only if it looks like a complete JSON object
					if (sample.startsWith("{") && sample.endsWith("}")) {
						const jsonObj = JSON.parse(sample) as unknown as FormatDetectedJson

						// Check if it's a tool use or tool result JSON
						if (
							jsonObj.type === "tool_use" ||
							jsonObj.type === "tool_result" ||
							jsonObj.type === "thinking"
						) {
							return "json"
						}

						// Check for OpenAI function calling format
						if (jsonObj.tool_calls || jsonObj.function_call) {
							return "json"
						}

						return "json"
					} // This closing brace was misplaced
				}
			} catch {
				// Not valid JSON, or incomplete JSON object
				// console.error("JSON parsing error in detectFormat:", e); // For debugging
			}
		}

		return "unknown"
	}
}

/**
 * Convert JSON thinking format to XML format
 *
 * @param jsonObj JSON object with thinking content
 * @returns XML string with thinking tags
 */
export function jsonThinkingToXml(jsonObj: ThinkingJsonObject | GenericParsedJson): string {
	if (typeof jsonObj === "object" && jsonObj.type === "thinking" && jsonObj.content) {
		return `<think>${safeStringify(jsonObj.content)}</think>`
	}
	return JSON.stringify(jsonObj)
}

/**
 * Convert XML thinking format to JSON format
 *
 * @param xmlContent XML string with thinking tags
 * @returns JSON object with thinking content
 */
export function xmlThinkingToJson(xmlContent: string): string {
	const thinkRegex = /<think>(.*?)<\/think>/s
	const match = thinkRegex.exec(xmlContent)

	if (match && match[1]) {
		return JSON.stringify({
			type: "thinking",
			content: match[1],
		})
	}

	return xmlContent
}

/**
 * Convert JSON tool use format to XML format
 *
 * @param jsonObj JSON object with tool use content
 * @returns XML string with tool use tags
 */
export function jsonToolUseToXml(jsonObj: ToolUseJsonObject | GenericParsedJson): string {
	if (typeof jsonObj === "object" && jsonObj.type === "tool_use" && jsonObj.name) {
		// Ensure name is a string before using in template literal
		let toolNameStr: string
		if (typeof jsonObj.name === "string") {
			toolNameStr = jsonObj.name
		} else if (typeof jsonObj.name === "number" || typeof jsonObj.name === "boolean") {
			toolNameStr = String(jsonObj.name)
		} else {
			toolNameStr = JSON.stringify(jsonObj.name)
		}
		// Create the opening tool tag with the tool name
		const toolName = safeStringify(jsonObj.name)

		let xml = `<${toolName}>\n`

		// Add parameter tags
		if (jsonObj.input && typeof jsonObj.input === "object" && jsonObj.input !== null) {
			for (const [key, value] of Object.entries(jsonObj.input as Record<string, unknown>)) {
				let stringValue: string
				if (typeof value === "object" && value !== null) {
					stringValue = JSON.stringify(value)
				} else {
					stringValue = String(value)
				}
				xml += `<${key}>${stringValue}</${key}>\n`
			}
		}

		// Add closing tool tag
		xml += `</${toolName}>`

		return xml
	}
	return JSON.stringify(jsonObj)
}

/**
 * Convert XML tool use format to JSON format
 *
 * @param xmlContent XML string with tool use tags
 * @returns JSON object with tool use content
 */
export function xmlToolUseToJson(xmlContent: string): string {
	// Extract the tool name from the opening tag
	const toolNameRegex = /<(\w+)>/
	const toolNameMatch = toolNameRegex.exec(xmlContent)

	if (toolNameMatch && toolNameMatch[1]) {
		const toolName = toolNameMatch[1]

		// Extract parameters using a more specific regex that handles nested content better
		let outerContent = xmlContent

		// First, remove the outer tool tag to simplify parsing
		outerContent = outerContent.replace(new RegExp(`<${toolName}>\\s*`), "")
		outerContent = outerContent.replace(new RegExp(`\\s*</${toolName}>`), "")

		// Now parse each parameter
		const params: Record<string, unknown> = {}
		const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
		let match

		while ((match = paramRegex.exec(outerContent)) !== null) {
			const paramName = match[1]
			const paramValue = match[2].trim()

			// Skip if the param name is the same as the tool name (outer tag)
			if (paramName !== toolName) {
				// Attempt to parse as JSON if it looks like a JSON string
				try {
					const parsedValue = safeJsonParseAny(paramValue)
					params[paramName] = parsedValue
				} catch {
					params[paramName] = paramValue
				}
			}
		}

		// Create the JSON object
		const jsonObj: ToolUseJsonObject = {
			type: "tool_use",
			name: toolName,
			id: `${toolName}-${Date.now()}`, // Generate a unique ID
			input: params,
		}

		return JSON.stringify(jsonObj)
	}

	return xmlContent
}

/**
 * Convert JSON tool result format to XML format
 *
 * @param jsonObj JSON object with tool result content
 * @returns XML string with tool result tags
 */
export function jsonToolResultToXml(jsonObj: ToolResultJsonObject | GenericParsedJson): string {
	if (typeof jsonObj === "object" && jsonObj.type === "tool_result" && jsonObj.tool_use_id) {
		// Create the opening tool result tag
		let xml = `<tool_result tool_use_id="${safeStringify(jsonObj.tool_use_id)}"`

		// Add status if present
		if (jsonObj.status) {
			xml += ` status="${safeStringify(jsonObj.status)}"`
		}

		xml += ">\n"

		// Add content
		if (Array.isArray(jsonObj.content)) {
			for (const item of jsonObj.content) {
				// Type guard for item to ensure safe property access
				if (typeof item === "object" && item !== null) {
					const typedItem = item as { type?: string; text?: string; source?: { media_type?: string; data?: string } }
					if (typedItem.type === "text") {
						xml += `${safeStringify(typedItem.text)}\n`
					} else if (typedItem.type === "image") {
						if (typedItem.source) {
							// Add null check for item.source
							xml += `<image type="${safeStringify(typedItem.source.media_type)}" data="${safeStringify(typedItem.source.data)}" />\n`
						}
					}
				}
			}
		}

		// Add error if present
		if (jsonObj.error && typeof jsonObj.error === "object") {
			const errorObj = jsonObj.error as { message?: string; details?: unknown };
			xml += `<error message="${errorObj.message ?? ""}"`
			if (errorObj.details) {
				// Escape quotes in the JSON string
				const escapedDetails = JSON.stringify(errorObj.details).replace(/"/g, "&quot;")
				xml += ` details="${escapedDetails}"`
			}
			xml += " />\n"
		}

		// Add closing tool result tag
		xml += "</tool_result>"

		return xml
	}
	return JSON.stringify(jsonObj)
}

/**
 * Convert XML tool result format to JSON format
 *
 * @param xmlContent XML string with tool result tags
 * @returns JSON object with tool result content
 */
export function xmlToolResultToJson(xmlContent: string): string {
	// Extract the tool result attributes
	const toolResultRegex = /<tool_result\s+tool_use_id="([^"]+)"(?:\s+status="([^"]+)")?>/
	const toolResultMatch = toolResultRegex.exec(xmlContent)

	if (toolResultMatch) {
		const toolUseId = toolResultMatch[1]
		const status = toolResultMatch[2] || "success"

		// Extract content
		const contentRegex = /<tool_result[^>]*>([\s\S]*?)<\/tool_result>/
		const contentMatch = contentRegex.exec(xmlContent)

		let content: Array<ToolResultContentItem> = []

		if (contentMatch && contentMatch[1]) {
			// Extract text content (everything that's not in a tag)
			const textContent = contentMatch[1].replace(/<[^>]*>/g, "").trim()

			if (textContent) {
				content.push({
					type: "text",
					text: textContent,
				})
			}

			// Extract image content
			const imageRegex = /<image\s+type="([^"]+)"\s+data="([^"]+)"\s*\/>/g
			let imageMatch

			while ((imageMatch = imageRegex.exec(contentMatch[1])) !== null) {
				content.push({
					type: "image",
					source: {
						type: "base64",
						media_type: imageMatch[1],
						data: imageMatch[2],
					},
				})
			}
		}

		// Extract error if present
		const errorRegex = /<error\s+message="([^"]+)"(?:\s+details="([^"]+)")?\s*\/>/
		const errorMatch = errorRegex.exec(xmlContent)

		let error: { message: string; details?: unknown } | undefined = undefined

		if (errorMatch) {
			error = {
				message: errorMatch[1],
			}

			if (errorMatch[2]) {
				// Attempt to parse as JSON, otherwise keep as string
				try {
					const parsed: unknown = JSON.parse(errorMatch[2])
					error.details = parsed
				} catch {
					error.details = errorMatch[2]
				}
			}
		}

		// Create the JSON object
		const jsonObj: ToolResultJsonObject = {
			type: "tool_result",
			tool_use_id: toolUseId,
			content,
			status,
		}

		if (error) {
			jsonObj.error = error
		}

		return JSON.stringify(jsonObj)
	}

	return xmlContent
}

/**
 * Convert OpenAI function call format to neutral tool use format
 *
 * @param openAiFunctionCall OpenAI function call object
 * @returns Neutral tool use object
 */
export function openAiFunctionCallToNeutralToolUse(openAiFunctionCall: OpenAIFunctionCall): ToolUseJsonObject | null {
	if (openAiFunctionCall.function_call) {
		// Handle single function call
		let args: Record<string, unknown>
		try {
			const parsed = JSON.parse(openAiFunctionCall.function_call.arguments) as unknown
			if (typeof parsed === "object" && parsed !== null) {
				args = parsed as Record<string, unknown>
			} else {
				// If parsed result is not an object, treat as invalid and use raw
				args = { raw: openAiFunctionCall.function_call.arguments }
			}
		} catch {
			// If arguments can't be parsed, use as string
			args = { raw: openAiFunctionCall.function_call.arguments }
		}

		return {
			type: "tool_use",
			id: openAiFunctionCall.function_call.id || `function-${Date.now()}`,
			name: openAiFunctionCall.function_call.name,
			input: args,
		}
	} else if (openAiFunctionCall.tool_calls && Array.isArray(openAiFunctionCall.tool_calls)) {
		// Handle tool calls array (return first one for now)
		for (const toolCall of openAiFunctionCall.tool_calls) {
			if (toolCall.type === "function" && toolCall.function) {
				try {
					let args: Record<string, unknown>
					const parsed = JSON.parse(toolCall.function.arguments) as unknown
					if (typeof parsed === "object" && parsed !== null) {
						args = parsed as Record<string, unknown>
					} else {
						// If parsed result is not an object, treat as invalid and use raw
						args = { raw: toolCall.function.arguments }
					}

					return {
						type: "tool_use",
						id: toolCall.id || `function-${Date.now()}`,
						name: toolCall.function.name,
						input: args,
					}
				} catch {
					// If arguments can't be parsed, use as string
					return {
						type: "tool_use",
						id: toolCall.id || `function-${Date.now()}`,
						name: toolCall.function.name,
						input: { raw: toolCall.function.arguments as string },
					}
				}
			}
		}
	}

	return null
}

/**
 * Convert neutral tool use format to OpenAI function call format
 *
 * @param neutralToolUse Neutral tool use object
 * @returns OpenAI function call object
 */
export function neutralToolUseToOpenAiFunctionCall(neutralToolUse: ToolUseJsonObject): OpenAIFunctionCall | null {
	if (neutralToolUse.type === "tool_use" && neutralToolUse.name) {
		return {
			function_call: {
				id: neutralToolUse.id || `function-${Date.now()}`,
				name: neutralToolUse.name,
				arguments: JSON.stringify(neutralToolUse.input),
			},
		}
	}

	return null
}

/**
 * Tool Use Matcher - Detects and extracts tool use blocks from streaming text
 */
export class ToolUseMatcher<
	Result extends JsonMatcherResult | XmlMatcherResult = JsonMatcherResult | XmlMatcherResult,
> {
	private xmlMatcher: XmlMatcher
	private jsonMatcher: JsonMatcher
	private formatDetector: FormatDetector
	private detectedFormat: "json" | "xml" | "unknown" = "unknown"
	private toolUseIds: Map<string, string> = new Map()

	/**
	 * Create a new ToolUseMatcher
	 *
	 * @param transform Transform function for matched results
	 */
	constructor(readonly transform?: (result: XmlMatcherResult | JsonMatcherResult) => Result) {
		// Use a matcher for XML that can match any tool tag
		this.xmlMatcher = new XmlMatcher("")
		this.jsonMatcher = new JsonMatcher("tool_use")
		this.formatDetector = new FormatDetector()
	}

	/**
	 * Update the matcher with a new chunk of text
	 *
	 * @param chunk New text chunk to process
	 * @returns Array of matched results
	 */
	update(chunk: string): Result[] {
		// If format is unknown, try to detect it
		if (this.detectedFormat === "unknown") {
			this.detectedFormat = this.formatDetector.detectFormat(chunk)
		}

		let results: Result[] = []

		if (this.detectedFormat === "xml" || this.detectedFormat === "unknown") {
			const xmlResults = this.xmlMatcher.update(chunk)
			for (const result of xmlResults) {
				if (result.matched) {
					// Attempt to parse XML content to extract tool name
					const toolNameMatch = /<(\w+)>/.exec(result.data)
					if (
						toolNameMatch &&
						toolNameMatch[1] &&
						toolNameMatch[1] !== "think" &&
						toolNameMatch[1] !== "tool_result"
					) {
						const toolName = toolNameMatch[1]
						const toolId = `${toolName}-${Date.now()}`
						this.toolUseIds.set(toolName, toolId)
						results.push(
							this.transformResult({
								matched: true,
								data: result.data,
								type: "tool_use",
							}),
						)
					} else {
						results.push(this.transformResult(result))
					}
				} else {
					results.push(this.transformResult(result))
				}
			}
		} else if (this.detectedFormat === "json") {
			const jsonResults = this.jsonMatcher.update(chunk)
			for (const result of jsonResults) {
				if (
					result.matched &&
					typeof result.data === "object" &&
					(result.data as GenericParsedJson).type === "tool_use"
				) {
					const toolUseObj = result.data as ToolUseJsonObject
					const toolId = toolUseObj.id || `${toolUseObj.name}-${Date.now()}`
					this.toolUseIds.set(toolUseObj.name, toolId)
					results.push(
						this.transformResult({
							matched: true,
							data: toolUseObj,
							type: "tool_use",
						}),
					)
				} else {
					results.push(this.transformResult(result))
				}
			}
		}
		return results
	}

	/**
	 * Process any remaining content and return final results
	 *
	 * @param chunk Optional final chunk to process
	 * @returns Array of matched results
	 */
	final(chunk?: string): Result[] {
		if (chunk) {
			// If format is unknown, try to detect it
			if (this.detectedFormat === "unknown") {
				this.detectedFormat = this.formatDetector.detectFormat(chunk)
			}
		}

		// Use the appropriate matcher based on the detected format
		if (this.detectedFormat === "json") {
			return this.jsonMatcher.final(chunk).map((r) => this.transformResult(r))
		} else {
			// Default to XML matcher for 'xml' or 'unknown'
			return this.xmlMatcher.final(chunk).map((r) => this.transformResult(r))
		}
	}

	/**
	 * Apply the transform function to a result
	 *
	 * @param result Result to transform
	 * @returns Transformed result
	 */
	private transformResult(result: JsonMatcherResult | XmlMatcherResult): Result {
		if (!this.transform) {
			return result as Result
		}
		return this.transform(result)
	}

	/**
	 * Get the map of tool use IDs
	 *
	 * @returns Map of tool name to tool use ID
	 */
	getToolUseIds(): Map<string, string> {
		return this.toolUseIds
	}
}

/**
 * Tool Result Matcher - Detects and extracts tool result blocks from streaming text
 */
export class ToolResultMatcher<
	Result extends JsonMatcherResult | XmlMatcherResult = JsonMatcherResult | XmlMatcherResult,
> {
	private xmlMatcher: XmlMatcher
	private jsonMatcher: JsonMatcher
	private formatDetector: FormatDetector
	private detectedFormat: "json" | "xml" | "unknown" = "unknown"

	/**
	 * Create a new ToolResultMatcher
	 *
	 * @param toolUseIds Map of tool name to tool use ID
	 * @param transform Transform function for matched results
	 */
	constructor(
		readonly toolUseIds: Map<string, string>,
		readonly transform?: (result: XmlMatcherResult | JsonMatcherResult) => Result,
	) {
		this.xmlMatcher = new XmlMatcher("tool_result")
		this.jsonMatcher = new JsonMatcher("tool_result")
		this.formatDetector = new FormatDetector()
	}

	/**
	 * Update the matcher with a new chunk of text
	 *
	 * @param chunk New text chunk to process
	 * @returns Array of matched results
	 */
	update(chunk: string): Result[] {
		// If format is unknown, try to detect it
		if (this.detectedFormat === "unknown") {
			this.detectedFormat = this.formatDetector.detectFormat(chunk)
		}

		let results: Result[] = []

		// For XML format, we need to extract tool result blocks manually
		if (this.detectedFormat === "xml" || this.detectedFormat === "unknown") {
			// Look for tool result patterns in XML
			const toolResultRegex =
				/<tool_result\s+tool_use_id="([^"]+)"(?:\s+status="([^"]+)")?>[\s\S]*?<\/tool_result>/g
			let match
			let lastIndex = 0
			const matches: { start: number; end: number; content: string; toolUseId: string }[] = []

			// Find all tool result blocks
			while ((match = toolResultRegex.exec(chunk)) !== null) {
				const toolUseId = match[1]
				matches.push({
					start: match.index,
					end: match.index + match[0].length,
					content: match[0],
					toolUseId,
				})
			}

			// Process matches and non-matches
			for (let i = 0; i < matches.length; i++) {
				const match = matches[i]

				// Process text before this match
				if (match.start > lastIndex) {
					const textBefore = chunk.substring(lastIndex, match.start)
					results.push(
						this.transformResult({
							matched: false,
							data: textBefore,
						}),
					)
				}

				// Process the tool result block
				results.push(
					this.transformResult({
						matched: true,
						data: match.content,
						type: "tool_result",
					}),
				)

				lastIndex = match.end
			}

			// Process any remaining text
			if (lastIndex < chunk.length) {
				results.push(
					this.transformResult({
						matched: false,
						data: chunk.substring(lastIndex),
					}),
				)
			}

			return results
		}

		// For JSON format, use the JsonMatcher
		if (this.detectedFormat === "json") {
			return this.jsonMatcher.update(chunk).map((r) => this.transformResult(r))
		} else {
			// Default to XML matcher for 'xml' or 'unknown'
			return this.xmlMatcher.update(chunk).map((r) => this.transformResult(r))
		}
	}

	/**
	 * Process any remaining content and return final results
	 *
	 * @param chunk Optional final chunk to process
	 * @returns Array of matched results
	 */
	final(chunk?: string): Result[] {
		if (chunk) {
			// If format is unknown, try to detect it
			if (this.detectedFormat === "unknown") {
				this.detectedFormat = this.formatDetector.detectFormat(chunk)
			}
		}

		// Use the appropriate matcher based on the detected format
		if (this.detectedFormat === "json") {
			return this.jsonMatcher.final(chunk).map((r) => this.transformResult(r))
		} else {
			// Default to XML matcher for 'xml' or 'unknown'
			return this.xmlMatcher.final(chunk).map((r) => this.transformResult(r))
		}
	}

	/**
	 * Apply the transform function to a result
	 *
	 * @param result Result to transform
	 * @returns Transformed result
	 */
	private transformResult(result: JsonMatcherResult | XmlMatcherResult): Result {
		if (!this.transform) {
			return result as Result
		}
		return this.transform(result)
	}
}

/**
 * Hybrid matcher that can handle both XML and JSON formats
 */
export class HybridMatcher<Result extends JsonMatcherResult | XmlMatcherResult = JsonMatcherResult | XmlMatcherResult> {
	private xmlMatcher: XmlMatcher
	private jsonMatcher: JsonMatcher
	private formatDetector: FormatDetector
	private detectedFormat: "json" | "xml" | "unknown" = "unknown"
	private toolUseIds: Map<string, string> = new Map()
	private toolUseMatcher: ToolUseMatcher<Result> | null = null
	private toolResultMatcher: ToolResultMatcher<Result> | null = null

	/**
	 * Create a new HybridMatcher
	 *
	 * @param tagName XML tag name to match
	 * @param jsonType JSON type to match
	 * @param transform Transform function for matched results
	 * @param matchToolUse Whether to match tool use blocks (default: false)
	 * @param matchToolResult Whether to match tool result blocks (default: false)
	 */
	constructor(
		readonly tagName: string,
		readonly jsonType: string,
		readonly transform?: (result: XmlMatcherResult | JsonMatcherResult) => Result,
		readonly matchToolUse: boolean = false,
		readonly matchToolResult: boolean = false,
	) {
		this.xmlMatcher = new XmlMatcher(tagName)
		this.jsonMatcher = new JsonMatcher(jsonType)
		this.formatDetector = new FormatDetector()

		// Initialize specialized matchers if needed
		if (matchToolUse) {
			this.toolUseMatcher = new ToolUseMatcher(this.transform)
		}

		if (matchToolResult && this.toolUseMatcher) {
			this.toolResultMatcher = new ToolResultMatcher(this.toolUseMatcher.getToolUseIds(), this.transform)
		}
	}

	/**
	 * Update the matcher with a new chunk of text
	 *
	 * @param chunk New text chunk to process
	 * @returns Array of matched results
	 */
	update(chunk: string): Result[] {
		// If format is unknown, try to detect it
		if (this.detectedFormat === "unknown") {
			this.detectedFormat = this.formatDetector.detectFormat(chunk)
		}

		let results: Result[] = []

		// Special handling for thinking blocks
		if (this.tagName === "think" && this.jsonType === "thinking") {
			if (this.detectedFormat === "xml" || this.detectedFormat === "unknown") {
				const xmlResults = this.xmlMatcher.update(chunk)
				for (const result of xmlResults) {
					if (result.matched) {
						results.push(
							this.transformResult({
								matched: true,
								data: result.data,
								type: "reasoning",
							}),
						)
					} else {
						results.push(this.transformResult(result))
					}
				}
			} else if (this.detectedFormat === "json") {
				const jsonResults = this.jsonMatcher.update(chunk)
				for (const result of jsonResults) {
					if (
						result.matched &&
						typeof result.data === "object" &&
						(result.data as GenericParsedJson).type === "thinking"
					) {
						results.push(
							this.transformResult({
								matched: true,
								data: (result.data as ThinkingJsonObject).content,
								type: "reasoning",
							}),
						)
					} else {
						results.push(this.transformResult(result))
					}
				}
			}
			return results
		}

		// Process with specialized matchers if enabled
		if (this.matchToolUse && this.toolUseMatcher) {
			const toolUseResults = this.toolUseMatcher.update(chunk)
			if (toolUseResults.length > 0) {
				results = [...results, ...toolUseResults]
			}

			// Create a new ToolResultMatcher with updated tool use IDs if needed
			if (this.toolResultMatcher && this.toolUseMatcher.getToolUseIds().size > 0) {
				this.toolResultMatcher = new ToolResultMatcher(this.toolUseMatcher.getToolUseIds(), this.transform)
			}
		}

		if (this.matchToolResult && this.toolResultMatcher) {
			const toolResultResults = this.toolResultMatcher.update(chunk)
			if (toolResultResults.length > 0) {
				results = [...results, ...toolResultResults]
			}
		}

		// If no specialized matchers or no results from them, use standard matchers
		if (results.length === 0) {
			// Use the appropriate matcher based on the detected format
			if (this.detectedFormat === "json") {
				results = this.jsonMatcher.update(chunk).map((r) => this.transformResult(r))
			} else {
				// Default to XML matcher for 'xml' or 'unknown'
				results = this.xmlMatcher.update(chunk).map((r) => this.transformResult(r))
			}
		}

		return results
	}

	/**
	 * Process any remaining content and return final results
	 *
	 * @param chunk Optional final chunk to process
	 * @returns Array of matched results
	 */
	final(chunk?: string): Result[] {
		if (chunk) {
			// If format is unknown, try to detect it
			if (this.detectedFormat === "unknown") {
				this.detectedFormat = this.formatDetector.detectFormat(chunk)
			}
		}

		let results: Result[] = []

		// Process with specialized matchers if enabled
		if (this.matchToolUse && this.toolUseMatcher) {
			const toolUseResults = this.toolUseMatcher.final(chunk)
			if (toolUseResults.length > 0) {
				results = [...results, ...toolUseResults]
			}
		}

		if (this.matchToolResult && this.toolResultMatcher) {
			const toolResultResults = this.toolResultMatcher.final(chunk)
			if (toolResultResults.length > 0) {
				results = [...results, ...toolResultResults]
			}
		}

		// If no specialized matchers or no results from them, use standard matchers
		if (results.length === 0) {
			// Use the appropriate matcher based on the detected format
			if (this.detectedFormat === "json") {
				results = this.jsonMatcher.final(chunk).map((r) => this.transformResult(r))
			} else {
				// Default to XML matcher for 'xml' or 'unknown'
				return this.xmlMatcher.final(chunk).map((r) => this.transformResult(r))
			}
		}

		return results
	}

	/**
	 * Apply the transform function to a result
	 *
	 * @param result Result to transform
	 * @returns Transformed result
	 */
	private transformResult(result: JsonMatcherResult | XmlMatcherResult): Result {
		if (!this.transform) {
			return result as Result
		}
		return this.transform(result)
	}

	/**
	 * Get the map of tool use IDs
	 *
	 * @returns Map of tool name to tool use ID
	 */
	public getToolUseIds(): Map<string, string> {
		if (this.toolUseMatcher) {
			return this.toolUseMatcher.getToolUseIds()
		}
		return this.toolUseIds
	}
}
