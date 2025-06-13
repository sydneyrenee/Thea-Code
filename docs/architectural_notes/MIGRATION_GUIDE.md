# Migration Guide: From Anthropic-Centric to Unified MCP Architecture

**Date:** 2025-06-11  
**Audience:** Contributors and developers working with Thea Code

## Overview

This guide explains the architectural changes implemented in Thea Code and how to work with the new unified MCP-integrated system.

## 1. What Changed

### 1.1 From Anthropic-Centric to Neutral Format

**Before (Anthropic-Centric):**

```typescript
// Old: All providers had to work with Anthropic's message format
export class OldProvider implements ApiHandler {
	createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]) {
		// Convert from Anthropic format to provider format
		const converted = this.convertFromAnthropic(messages)
		return this.callProviderAPI(converted)
	}
}
```

**After (Neutral Format):**

```typescript
// New: All providers work with neutral format
export class NewProvider extends BaseProvider {
	createMessage(systemPrompt: string, messages: NeutralConversationHistory) {
		// Convert from neutral to provider format using dedicated transform
		const converted = neutralToProviderFormat(messages)
		return this.callProviderAPI(converted)
	}
}
```

### 1.2 Automatic MCP Integration

**Before (Manual Tool Handling):**

```typescript
// Old: Each provider implemented its own tool handling
export class OldProvider {
	private handleToolUse(toolCall: any) {
		switch (toolCall.name) {
			case "read_file":
				return this.readFileImplementation(toolCall.params)
			case "write_file":
				return this.writeFileImplementation(toolCall.params)
			// ... more tool implementations
		}
	}
}
```

**After (Automatic MCP Integration):**

```typescript
// New: BaseProvider automatically handles all tools via MCP
export class NewProvider extends BaseProvider {
	// No tool handling needed - automatically inherited from BaseProvider
	// Tools are registered in constructor via this.registerTools()
	// Tool execution is handled by McpIntegration
}
```

## 2. Working with the New Architecture

### 2.1 Creating a New Provider

To create a new provider, extend `BaseProvider`:

```typescript
import { BaseProvider } from "./base-provider"
import { NeutralConversationHistory } from "../../shared/neutral-history"
import { ApiStream } from "../transform/stream"
import { ModelInfo } from "../../shared/api"

export class MyNewProvider extends BaseProvider {
	constructor(private options: MyProviderOptions) {
		super() // This automatically sets up MCP integration
	}

	async createMessage(systemPrompt: string, messages: NeutralConversationHistory): Promise<ApiStream> {
		// 1. Convert neutral format to your provider's format
		const providerMessages = neutralToMyProviderFormat(messages, systemPrompt)

		// 2. Make API call
		const response = await this.callMyProviderAPI(providerMessages)

		// 3. Return as ApiStream
		return new ApiStream(response)
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.modelId,
			info: {
				maxTokens: 100000,
				contextWindow: 100000,
				supportsImages: true,
				supportsPromptCache: false,
				inputPrice: 0.01,
				outputPrice: 0.03,
			},
		}
	}
}
```

### 2.2 Format Conversion Best Practices

Create dedicated transform files for format conversion:

```typescript
// src/api/transform/neutral-myprovider-format.ts
import { NeutralConversationHistory, NeutralMessage } from "../../shared/neutral-history"

export function neutralToMyProviderFormat(
	messages: NeutralConversationHistory,
	systemPrompt: string,
): MyProviderMessage[] {
	const result: MyProviderMessage[] = []

	if (systemPrompt) {
		result.push({ role: "system", content: systemPrompt })
	}

	for (const message of messages) {
		result.push({
			role: message.role,
			content: convertContent(message.content),
		})
	}

	return result
}

function convertContent(content: NeutralMessageContent): string {
	if (typeof content === "string") {
		return content
	}

	// Handle block format
	return content
		.map((block) => {
			if (block.type === "text") {
				return block.text
			}
			// Handle other block types...
		})
		.join("")
}
```

### 2.3 Extending Existing Protocol Handlers

If your provider uses an existing protocol, extend the appropriate handler:

```typescript
// Example: Provider that uses OpenAI protocol
export class MyOpenAICompatibleProvider extends OpenAiHandler {
	constructor(options: MyProviderOptions) {
		super({
			...options,
			baseUrl: "https://my-provider-api.com/v1",
		})
	}

	// Override only what's different
	protected getApiKey(): string {
		return this.options.myProviderApiKey
	}
}
```

## 3. Tool Development

### 3.1 Adding New Tools

Add tools by registering them in the `registerTools()` method:

```typescript
export class MyProvider extends BaseProvider {
	protected registerTools(): void {
		// Call parent to get standard tools
		super.registerTools()

		// Add custom tools
		this.mcpIntegration.registerTool({
			name: "analyze_performance",
			description: "Analyze code performance metrics",
			paramSchema: {
				type: "object",
				properties: {
					file_path: {
						type: "string",
						description: "Path to the file to analyze",
					},
					metrics: {
						type: "array",
						items: { type: "string" },
						description: "Performance metrics to check",
					},
				},
				required: ["file_path"],
			},
		})
	}
}
```

### 3.2 Tool Execution

Tools are automatically executed by the MCP system. The format conversion is handled transparently:

- **XML format**: `<analyze_performance><file_path>src/app.ts</file_path></analyze_performance>`
- **JSON format**: `{"type": "tool_use", "name": "analyze_performance", "input": {"file_path": "src/app.ts"}}`
- **OpenAI format**: Function calls in OpenAI's schema

## 4. Testing Your Changes

### 4.1 Basic Provider Test

```typescript
import { MyNewProvider } from "../my-new-provider"

describe("MyNewProvider", () => {
	test("should create messages correctly", async () => {
		const provider = new MyNewProvider(testOptions)
		const messages = [{ role: "user", content: "Hello" }]

		const stream = await provider.createMessage("System prompt", messages)
		expect(stream).toBeDefined()
	})

	test("should have MCP integration", () => {
		const provider = new MyNewProvider(testOptions)
		expect(provider["mcpIntegration"]).toBeDefined()
	})
})
```

### 4.2 Tool Integration Test

```typescript
test("should register tools automatically", async () => {
	const provider = new MyNewProvider(testOptions)
	await provider["mcpIntegration"].initialize()

	// Tools should be registered
	const tools = provider["mcpIntegration"].getRegisteredTools()
	expect(tools).toContain("read_file")
	expect(tools).toContain("write_file")
})
```

## 5. Migration Checklist

When migrating existing code or creating new providers:

- [ ] Extend `BaseProvider` instead of implementing `ApiHandler` directly
- [ ] Use `NeutralConversationHistory` instead of provider-specific message formats
- [ ] Create dedicated transform files for format conversion
- [ ] Remove manual tool handling code - use MCP integration
- [ ] Register custom tools in the `registerTools()` method
- [ ] Test tool integration works with different formats (XML/JSON/OpenAI)
- [ ] Update any existing tests to work with the new architecture

## 6. Benefits of the New Architecture

✅ **Reduced Code Duplication**: Common functionality is in `BaseProvider`  
✅ **Consistent Tool Support**: All providers automatically support all tools  
✅ **Format Flexibility**: Support for XML, JSON, and OpenAI function calling  
✅ **Easier Testing**: Standardized interfaces and behavior  
✅ **Better Maintainability**: Centralized tool logic and format conversion  
✅ **Future-Proof**: Easy to add new providers and tools

## 7. Getting Help

- Check existing providers for implementation examples
- Look at test files for usage patterns
- Review the MCP comprehensive guide for tool development
- Ask questions in GitHub discussions

For more detailed technical information, see:

- [Unified Architecture Guide](../api_handlers/unified_architecture.md)
- [MCP Comprehensive Guide](tool_use/mcp/mcp_comprehensive_guide.md)
- [Provider Handler Architecture](../api_handlers/provider_handler_architecture.md)
