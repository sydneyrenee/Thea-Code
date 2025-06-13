# Provider MCP Integration Test Plan

**Date:** 2025-05-04

## 1. Overview

This document outlines the testing strategy for the integration of provider handlers with the MCP facade for tool use routing. It complements the implementation plan in `ollama_openai_integration_plan.md` and provides a comprehensive approach to ensuring the changes work correctly.

## 2. Test Objectives

1. Verify that provider handlers correctly use the MCP integration for tool use routing
2. Ensure that providers using the OpenAI protocol leverage the OpenAI handler's tool use detection and processing logic
3. Confirm that tool use is processed consistently across all providers
4. Validate that the changes do not break existing functionality
5. Ensure proper error handling for tool use processing

## 3. Test Environments

### 3.1 Development Environment

- Local development environment with Jest for unit and integration tests
- Mock MCP integration components for isolated testing
- Mock provider APIs for controlled testing

### 3.2 Integration Environment

- Local environment with actual MCP integration components
- Mock provider APIs for controlled testing

### 3.3 End-to-End Environment

- Local environment with actual MCP integration components
- Actual provider APIs for real-world testing
- Various AI models to test different tool use formats

## 4. Test Categories

### 4.1 Unit Tests

Unit tests focus on testing individual components in isolation:

1. **BaseProvider Tests**

    - Test the `processToolUse` method
    - Test the `registerTools` method
    - Test initialization of MCP integration

2. **OpenAI Handler Tests**

    - Test the `extractToolCalls` method
    - Test the `hasToolCalls` method
    - Test tool use detection and processing

3. **Ollama Handler Tests**

    - Test integration with OpenAI handler
    - Test tool use detection and processing
    - Test handling of different tool use formats

4. **MCP Integration Tests**
    - Test the `routeToolUse` method
    - Test format detection
    - Test conversion between formats

### 4.2 Integration Tests

Integration tests focus on testing the interaction between components:

1. **Provider-MCP Integration Tests**

    - Test end-to-end flow from provider handler to MCP integration
    - Test with different tool use formats
    - Test with different tools

2. **Cross-Provider Tests**
    - Test consistency of tool use processing across providers
    - Test with the same tool use request in different formats

### 4.3 End-to-End Tests

End-to-end tests focus on testing the entire system with real AI models:

1. **Real Model Tests**

    - Test with actual OpenAI models
    - Test with actual Anthropic models
    - Test with actual Ollama models

2. **Tool Execution Tests**
    - Test execution of various tools
    - Test handling of tool results
    - Test error handling

## 5. Test Cases

### 5.1 Unit Test Cases

#### 5.1.1 BaseProvider Tests

| Test ID | Test Name        | Description                                          | Expected Result                          |
| ------- | ---------------- | ---------------------------------------------------- | ---------------------------------------- |
| BP-01   | Process Tool Use | Test the `processToolUse` method with various inputs | Tool use is processed correctly          |
| BP-02   | Register Tools   | Test the `registerTools` method                      | Tools are registered correctly           |
| BP-03   | Initialize MCP   | Test initialization of MCP integration               | MCP integration is initialized correctly |

#### 5.1.2 OpenAI Handler Tests

| Test ID | Test Name          | Description                                            | Expected Result                    |
| ------- | ------------------ | ------------------------------------------------------ | ---------------------------------- |
| OAI-01  | Extract Tool Calls | Test the `extractToolCalls` method with various inputs | Tool calls are extracted correctly |
| OAI-02  | Has Tool Calls     | Test the `hasToolCalls` method with various inputs     | Tool calls are detected correctly  |
| OAI-03  | Process Tool Use   | Test tool use detection and processing                 | Tool use is processed correctly    |

#### 5.1.3 Ollama Handler Tests

| Test ID | Test Name          | Description                                                                | Expected Result                      |
| ------- | ------------------ | -------------------------------------------------------------------------- | ------------------------------------ |
| OLL-01  | OpenAI Integration | Test integration with OpenAI handler                                       | OpenAI handler is used correctly     |
| OLL-02  | Process Tool Use   | Test tool use detection and processing                                     | Tool use is processed correctly      |
| OLL-03  | Handle XML Format  | Test handling of XML tool use format for reasoning models and other models | XML tool use is processed correctly  |
| OLL-04  | Handle JSON Format | Test handling of JSON tool use format                                      | JSON tool use is processed correctly |

Note: Prompting the model to select the "mode" should be part of the ollama code, not the test. (for now) Later we may have it as a user selectable option.

#### 5.1.4 MCP Integration Tests

| Test ID | Test Name       | Description                                        | Expected Result                 |
| ------- | --------------- | -------------------------------------------------- | ------------------------------- |
| MCP-01  | Route Tool Use  | Test the `routeToolUse` method with various inputs | Tool use is routed correctly    |
| MCP-02  | Detect Format   | Test format detection with various inputs          | Format is detected correctly    |
| MCP-03  | Convert Formats | Test conversion between formats                    | Formats are converted correctly |

### 5.2 Integration Test Cases

#### 5.2.1 Provider-MCP Integration Tests

| Test ID | Test Name        | Description                                                    | Expected Result                             |
| ------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------- |
| INT-01  | OpenAI to MCP    | Test end-to-end flow from OpenAI handler to MCP integration    | Tool use is processed correctly             |
| INT-02  | Anthropic to MCP | Test end-to-end flow from Anthropic handler to MCP integration | Tool use is processed correctly             |
| INT-03  | Ollama to MCP    | Test end-to-end flow from Ollama handler to MCP integration    | Tool use is processed correctly             |
| INT-04  | XML Format       | Test with XML tool use format                                  | XML tool use is processed correctly         |
| INT-05  | JSON Format      | Test with JSON tool use format                                 | JSON tool use is processed correctly        |
| INT-06  | OpenAI Format    | Test with OpenAI function call format                          | OpenAI function call is processed correctly |

Also add response testing to make sure messages are returned to the model and understood correctly.

#### 5.2.2 Cross-Provider Tests

| Test ID  | Test Name                     | Description                                 | Expected Result                    |
| -------- | ----------------------------- | ------------------------------------------- | ---------------------------------- |
| CROSS-01 | Same Tool Different Providers | Test the same tool with different providers | Tool use is processed consistently |
| CROSS-02 | Same Tool Different Formats   | Test the same tool with different formats   | Tool use is processed consistently |

### 5.3 End-to-End Test Cases

#### 5.3.1 Real Model Tests

| Test ID | Test Name    | Description                   | Expected Result                 |
| ------- | ------------ | ----------------------------- | ------------------------------- |
| E2E-03  | Ollama Model | Test with actual Ollama model | Tool use is processed correctly |

Anything else is future.

#### 5.3.2 Tool Execution Tests

This requires making sure the tools from Thea Code are integrated into the MCP integration. For Ollama, the Ollama handler should manage prompts. We will need a JSON file with the tool names and their parameters and model identifiers.
| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| E2E-01 | Execute Tool | Test execution of various tools | Tool is executed correctly |
| E2E-02 | Handle Tool Result | Test handling of tool results | Tool result is processed correctly |
| E2E-03 | Error Handling | Test error handling for tool use processing | Errors are handled correctly |

## 6. Test Data

### 6.1 Tool Use Requests

#### 6.1.1 XML Format

```xml
<calculator>
  <a>5</a>
  <b>10</b>
  <operation>add</operation>
</calculator>
```

#### 6.1.2 JSON Format

```json
{
	"type": "tool_use",
	"name": "calculator",
	"id": "calculator-123",
	"input": {
		"a": 5,
		"b": 10,
		"operation": "add"
	}
}
```

#### 6.1.3 OpenAI Format

```json
{
	"tool_calls": [
		{
			"id": "call_123",
			"function": {
				"name": "calculator",
				"arguments": "{\"a\":5,\"b\":10,\"operation\":\"add\"}"
			}
		}
	]
}
```

### 6.2 Tool Results

#### 6.2.1 XML Format

```xml
<tool_result tool_use_id="calculator-123" status="success">
  <content>15</content>
</tool_result>
```

#### 6.2.2 JSON Format

```json
{
	"type": "tool_result",
	"tool_use_id": "calculator-123",
	"content": [
		{
			"type": "text",
			"text": "15"
		}
	],
	"status": "success"
}
```

#### 6.2.3 OpenAI Format

```json
{
	"role": "tool",
	"tool_call_id": "call_123",
	"content": "15"
}
```

## 7. Test Implementation

### 7.1 Unit Tests

Unit tests will be implemented using Jest and will focus on testing individual components in isolation. Mock objects will be used to simulate dependencies.

Example unit test for the OpenAI handler's `extractToolCalls` method:

```typescript
// src/api/providers/__tests__/openai.test.ts
describe("Tool Use Detection", () => {
	it("should extract tool calls from delta", () => {
		const delta = {
			tool_calls: [
				{
					id: "call_123",
					function: {
						name: "test_tool",
						arguments: '{"param":"value"}',
					},
				},
			],
		}

		const toolCalls = handler.extractToolCalls(delta)

		expect(toolCalls).toEqual(delta.tool_calls)
	})
})
```

### 7.2 Integration Tests

Integration tests will be implemented using Jest and will focus on testing the interaction between components. Mock objects will be used for external dependencies.

Example integration test for the Ollama handler's integration with the OpenAI handler:

```typescript
// src/api/providers/__tests__/ollama-mcp-integration.test.ts
it("should use OpenAI handler for tool use detection", async () => {
	// Mock the OpenAI handler's extractToolCalls method
	const extractToolCallsSpy = jest.spyOn(handler["openAiHandler"], "extractToolCalls")

	// Create neutral history
	const neutralHistory: NeutralConversationHistory = [
		{ role: "user", content: [{ type: "text", text: "Use a tool" }] },
	]

	// Call createMessage
	const stream = handler.createMessage("You are helpful.", neutralHistory)

	// Collect stream chunks
	const chunks = []
	for await (const chunk of stream) {
		chunks.push(chunk)
	}

	// Verify OpenAI handler's extractToolCalls method was called
	expect(extractToolCallsSpy).toHaveBeenCalled()
})
```

### 7.3 End-to-End Tests

End-to-end tests will be implemented using Jest and will focus on testing the entire system with real AI models. These tests will require actual API keys and may be skipped in CI/CD pipelines.

Example end-to-end test for the Ollama handler with a real model:

```typescript
// src/api/providers/__tests__/ollama-e2e.test.ts
it("should process tool use with real Ollama model", async () => {
	// Skip if no API key is provided
	if (!process.env.OLLAMA_API_URL) {
		console.log("Skipping test: No Ollama API URL provided")
		return
	}

	// Create handler with real API URL
	const handler = new OllamaHandler({
		ollamaBaseUrl: process.env.OLLAMA_API_URL,
		ollamaModelId: "llama2",
	})

	// Create neutral history
	const neutralHistory: NeutralConversationHistory = [
		{ role: "user", content: [{ type: "text", text: "Calculate 5 + 10" }] },
	]

	// Call createMessage
	const stream = handler.createMessage("You are helpful and can use tools.", neutralHistory)

	// Collect stream chunks
	const chunks = []
	for await (const chunk of stream) {
		chunks.push(chunk)
	}

	// Verify tool result was yielded
	const toolResultChunks = chunks.filter((chunk) => chunk.type === "tool_result")
	expect(toolResultChunks.length).toBeGreaterThan(0)
})
```

## 8. Test Execution

### 8.1 Automated Tests

Automated tests will be executed as part of the CI/CD pipeline:

1. Unit tests will be executed on every commit
2. Integration tests will be executed on every pull request
3. End-to-end tests will be executed manually or on specific branches

### 8.2 Manual Tests

Manual tests will be executed by developers and testers:

1. Test with different AI models
2. Test with different tools
3. Test with complex scenarios
4. Test error handling

### 8.3 Test Reports

Test reports will be generated for each test run:

1. Test coverage report
2. Test results report
3. Error report

## 9. Test Completion Criteria

The testing phase will be considered complete when:

1. All unit tests pass
2. All integration tests pass
3. All end-to-end tests pass
4. Test coverage is at least 80%
5. No critical or high-severity bugs are found
6. All edge cases are tested

## 10. Conclusion

This test plan provides a comprehensive approach to testing the integration of provider handlers with the MCP facade for tool use routing. By following this plan, we can ensure that the changes work correctly and do not break existing functionality.

The test plan aligns with the architectural vision of having a unified tool system based on the MCP protocol, providing a solid foundation for future enhancements and making it easier to support a wide range of AI models.
