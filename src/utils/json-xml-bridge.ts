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

import { XmlMatcher, XmlMatcherResult } from './xml-matcher';

/**
 * Result from the JsonMatcher
 */
export interface JsonMatcherResult {
  matched: boolean;
  data: string | object;
  type?: string;
}

/**
 * JsonMatcher - Similar to XmlMatcher but for JSON objects in streaming text
 * 
 * This class detects and extracts JSON objects from streaming text, particularly
 * focusing on reasoning/thinking blocks and tool usage.
 */
export class JsonMatcher<Result = JsonMatcherResult> {
  private buffer = '';
  private objectDepth = 0;
  private inString = false;
  private escapeNext = false;
  
  /**
   * Create a new JsonMatcher
   * 
   * @param matchType The type of JSON object to match (e.g., "thinking", "tool_use")
   * @param transform Optional function to transform matched results
   */
  constructor(
    readonly matchType: string,
    readonly transform?: (result: JsonMatcherResult) => Result
  ) {}
  
  /**
   * Update the matcher with a new chunk of text
   * 
   * @param chunk New text chunk to process
   * @returns Array of matched results
   */
  update(chunk: string): Result[] {
    this.buffer += chunk;
    return this.processBuffer();
  }
  
  /**
   * Process any remaining content and return final results
   * 
   * @param chunk Optional final chunk to process
   * @returns Array of matched results
   */
  final(chunk?: string): Result[] {
    if (chunk) {
      this.buffer += chunk;
    }
    
    const results = this.processBuffer();
    
    // If there's any remaining text, treat it as non-matched
    if (this.buffer.trim()) {
      const textResult: JsonMatcherResult = {
        matched: false,
        data: this.buffer
      };
      
      this.buffer = '';
      
      if (!this.transform) {
        return [textResult as unknown as Result];
      }
      return [this.transform(textResult)];
    }
    
    return results;
  }
  
  /**
   * Process the current buffer to extract JSON objects
   * 
   * @returns Array of matched results
   */
  private processBuffer(): Result[] {
    const results: Result[] = [];
    let startIndex = 0;
    
    while (startIndex < this.buffer.length) {
      // Look for the start of a JSON object
      const objectStart = this.buffer.indexOf('{', startIndex);
      
      if (objectStart === -1) {
        // No more JSON objects in buffer
        if (startIndex < this.buffer.length) {
          // Process remaining text as non-matched
          const text = this.buffer.substring(startIndex);
          const textResult: JsonMatcherResult = {
            matched: false,
            data: text
          };
          
          results.push(this.transformResult(textResult));
          this.buffer = '';
        }
        break;
      }
      
      // Process text before JSON object as non-matched
      if (objectStart > startIndex) {
        const text = this.buffer.substring(startIndex, objectStart);
        const textResult: JsonMatcherResult = {
          matched: false,
          data: text
        };
        
        results.push(this.transformResult(textResult));
      }
      
      // Find the end of the JSON object
      const objectEnd = this.findObjectEnd(objectStart);
      if (objectEnd === -1) {
        // Incomplete JSON object, wait for more chunks
        this.buffer = this.buffer.substring(startIndex);
        break;
      }
      
      // Process JSON object
      const jsonStr = this.buffer.substring(objectStart, objectEnd + 1);
      try {
        const jsonObj = JSON.parse(jsonStr);
        
        // Check if this is a matching object type
        if (jsonObj.type === this.matchType) {
          const matchedResult: JsonMatcherResult = {
            matched: true,
            data: jsonObj.content || jsonObj.text || jsonObj,
            type: this.matchType
          };
          
          results.push(this.transformResult(matchedResult));
        } else {
          // Not a matching object, treat as non-matched
          const textResult: JsonMatcherResult = {
            matched: false,
            data: jsonStr
          };
          
          results.push(this.transformResult(textResult));
        }
      } catch (e) {
        // Invalid JSON, treat as text
        const textResult: JsonMatcherResult = {
          matched: false,
          data: jsonStr
        };
        
        results.push(this.transformResult(textResult));
      }
      
      startIndex = objectEnd + 1;
    }
    
    // Update buffer to contain only unprocessed text
    this.buffer = this.buffer.substring(startIndex);
    
    return results;
  }
  
  /**
   * Find the matching closing brace for a JSON object
   * 
   * @param start Starting index of the opening brace
   * @returns Index of the matching closing brace, or -1 if not found
   */
  private findObjectEnd(start: number): number {
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = start; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !inString) {
        inString = true;
      } else if (char === '"' && inString) {
        inString = false;
      } else if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }
    
    return -1; // Incomplete object
  }
  
  /**
   * Apply the transform function to a result
   * 
   * @param result Result to transform
   * @returns Transformed result
   */
  private transformResult(result: JsonMatcherResult): Result {
    if (!this.transform) {
      return result as unknown as Result;
    }
    return this.transform(result);
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
  detectFormat(content: string): 'json' | 'xml' | 'unknown' {
    // Check for XML pattern
    if (content.includes('<think>') || content.match(/<\w+>/) || content.includes('<tool_result>')) {
      return 'xml';
    }
    
    // Check for JSON pattern
    if (content.includes('{') && content.includes('}')) {
      try {
        // Try to parse a sample to confirm it's JSON
        const startIndex = content.indexOf('{');
        const endIndex = content.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          const sample = content.substring(startIndex, endIndex + 1);
          const jsonObj = JSON.parse(sample);
          
          // Check if it's a tool use or tool result JSON
          if (jsonObj.type === 'tool_use' || jsonObj.type === 'tool_result' ||
              jsonObj.type === 'thinking') {
            return 'json';
          }
          
          // Check for OpenAI function calling format
          if (jsonObj.tool_calls || jsonObj.function_call) {
            return 'json';
          }
          
          return 'json';
        }
      } catch (e) {
        // Not valid JSON
      }
    }
    
    return 'unknown';
  }
}

/**
 * Convert JSON thinking format to XML format
 * 
 * @param jsonObj JSON object with thinking content
 * @returns XML string with thinking tags
 */
export function jsonThinkingToXml(jsonObj: any): string {
  if (typeof jsonObj === 'object' && jsonObj.type === 'thinking' && jsonObj.content) {
    return `<think>${jsonObj.content}</think>`;
  }
  return JSON.stringify(jsonObj);
}

/**
 * Convert XML thinking format to JSON format
 * 
 * @param xmlContent XML string with thinking tags
 * @returns JSON object with thinking content
 */
export function xmlThinkingToJson(xmlContent: string): string {
  const thinkRegex = /<think>(.*?)<\/think>/s;
  const match = thinkRegex.exec(xmlContent);
  
  if (match && match[1]) {
    return JSON.stringify({
      type: 'thinking',
      content: match[1]
    });
  }
  
  return xmlContent;
}

/**
 * Convert JSON tool use format to XML format
 *
 * @param jsonObj JSON object with tool use content
 * @returns XML string with tool use tags
 */
export function jsonToolUseToXml(jsonObj: any): string {
  if (typeof jsonObj === 'object' && jsonObj.type === 'tool_use' && jsonObj.name) {
    // Create the opening tool tag with the tool name
    let xml = `<${jsonObj.name}>\n`;
    
    // Add parameter tags
    if (jsonObj.input && typeof jsonObj.input === 'object') {
      for (const [key, value] of Object.entries(jsonObj.input)) {
        // Handle different types of values
        let stringValue: string;
        if (typeof value === 'object') {
          stringValue = JSON.stringify(value);
        } else {
          stringValue = String(value);
        }
        xml += `<${key}>${stringValue}</${key}>\n`;
      }
    }
    
    // Add closing tool tag
    xml += `</${jsonObj.name}>`;
    
    return xml;
  }
  return JSON.stringify(jsonObj);
}

/**
 * Convert XML tool use format to JSON format
 *
 * @param xmlContent XML string with tool use tags
 * @returns JSON object with tool use content
 */
export function xmlToolUseToJson(xmlContent: string): string {
  // Extract the tool name from the opening tag
  const toolNameRegex = /<(\w+)>/;
  const toolNameMatch = toolNameRegex.exec(xmlContent);
  
  if (toolNameMatch && toolNameMatch[1]) {
    const toolName = toolNameMatch[1];
    
    // Extract parameters using a more specific regex that handles nested content better
    const params: Record<string, any> = {};
    
    // Look for each parameter tag within the tool tag
    const paramPattern = new RegExp(`<(\\w+)>(.*?)<\\/${toolName}>`, 'gs');
    let outerContent = xmlContent;
    
    // First, remove the outer tool tag to simplify parsing
    outerContent = outerContent.replace(new RegExp(`<${toolName}>\\s*`), '');
    outerContent = outerContent.replace(new RegExp(`\\s*</${toolName}>`), '');
    
    // Now parse each parameter
    const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let match;
    
    while ((match = paramRegex.exec(outerContent)) !== null) {
      const paramName = match[1];
      const paramValue = match[2].trim();
      
      // Skip if the param name is the same as the tool name (outer tag)
      if (paramName !== toolName) {
        // Try to parse as JSON if possible
        // Always keep values as strings for XML parameters
        params[paramName] = paramValue;
      }
    }
    
    // Create the JSON object
    const jsonObj = {
      type: 'tool_use',
      name: toolName,
      id: `${toolName}-${Date.now()}`, // Generate a unique ID
      input: params
    };
    
    return JSON.stringify(jsonObj);
  }
  
  return xmlContent;
}

/**
 * Convert JSON tool result format to XML format
 *
 * @param jsonObj JSON object with tool result content
 * @returns XML string with tool result tags
 */
export function jsonToolResultToXml(jsonObj: any): string {
  if (typeof jsonObj === 'object' && jsonObj.type === 'tool_result' && jsonObj.tool_use_id) {
    // Create the opening tool result tag
    let xml = `<tool_result tool_use_id="${jsonObj.tool_use_id}"`;
    
    // Add status if present
    if (jsonObj.status) {
      xml += ` status="${jsonObj.status}"`;
    }
    
    xml += '>\n';
    
    // Add content
    if (Array.isArray(jsonObj.content)) {
      for (const item of jsonObj.content) {
        if (item.type === 'text') {
          xml += `${item.text}\n`;
        } else if (item.type === 'image') {
          xml += `<image type="${item.source.media_type}" data="${item.source.data}" />\n`;
        }
      }
    }
    
    // Add error if present
    if (jsonObj.error) {
      xml += `<error message="${jsonObj.error.message}"`;
      if (jsonObj.error.details) {
        // Escape quotes in the JSON string
        const escapedDetails = JSON.stringify(jsonObj.error.details).replace(/"/g, '&quot;');
        xml += ` details="${escapedDetails}"`;
      }
      xml += ' />\n';
    }
    
    // Add closing tool result tag
    xml += '</tool_result>';
    
    return xml;
  }
  return JSON.stringify(jsonObj);
}

/**
 * Convert XML tool result format to JSON format
 *
 * @param xmlContent XML string with tool result tags
 * @returns JSON object with tool result content
 */
export function xmlToolResultToJson(xmlContent: string): string {
  // Extract the tool result attributes
  const toolResultRegex = /<tool_result\s+tool_use_id="([^"]+)"(?:\s+status="([^"]+)")?>/;
  const toolResultMatch = toolResultRegex.exec(xmlContent);
  
  if (toolResultMatch) {
    const toolUseId = toolResultMatch[1];
    const status = toolResultMatch[2] || 'success';
    
    // Extract content
    const contentRegex = /<tool_result[^>]*>([\s\S]*?)<\/tool_result>/;
    const contentMatch = contentRegex.exec(xmlContent);
    
    let content: Array<any> = [];
    
    if (contentMatch && contentMatch[1]) {
      // Extract text content (everything that's not in a tag)
      const textContent = contentMatch[1].replace(/<[^>]*>/g, '').trim();
      
      if (textContent) {
        content.push({
          type: 'text',
          text: textContent
        });
      }
      
      // Extract image content
      const imageRegex = /<image\s+type="([^"]+)"\s+data="([^"]+)"\s*\/>/g;
      let imageMatch;
      
      while ((imageMatch = imageRegex.exec(contentMatch[1])) !== null) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageMatch[1],
            data: imageMatch[2]
          }
        });
      }
    }
    
    // Extract error if present
    const errorRegex = /<error\s+message="([^"]+)"(?:\s+details="([^"]+)")?\s*\/>/;
    const errorMatch = errorRegex.exec(xmlContent);
    
    let error: { message: string; details?: any } | undefined = undefined;
    
    if (errorMatch) {
      error = {
        message: errorMatch[1]
      };
      
      if (errorMatch[2]) {
        try {
          // Replace HTML entities with actual quotes before parsing
          const unescapedDetails = errorMatch[2].replace(/&quot;/g, '"');
          error.details = JSON.parse(unescapedDetails);
        } catch (e) {
          error.details = errorMatch[2];
        }
      }
    }
    
    // Create the JSON object
    const jsonObj: {
      type: string;
      tool_use_id: string;
      content: any[];
      status: string;
      error?: { message: string; details?: any };
    } = {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      status
    };
    
    if (error) {
      jsonObj.error = error;
    }
    
    return JSON.stringify(jsonObj);
  }
  
  return xmlContent;
}

/**
 * Convert OpenAI function call format to neutral tool use format
 *
 * @param openAiFunctionCall OpenAI function call object
 * @returns Neutral tool use object
 */
export function openAiFunctionCallToNeutralToolUse(openAiFunctionCall: any): any {
  if (openAiFunctionCall.function_call) {
    // Handle single function call
    try {
      const args = JSON.parse(openAiFunctionCall.function_call.arguments);
      
      return {
        type: 'tool_use',
        id: openAiFunctionCall.function_call.id || `function-${Date.now()}`,
        name: openAiFunctionCall.function_call.name,
        input: args
      };
    } catch (e) {
      // If arguments can't be parsed, use as string
      return {
        type: 'tool_use',
        id: openAiFunctionCall.function_call.id || `function-${Date.now()}`,
        name: openAiFunctionCall.function_call.name,
        input: { raw: openAiFunctionCall.function_call.arguments }
      };
    }
  } else if (openAiFunctionCall.tool_calls && Array.isArray(openAiFunctionCall.tool_calls)) {
    // Handle tool calls array (return first one for now)
    for (const toolCall of openAiFunctionCall.tool_calls) {
      if (toolCall.type === 'function' && toolCall.function) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          
          return {
            type: 'tool_use',
            id: toolCall.id || `function-${Date.now()}`,
            name: toolCall.function.name,
            input: args
          };
        } catch (e) {
          // If arguments can't be parsed, use as string
          return {
            type: 'tool_use',
            id: toolCall.id || `function-${Date.now()}`,
            name: toolCall.function.name,
            input: { raw: toolCall.function.arguments }
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Convert neutral tool use format to OpenAI function call format
 *
 * @param neutralToolUse Neutral tool use object
 * @returns OpenAI function call object
 */
export function neutralToolUseToOpenAiFunctionCall(neutralToolUse: any): any {
  if (neutralToolUse.type === 'tool_use' && neutralToolUse.name) {
    return {
      id: neutralToolUse.id || `function-${Date.now()}`,
      type: 'function',
      function: {
        name: neutralToolUse.name,
        arguments: JSON.stringify(neutralToolUse.input)
      }
    };
  }
  
  return null;
}

/**
 * Tool Use Matcher - Detects and extracts tool use blocks from streaming text
 */
export class ToolUseMatcher<Result = JsonMatcherResult | XmlMatcherResult> {
  private xmlMatcher: XmlMatcher;
  private jsonMatcher: JsonMatcher;
  private formatDetector: FormatDetector;
  private detectedFormat: 'json' | 'xml' | 'unknown' = 'unknown';
  private toolUseIds: Map<string, string> = new Map();
  
  /**
   * Create a new ToolUseMatcher
   *
   * @param transform Transform function for matched results
   */
  constructor(
    readonly transform?: (result: XmlMatcherResult | JsonMatcherResult) => Result
  ) {
    // Use a matcher for XML that can match any tool tag
    this.xmlMatcher = new XmlMatcher('', transform as any);
    this.jsonMatcher = new JsonMatcher('tool_use', transform as any);
    this.formatDetector = new FormatDetector();
  }
  
  /**
   * Update the matcher with a new chunk of text
   *
   * @param chunk New text chunk to process
   * @returns Array of matched results
   */
  update(chunk: string): Result[] {
    // If format is unknown, try to detect it
    if (this.detectedFormat === 'unknown') {
      this.detectedFormat = this.formatDetector.detectFormat(chunk);
    }
    
    let results: Result[] = [];
    
    // For XML format, we need to extract tool use blocks manually
    if (this.detectedFormat === 'xml' || this.detectedFormat === 'unknown') {
      // Look for tool use patterns in XML
      const toolUseRegex = /<(\w+)>\s*(?:<[^>]+>[^<]*<\/[^>]+>\s*)*<\/\1>/gs;
      let match;
      let lastIndex = 0;
      const matches: { start: number; end: number; content: string; toolName: string }[] = [];
      
      // Find all potential tool use blocks
      while ((match = toolUseRegex.exec(chunk)) !== null) {
        const toolName = match[1];
        // Skip if it's a known non-tool tag like 'think'
        if (toolName !== 'think' && toolName !== 'tool_result') {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            content: match[0],
            toolName
          });
        }
      }
      
      // Process matches and non-matches
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        // Process text before this match
        if (match.start > lastIndex) {
          const textBefore = chunk.substring(lastIndex, match.start);
          results.push({
            matched: false,
            data: textBefore
          } as unknown as Result);
        }
        
        // Process the tool use block
        const toolId = `${match.toolName}-${Date.now()}`;
        this.toolUseIds.set(match.toolName, toolId);
        
        results.push({
          matched: true,
          data: match.content,
          type: 'tool_use'
        } as unknown as Result);
        
        lastIndex = match.end;
      }
      
      // Process any remaining text
      if (lastIndex < chunk.length) {
        results.push({
          matched: false,
          data: chunk.substring(lastIndex)
        } as unknown as Result);
      }
      
      // Apply transform if provided
      if (this.transform) {
        results = results.map(r => this.transform!(r as any)) as Result[];
      }
    } else {
      // For JSON format, we need to look for tool use JSON objects
      // First, try to parse the entire chunk as JSON
      try {
        const jsonObj = JSON.parse(chunk);
        if (jsonObj.type === 'tool_use' && jsonObj.name) {
          // Store the tool use ID
          if (jsonObj.id) {
            this.toolUseIds.set(jsonObj.name, jsonObj.id);
          } else {
            const toolId = `${jsonObj.name}-${Date.now()}`;
            this.toolUseIds.set(jsonObj.name, toolId);
          }
          
          // Add the matched result
          results.push({
            matched: true,
            data: jsonObj,
            type: 'tool_use'
          } as unknown as Result);
          
          return results;
        }
      } catch (e) {
        // Not a complete JSON object, try to find JSON objects in the text
      }
      
      // Look for JSON objects in the text
      const toolUseRegex = /\{"type":"tool_use"[^}]*\}/g;
      let match;
      
      while ((match = toolUseRegex.exec(chunk)) !== null) {
        try {
          const toolUseObj = JSON.parse(match[0]);
          if (toolUseObj.type === 'tool_use' && toolUseObj.name) {
            // Store the tool use ID
            if (toolUseObj.id) {
              this.toolUseIds.set(toolUseObj.name, toolUseObj.id);
            } else {
              const toolId = `${toolUseObj.name}-${Date.now()}`;
              this.toolUseIds.set(toolUseObj.name, toolId);
            }
            
            // Add the matched result
            results.push({
              matched: true,
              data: toolUseObj,
              type: 'tool_use'
            } as unknown as Result);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      // If no tool use objects were found, use the standard JsonMatcher
      if (results.length === 0) {
        const jsonResults = this.jsonMatcher.update(chunk) as Result[];
        results = jsonResults;
      }
    }
    
    return results;
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
      if (this.detectedFormat === 'unknown') {
        this.detectedFormat = this.formatDetector.detectFormat(chunk);
      }
    }
    
    // Use the appropriate matcher based on the detected format
    if (this.detectedFormat === 'json') {
      return this.jsonMatcher.final(chunk) as Result[];
    } else {
      // Default to XML matcher for 'xml' or 'unknown'
      return this.xmlMatcher.final(chunk) as Result[];
    }
  }
  
  /**
   * Get the map of tool use IDs
   *
   * @returns Map of tool name to tool use ID
   */
  getToolUseIds(): Map<string, string> {
    return this.toolUseIds;
  }
}

/**
 * Tool Result Matcher - Detects and extracts tool result blocks from streaming text
 */
export class ToolResultMatcher<Result = JsonMatcherResult | XmlMatcherResult> {
  private xmlMatcher: XmlMatcher;
  private jsonMatcher: JsonMatcher;
  private formatDetector: FormatDetector;
  private detectedFormat: 'json' | 'xml' | 'unknown' = 'unknown';
  
  /**
   * Create a new ToolResultMatcher
   *
   * @param toolUseIds Map of tool name to tool use ID
   * @param transform Transform function for matched results
   */
  constructor(
    readonly toolUseIds: Map<string, string>,
    readonly transform?: (result: XmlMatcherResult | JsonMatcherResult) => Result
  ) {
    this.xmlMatcher = new XmlMatcher('tool_result', transform as any);
    this.jsonMatcher = new JsonMatcher('tool_result', transform as any);
    this.formatDetector = new FormatDetector();
  }
  
  /**
   * Update the matcher with a new chunk of text
   *
   * @param chunk New text chunk to process
   * @returns Array of matched results
   */
  update(chunk: string): Result[] {
    // If format is unknown, try to detect it
    if (this.detectedFormat === 'unknown') {
      this.detectedFormat = this.formatDetector.detectFormat(chunk);
    }
    
    let results: Result[] = [];
    
    // For XML format, we need to extract tool result blocks manually
    if (this.detectedFormat === 'xml' || this.detectedFormat === 'unknown') {
      // Look for tool result patterns in XML
      const toolResultRegex = /<tool_result\s+tool_use_id="([^"]+)"(?:\s+status="([^"]+)")?>[\s\S]*?<\/tool_result>/g;
      let match;
      let lastIndex = 0;
      const matches: { start: number; end: number; content: string; toolUseId: string }[] = [];
      
      // Find all tool result blocks
      while ((match = toolResultRegex.exec(chunk)) !== null) {
        const toolUseId = match[1];
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[0],
          toolUseId
        });
      }
      
      // Process matches and non-matches
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        // Process text before this match
        if (match.start > lastIndex) {
          const textBefore = chunk.substring(lastIndex, match.start);
          results.push({
            matched: false,
            data: textBefore
          } as unknown as Result);
        }
        
        // Process the tool result block
        results.push({
          matched: true,
          data: match.content,
          type: 'tool_result'
        } as unknown as Result);
        
        lastIndex = match.end;
      }
      
      // Process any remaining text
      if (lastIndex < chunk.length) {
        results.push({
          matched: false,
          data: chunk.substring(lastIndex)
        } as unknown as Result);
      }
      
      // Apply transform if provided
      if (this.transform) {
        results = results.map(r => this.transform!(r as any)) as Result[];
      }
      
      if (results.length > 0) {
        return results;
      }
    }
    
    // For JSON format, use the JsonMatcher
    if (this.detectedFormat === 'json') {
      return this.jsonMatcher.update(chunk) as Result[];
    } else {
      // Default to XML matcher for 'xml' or 'unknown'
      return this.xmlMatcher.update(chunk) as Result[];
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
      if (this.detectedFormat === 'unknown') {
        this.detectedFormat = this.formatDetector.detectFormat(chunk);
      }
    }
    
    // Use the appropriate matcher based on the detected format
    if (this.detectedFormat === 'json') {
      return this.jsonMatcher.final(chunk) as Result[];
    } else {
      // Default to XML matcher for 'xml' or 'unknown'
      return this.xmlMatcher.final(chunk) as Result[];
    }
  }
}

/**
 * Hybrid matcher that can handle both XML and JSON formats
 */
export class HybridMatcher<Result = XmlMatcherResult | JsonMatcherResult> {
  private xmlMatcher: XmlMatcher;
  private jsonMatcher: JsonMatcher;
  private formatDetector: FormatDetector;
  private detectedFormat: 'json' | 'xml' | 'unknown' = 'unknown';
  private toolUseIds: Map<string, string> = new Map();
  private toolUseMatcher: ToolUseMatcher | null = null;
  private toolResultMatcher: ToolResultMatcher | null = null;
  
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
    readonly matchToolResult: boolean = false
  ) {
    this.xmlMatcher = new XmlMatcher(tagName, transform as any);
    this.jsonMatcher = new JsonMatcher(jsonType, transform as any);
    this.formatDetector = new FormatDetector();
    
    // Initialize specialized matchers if needed
    if (matchToolUse) {
      this.toolUseMatcher = new ToolUseMatcher(transform as any);
    }
    
    if (matchToolResult && this.toolUseMatcher) {
      this.toolResultMatcher = new ToolResultMatcher(
        this.toolUseMatcher.getToolUseIds(),
        transform as any
      );
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
    if (this.detectedFormat === 'unknown') {
      this.detectedFormat = this.formatDetector.detectFormat(chunk);
    }
    
    let results: Result[] = [];
    
    // Special handling for thinking blocks
    if (this.tagName === 'think' && this.jsonType === 'thinking') {
      // Check for XML thinking blocks
      if (chunk.includes('<think>')) {
        const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
        let match;
        let lastIndex = 0;
        const matches: { start: number; end: number; content: string }[] = [];
        
        // Find all thinking blocks
        while ((match = thinkRegex.exec(chunk)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            content: match[1]
          });
        }
        
        // Process matches and non-matches
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          
          // Process text before this match
          if (match.start > lastIndex) {
            const textBefore = chunk.substring(lastIndex, match.start);
            results.push({
              matched: false,
              data: textBefore
            } as unknown as Result);
          }
          
          // Process the thinking block
          results.push({
            matched: true,
            data: match.content,
            type: 'reasoning'
          } as unknown as Result);
          
          lastIndex = match.end;
        }
        
        // Process any remaining text
        if (lastIndex < chunk.length) {
          results.push({
            matched: false,
            data: chunk.substring(lastIndex)
          } as unknown as Result);
        }
        
        // Apply transform if provided
        if (this.transform) {
          results = results.map(r => this.transform!(r as any)) as Result[];
        }
        
        return results;
      }
      
      // Check for JSON thinking blocks
      if (chunk.includes('{"type":"thinking"')) {
        // Process JSON thinking blocks
        const jsonContent = chunk;
        let startIndex = 0;
        
        // Find all JSON thinking blocks and surrounding text
        while (startIndex < jsonContent.length) {
          const jsonStart = jsonContent.indexOf('{"type":"thinking"', startIndex);
          
          if (jsonStart === -1) {
            // No more JSON objects, add remaining text
            if (startIndex < jsonContent.length) {
              results.push({
                matched: false,
                data: jsonContent.substring(startIndex)
              } as unknown as Result);
            }
            break;
          }
          
          // Add text before JSON object
          if (jsonStart > startIndex) {
            results.push({
              matched: false,
              data: jsonContent.substring(startIndex, jsonStart)
            } as unknown as Result);
          }
          
          // Find the end of the JSON object
          let jsonEnd = jsonStart;
          let braceCount = 0;
          let inString = false;
          
          for (let i = jsonStart; i < jsonContent.length; i++) {
            const char = jsonContent[i];
            
            if (char === '"' && jsonContent[i-1] !== '\\') {
              inString = !inString;
            } else if (!inString) {
              if (char === '{') braceCount++;
              else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  jsonEnd = i + 1;
                  break;
                }
              }
            }
          }
          
          // Process the JSON object
          try {
            const jsonObj = JSON.parse(jsonContent.substring(jsonStart, jsonEnd));
            if (jsonObj.type === 'thinking' && jsonObj.content) {
              results.push({
                matched: true,
                data: jsonObj.content,
                type: 'reasoning'
              } as unknown as Result);
            } else {
              results.push({
                matched: false,
                data: jsonContent.substring(jsonStart, jsonEnd)
              } as unknown as Result);
            }
          } catch (e) {
            results.push({
              matched: false,
              data: jsonContent.substring(jsonStart, jsonEnd)
            } as unknown as Result);
          }
          
          startIndex = jsonEnd;
        }
        
        // Apply transform if provided
        if (this.transform) {
          results = results.map(r => this.transform!(r as any)) as Result[];
        }
        
        if (results.length > 0) {
          return results;
        }
      }
    }
    
    // Process with specialized matchers if enabled
    if (this.matchToolUse && this.toolUseMatcher) {
      // Special handling for JSON tool use blocks
      if (this.detectedFormat === 'json') {
        try {
          // Try to parse the entire chunk as JSON
          const jsonObj = JSON.parse(chunk);
          if (jsonObj.type === 'tool_use' && jsonObj.name && jsonObj.id) {
            // Directly update the tool use IDs
            this.toolUseIds.set(jsonObj.name, jsonObj.id);
            this.toolUseMatcher.getToolUseIds().set(jsonObj.name, jsonObj.id);
          }
        } catch (e) {
          // Not a complete JSON object, try to find JSON objects in the text
          const toolUseRegex = /\{"type":"tool_use"[^}]*\}/g;
          let match;
          
          while ((match = toolUseRegex.exec(chunk)) !== null) {
            try {
              const toolUseObj = JSON.parse(match[0]);
              if (toolUseObj.type === 'tool_use' && toolUseObj.name && toolUseObj.id) {
                // Directly update the tool use IDs
                this.toolUseIds.set(toolUseObj.name, toolUseObj.id);
                this.toolUseMatcher.getToolUseIds().set(toolUseObj.name, toolUseObj.id);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }
      
      const toolUseResults = this.toolUseMatcher.update(chunk);
      if (toolUseResults.length > 0) {
        results = [...results, ...toolUseResults as Result[]];
      }
      
      // Create a new ToolResultMatcher with updated tool use IDs if needed
      if (this.toolResultMatcher && this.toolUseMatcher.getToolUseIds().size > 0) {
        this.toolResultMatcher = new ToolResultMatcher(
          this.toolUseMatcher.getToolUseIds(),
          this.transform as any
        );
      }
    }
    
    if (this.matchToolResult && this.toolResultMatcher) {
      const toolResultResults = this.toolResultMatcher.update(chunk);
      if (toolResultResults.length > 0) {
        results = [...results, ...toolResultResults as Result[]];
      }
    }
    
    // If no specialized matchers or no results from them, use standard matchers
    if (results.length === 0) {
      // Use the appropriate matcher based on the detected format
      if (this.detectedFormat === 'json') {
        results = this.jsonMatcher.update(chunk) as Result[];
      } else {
        // Default to XML matcher for 'xml' or 'unknown'
        results = this.xmlMatcher.update(chunk) as Result[];
      }
    }
    
    return results;
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
      if (this.detectedFormat === 'unknown') {
        this.detectedFormat = this.formatDetector.detectFormat(chunk);
      }
    }
    
    let results: Result[] = [];
    
    // Process with specialized matchers if enabled
    if (this.matchToolUse && this.toolUseMatcher) {
      const toolUseResults = this.toolUseMatcher.final(chunk);
      if (toolUseResults.length > 0) {
        results = [...results, ...toolUseResults as Result[]];
      }
    }
    
    if (this.matchToolResult && this.toolResultMatcher) {
      const toolResultResults = this.toolResultMatcher.final(chunk);
      if (toolResultResults.length > 0) {
        results = [...results, ...toolResultResults as Result[]];
      }
    }
    
    // If no specialized matchers or no results from them, use standard matchers
    if (results.length === 0) {
      // Use the appropriate matcher based on the detected format
      if (this.detectedFormat === 'json') {
        results = this.jsonMatcher.final(chunk) as Result[];
      } else {
        // Default to XML matcher for 'xml' or 'unknown'
        results = this.xmlMatcher.final(chunk) as Result[];
      }
    }
    
    return results;
  }
  
  /**
   * Get the map of tool use IDs
   *
   * @returns Map of tool name to tool use ID
   */
  getToolUseIds(): Map<string, string> {
    if (this.toolUseMatcher) {
      return this.toolUseMatcher.getToolUseIds();
    }
    return this.toolUseIds;
  }
}