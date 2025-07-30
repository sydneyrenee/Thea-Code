# Neutral Vertex Client Implementation Plan

## Overview

This document outlines the plan for implementing a `NeutralVertexClient` to replace the direct SDK dependency on `@anthropic-ai/vertex-sdk` in the `vertex.ts` provider file. The implementation will follow the pattern established by the `NeutralAnthropicClient` and use the existing conversion functions in `neutral-vertex-format.ts`.

## Current Progress

As part of the provider-agnostic architecture implementation, the following progress has been made:

1. **Capability Detection**: Provider files have been updated to use capability detection instead of hardcoded model checks:
   - `unbound.ts` has been updated to use the `supportsTemperature` function from `model-capabilities.ts`
   - `openai.ts` is using the `hasCapability` function for checking thinking and image support
   - `vertex.ts` is using the `supportsPromptCaching` function for cache control

2. **Neutral Format Conversion**: Conversion functions have been implemented:
   - `neutral-vertex-format.ts` contains functions for converting between neutral and Vertex-specific formats
   - `neutral-anthropic-format.ts` contains functions for converting between neutral and Anthropic-specific formats

3. **Neutral Client Implementation**: A `NeutralAnthropicClient` has been implemented to replace direct SDK usage:
   - Uses fetch-based API calls instead of the SDK
   - Handles streaming responses
   - Provides methods for converting between neutral and provider-specific formats

The next step is to implement a similar neutral client for Vertex AI to replace the direct SDK dependency on `@anthropic-ai/vertex-sdk`.

## Directory Structure

Create a new directory `src/services/vertex` with the following files:

1. `NeutralVertexClient.ts`: The main client implementation
2. `types.ts`: Type definitions for the client
3. `index.ts`: Export the client and types

## Type Definitions (`types.ts`)

Define the following types:

```typescript
/**
 * Options for the NeutralVertexClient
 */
export interface NeutralVertexClientOptions {
  projectId: string;
  region: string;
  credentials?: Record<string, unknown>;
  keyFile?: string;
}

/**
 * Parameters for creating a message with the Claude model on Vertex AI
 */
export interface NeutralVertexClaudeMessageParams {
  model: string;
  systemPrompt?: string;
  messages: NeutralConversationHistory;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * Parameters for creating a message with the Gemini model on Vertex AI
 */
export interface NeutralVertexGeminiMessageParams {
  model: string;
  systemPrompt?: string;
  messages: NeutralConversationHistory;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * Usage information returned by the Vertex AI API
 */
export interface NeutralVertexUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Stream event from the Vertex AI API for Claude models
 */
export interface NeutralVertexClaudeStreamEvent {
  type: "message_start" | "message_delta" | "content_block_start" | "content_block_delta";
  message?: {
    usage: NeutralVertexUsage;
  };
  usage?: {
    output_tokens: number;
  };
  content_block?: {
    type: "text" | "thinking" | "tool_use";
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  index?: number;
  delta?: {
    type: "text_delta" | "thinking_delta";
    text?: string;
    thinking?: string;
  };
}

/**
 * Response from the Vertex AI API for non-streaming Claude requests
 */
export interface NeutralVertexClaudeResponse {
  content: Array<{ type: "text"; text: string }>;
}
```

## Client Implementation (`NeutralVertexClient.ts`)

```typescript
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history";
import {
  convertToVertexClaudeHistory,
  convertToVertexGeminiHistory,
  formatMessageForCache,
} from "../../api/transform/neutral-vertex-format";
import type { ApiStreamChunk, ApiStream } from "../../api/transform/stream";
import type {
  NeutralVertexClientOptions,
  NeutralVertexClaudeMessageParams,
  NeutralVertexGeminiMessageParams,
  NeutralVertexClaudeStreamEvent,
  NeutralVertexClaudeResponse,
  NeutralVertexUsage,
} from "./types";

export class NeutralVertexClient {
  private projectId: string;
  private region: string;
  private credentials?: Record<string, unknown>;
  private keyFile?: string;
  private claudeBaseUrl: string;
  private geminiBaseUrl: string;

  constructor(options: NeutralVertexClientOptions) {
    this.projectId = options.projectId;
    this.region = options.region;
    this.credentials = options.credentials;
    this.keyFile = options.keyFile;
    
    // Set base URLs for the Vertex AI API
    this.claudeBaseUrl = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models`;
    this.geminiBaseUrl = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models`;
  }

  /**
   * Get authentication headers for the Vertex AI API
   * This will need to use the Google Auth library or a similar approach
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Implementation will depend on how authentication is handled
    // This might involve using the Google Auth library or a similar approach
    // For now, return a placeholder
    return {
      "Authorization": "Bearer TOKEN_PLACEHOLDER",
      "Content-Type": "application/json",
    };
  }

  /**
   * Create a streaming message with the Claude model on Vertex AI
   */
  public async *createClaudeMessage(params: NeutralVertexClaudeMessageParams): ApiStream {
    const { model, systemPrompt, messages, maxTokens, temperature } = params;
    const claudeMessages = convertToVertexClaudeHistory(messages);
    
    // Create system content if provided
    const systemContent = systemPrompt
      ? [{ 
          type: "text" as const, 
          text: systemPrompt,
          cache_control: { type: "ephemeral" } as const
        }]
      : undefined;
    
    // Apply cache control to messages if needed
    const messagesWithCache = claudeMessages.map((message) => 
      formatMessageForCache(message, true)
    );
    
    // Prepare request parameters
    const requestParams = {
      model,
      max_tokens: maxTokens ?? 8000,
      temperature: temperature ?? 0,
      system: systemContent,
      messages: messagesWithCache,
      stream: true,
    };
    
    try {
      // Get authentication headers
      const headers = await this.getAuthHeaders();
      
      // Make the API request
      const response = await fetch(`${this.claudeBaseUrl}/${model}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestParams),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Claude API error: ${response.status} ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      
      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (!line || line.startsWith(':')) continue;
          
          const data = line.startsWith('data: ') ? line.slice(6) : line;
          
          try {
            if (data === '[DONE]') break;
            
            const parsedChunk = JSON.parse(data) as NeutralVertexClaudeStreamEvent;
            
            // Process the chunk based on its type
            switch (parsedChunk.type) {
              case "message_start": {
                // Extract usage information
                const usage = parsedChunk.message?.usage as NeutralVertexUsage;
                yield {
                  type: "usage",
                  inputTokens: usage?.input_tokens || 0,
                  outputTokens: usage?.output_tokens || 0,
                  cacheWriteTokens: usage?.cache_creation_input_tokens,
                  cacheReadTokens: usage?.cache_read_input_tokens,
                };
                break;
              }
              case "content_block_start": {
                // Handle content block start
                const contentBlock = parsedChunk.content_block;
                if (contentBlock?.type === "text" && contentBlock.text) {
                  yield {
                    type: "text",
                    text: contentBlock.text,
                  };
                } else if (contentBlock?.type === "thinking" && contentBlock.thinking) {
                  yield {
                    type: "thinking",
                    text: contentBlock.thinking,
                  };
                } else if (contentBlock?.type === "tool_use" && contentBlock.name) {
                  // Handle tool use
                  // This would need to be implemented based on how tool use is handled in the codebase
                }
                break;
              }
              case "content_block_delta": {
                // Handle content block delta
                const delta = parsedChunk.delta;
                if (delta?.type === "text_delta" && delta.text) {
                  yield {
                    type: "text",
                    text: delta.text,
                  };
                } else if (delta?.type === "thinking_delta" && delta.thinking) {
                  yield {
                    type: "thinking",
                    text: delta.thinking,
                  };
                }
                break;
              }
            }
          } catch (error) {
            console.error("Error parsing chunk:", error);
          }
        }
      }
    } catch (error) {
      throw new Error(`Vertex AI Claude API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a non-streaming message with the Claude model on Vertex AI
   */
  public async completeClaudePrompt(prompt: string, model: string, maxTokens?: number, temperature?: number): Promise<string> {
    try {
      // Convert prompt to neutral history
      const neutralHistory: NeutralConversationHistory = [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ];
      
      // Convert to Claude format
      const claudeMessages = convertToVertexClaudeHistory(neutralHistory);
      
      // Apply cache control
      const messagesWithCache = claudeMessages.map((message) => 
        formatMessageForCache(message, true)
      );
      
      // Prepare request parameters
      const requestParams = {
        model,
        max_tokens: maxTokens ?? 8000,
        temperature: temperature ?? 0,
        system: "",
        messages: messagesWithCache,
        stream: false,
      };
      
      // Get authentication headers
      const headers = await this.getAuthHeaders();
      
      // Make the API request
      const response = await fetch(`${this.claudeBaseUrl}/${model}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestParams),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Claude API error: ${response.status} ${errorText}`);
      }
      
      // Parse the response
      const responseData = await response.json() as NeutralVertexClaudeResponse;
      const content = responseData.content[0];
      
      if (content?.type === "text") {
        return content.text;
      }
      
      return "";
    } catch (error) {
      throw new Error(`Vertex AI Claude completion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a streaming message with the Gemini model on Vertex AI
   */
  public async *createGeminiMessage(params: NeutralVertexGeminiMessageParams): ApiStream {
    const { model, systemPrompt, messages, maxTokens, temperature } = params;
    const geminiMessages = convertToVertexGeminiHistory(messages);
    
    // Prepare request parameters
    const requestParams = {
      model,
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: temperature ?? 0,
      },
      systemInstruction: systemPrompt,
      stream: true,
    };
    
    try {
      // Get authentication headers
      const headers = await this.getAuthHeaders();
      
      // Make the API request
      const response = await fetch(`${this.geminiBaseUrl}/${model}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestParams),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Gemini API error: ${response.status} ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      
      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (!line || line.startsWith(':')) continue;
          
          const data = line.startsWith('data: ') ? line.slice(6) : line;
          
          try {
            if (data === '[DONE]') break;
            
            const parsedChunk = JSON.parse(data);
            
            // Process Gemini response format
            // This would need to be implemented based on the Gemini API response format
            // For now, a simplified implementation
            if (parsedChunk.candidates?.[0]?.content?.parts) {
              for (const part of parsedChunk.candidates[0].content.parts) {
                if (part.text) {
                  yield {
                    type: "text",
                    text: part.text,
                  };
                }
                
                // Handle function calls (tool use) if present
                if (part.functionCall) {
                  // This would need to be implemented based on how tool use is handled in the codebase
                }
              }
            }
            
            // Handle usage information if present
            if (parsedChunk.usageMetadata) {
              yield {
                type: "usage",
                inputTokens: parsedChunk.usageMetadata.promptTokenCount || 0,
                outputTokens: parsedChunk.usageMetadata.candidatesTokenCount || 0,
              };
            }
          } catch (error) {
            console.error("Error parsing chunk:", error);
          }
        }
      }
    } catch (error) {
      throw new Error(`Vertex AI Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a non-streaming message with the Gemini model on Vertex AI
   */
  public async completeGeminiPrompt(prompt: string, model: string, maxTokens?: number, temperature?: number): Promise<string> {
    try {
      // Convert prompt to neutral history
      const neutralHistory: NeutralConversationHistory = [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ];
      
      // Convert to Gemini format
      const geminiMessages = convertToVertexGeminiHistory(neutralHistory);
      
      // Prepare request parameters
      const requestParams = {
        model,
        contents: geminiMessages,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature ?? 0,
        },
        stream: false,
      };
      
      // Get authentication headers
      const headers = await this.getAuthHeaders();
      
      // Make the API request
      const response = await fetch(`${this.geminiBaseUrl}/${model}:generateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestParams),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Gemini API error: ${response.status} ${errorText}`);
      }
      
      // Parse the response
      const responseData = await response.json();
      
      // Extract text from Gemini response
      let text = "";
      if (responseData.candidates?.[0]?.content?.parts) {
        for (const part of responseData.candidates[0].content.parts) {
          if (part.text) {
            text += part.text;
          }
        }
      }
      
      return text;
    } catch (error) {
      throw new Error(`Vertex AI Gemini completion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Count tokens for the given content
   * This is a placeholder and would need to be implemented based on how token counting is handled in the codebase
   */
  public async countTokens(model: string, content: NeutralMessageContent): Promise<number> {
    // This would need to be implemented based on how token counting is handled in the codebase
    // For now, return a placeholder value
    return 100;
  }
}
```

## Exports (`index.ts`)

```typescript
export * from "./NeutralVertexClient";
export * from "./types";
```

## Updates to `vertex.ts`

1. Remove the import of `AnthropicVertex` from "@anthropic-ai/vertex-sdk"
2. Import the `NeutralVertexClient` from "../../services/vertex"
3. Replace the `anthropicClient` property with a `neutralVertexClient` property
4. Update the constructor to initialize the `neutralVertexClient` instead of the `anthropicClient`
5. Update the `createClaudeMessage` method to use the `neutralVertexClient.createClaudeMessage` method
6. Update the `completePromptClaude` method to use the `neutralVertexClient.completeClaudePrompt` method
7. Keep the `createGeminiMessage` and `completePromptGemini` methods using the `geminiClient` for now, or update them to use the `neutralVertexClient` methods if ready

## Updates to Tests

1. Update the mock for `AnthropicVertex` in the tests to mock `NeutralVertexClient` instead
2. Update the test assertions to match the new implementation

## Updates to `package.json`

After all the changes are implemented and tested:

1. Remove the "@anthropic-ai/vertex-sdk" dependency from package.json
2. Update package-lock.json by running `npm install`

## Implementation Strategy and Timeline

The implementation of the `NeutralVertexClient` should be approached in phases to ensure a smooth transition and minimize the risk of breaking changes:

### Phase 1: Setup and Basic Implementation (1-2 days)

1. Create the directory structure and files:
   - Create `src/services/vertex` directory
   - Create `types.ts` with the basic type definitions
   - Create `NeutralVertexClient.ts` with the constructor and basic methods
   - Create `index.ts` to export the client and types

2. Implement the authentication mechanism:
   - Research how to handle Google Auth in a fetch-based implementation
   - Implement the `getAuthHeaders` method to generate valid authentication headers

### Phase 2: Claude Model Support (2-3 days)

1. Implement Claude-specific methods:
   - Complete the `createClaudeMessage` method for streaming responses
   - Complete the `completeClaudePrompt` method for non-streaming responses
   - Ensure proper error handling and response parsing

2. Update `vertex.ts` to use the new client for Claude models:
   - Replace the `anthropicClient` with the `neutralVertexClient`
   - Update the `createClaudeMessage` method to use the new client
   - Update the `completePromptClaude` method to use the new client

3. Update tests for Claude model support:
   - Update the mock for `AnthropicVertex` to mock `NeutralVertexClient`
   - Update test assertions for Claude model tests

### Phase 3: Gemini Model Support (2-3 days)

1. Implement Gemini-specific methods:
   - Complete the `createGeminiMessage` method for streaming responses
   - Complete the `completeGeminiPrompt` method for non-streaming responses
   - Ensure proper error handling and response parsing

2. Update `vertex.ts` to use the new client for Gemini models:
   - Update the `createGeminiMessage` method to use the new client
   - Update the `completePromptGemini` method to use the new client

3. Update tests for Gemini model support:
   - Update test assertions for Gemini model tests

### Phase 4: Testing and Refinement (2-3 days)

1. Comprehensive testing:
   - Run all tests to ensure compatibility
   - Test with different model configurations
   - Test error handling and edge cases

2. Refinement:
   - Address any issues found during testing
   - Optimize performance if needed
   - Improve error handling if needed

3. Documentation:
   - Update documentation to reflect the changes
   - Add code comments to explain complex parts of the implementation

### Phase 5: Dependency Cleanup (1 day)

1. Remove SDK dependencies:
   - Remove "@anthropic-ai/vertex-sdk" from package.json
   - Update package-lock.json by running `npm install`
   - Verify that the build still works without the SDK

2. Final verification:
   - Run all tests again to ensure everything still works
   - Verify that there are no remaining references to the SDK

## Implementation Notes

- The authentication mechanism for Vertex AI will need to be carefully implemented. The current implementation in `vertex.ts` uses the Google Auth library, which might still be needed.
- The exact format of the API requests and responses for Vertex AI might need to be adjusted based on the actual API documentation.
- Error handling should be comprehensive to ensure that API errors are properly caught and reported.
- The implementation should be tested thoroughly to ensure compatibility with the existing codebase.
- Consider implementing the client incrementally, starting with the most critical methods and gradually adding more functionality.
- Use the existing conversion functions in `neutral-vertex-format.ts` to ensure consistency with the current implementation.