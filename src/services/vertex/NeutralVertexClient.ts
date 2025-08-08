import { GoogleAuth } from "google-auth-library";
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history";
import {
  convertToVertexClaudeHistory,
  convertToVertexGeminiHistory,
  formatMessageForCache,
} from "../../api/transform/neutral-vertex-format";
import type { ApiStream } from "../../api/transform/stream";
import type {
  NeutralVertexClientOptions,
  NeutralVertexClaudeMessageParams,
  NeutralVertexGeminiMessageParams,
  NeutralVertexClaudeStreamEvent,
  NeutralVertexClaudeResponse,
  NeutralVertexUsage,
  NeutralCacheControlEphemeral,
  NeutralVertexGeminiStreamEvent,
  NeutralVertexGeminiResponse,
} from "./types";

/**
 * NeutralVertexClient provides a fetch-based implementation for interacting with
 * Vertex AI APIs without direct SDK dependencies. It supports both Claude and Gemini
 * models on Vertex AI with streaming and non-streaming capabilities.
 */
export class NeutralVertexClient {
  private projectId: string;
  private region: string;
  private credentials?: Record<string, unknown>;
  private keyFile?: string;
  private claudeBaseUrl: string;
  private geminiBaseUrl: string;
  private auth: GoogleAuth;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /**
   * Creates a new NeutralVertexClient
   * @param options Client configuration options
   */
  constructor(options: NeutralVertexClientOptions) {
    this.projectId = options.projectId;
    this.region = options.region;
    this.credentials = options.credentials;
    this.keyFile = options.keyFile;
    
    // Set base URLs for the Vertex AI API
    this.claudeBaseUrl = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models`;
    this.geminiBaseUrl = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models`;
    
    // Initialize GoogleAuth with the provided credentials or keyFile
    const authOptions: any = {
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    };
    
    if (this.credentials) {
      authOptions.credentials = this.credentials;
    } else if (this.keyFile) {
      authOptions.keyFilename = this.keyFile;
    }
    // If neither credentials nor keyFile is provided, GoogleAuth will use
    // Application Default Credentials (ADC)
    
    this.auth = new GoogleAuth(authOptions);
  }

  /**
   * Get authentication headers for the Vertex AI API
   * @returns Authentication headers for API requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Check if we have a valid cached token
    const now = Date.now();
    if (!this.accessToken || now >= this.tokenExpiry) {
      try {
        // Get a new access token
        const client = await this.auth.getClient();
        const tokenResponse = await client.getAccessToken();
        
        if (!tokenResponse.token) {
          throw new Error("Failed to obtain access token from Google Auth");
        }
        
        this.accessToken = tokenResponse.token;
        // Set token expiry to 5 minutes before actual expiry for safety
        // If no expiry is provided, default to 55 minutes (tokens typically last 1 hour)
        const expiryTime = tokenResponse.res?.data?.expiry_date || (now + 55 * 60 * 1000);
        this.tokenExpiry = expiryTime - (5 * 60 * 1000);
      } catch (error) {
        console.error("Error obtaining Google Auth token:", error);
        throw new Error(`Failed to authenticate with Google Cloud: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Create a streaming message with the Claude model on Vertex AI
   * @param params Parameters for creating the message
   * @returns A stream of API chunks
   */
  public async *createClaudeMessage(params: NeutralVertexClaudeMessageParams): ApiStream {
    const { model, systemPrompt, messages, maxTokens, temperature } = params;
    const claudeMessages = convertToVertexClaudeHistory(messages);
    
    // Create system content if provided
    const systemContent = systemPrompt
      ? [{ 
          type: "text" as const, 
          text: systemPrompt,
          cache_control: { type: "ephemeral" } as NeutralCacheControlEphemeral
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
                if (usage) {
                  yield {
                    type: "usage",
                    inputTokens: usage.input_tokens || 0,
                    outputTokens: usage.output_tokens || 0,
                    cacheWriteTokens: usage.cache_creation_input_tokens,
                    cacheReadTokens: usage.cache_read_input_tokens,
                  };
                }
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
                    type: "reasoning",
                    text: contentBlock.thinking,
                  };
                } else if (contentBlock?.type === "tool_use" && contentBlock.name) {
                  // Handle tool use - this would be implemented based on how tool use is handled in the codebase
                  yield {
                    type: "tool_use",
                    id: contentBlock.id || `tool-${Date.now()}`,
                    name: contentBlock.name,
                    input: contentBlock.input || {},
                  };
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
                    type: "reasoning",
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
   * @param prompt The prompt to complete
   * @param model The model to use
   * @param maxTokens Maximum number of tokens to generate
   * @param temperature Temperature for sampling
   * @returns The generated text
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
   * @param params Parameters for creating the message
   * @returns A stream of API chunks
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
            
            // Parse the chunk with proper type
            const parsedChunk = JSON.parse(data) as NeutralVertexGeminiStreamEvent;
            
            // Process Gemini response format
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
                  yield {
                    type: "tool_use",
                    id: `${part.functionCall.name}-${Date.now()}`,
                    name: part.functionCall.name,
                    input: part.functionCall.args || {},
                  };
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
   * @param prompt The prompt to complete
   * @param model The model to use
   * @param maxTokens Maximum number of tokens to generate
   * @param temperature Temperature for sampling
   * @returns The generated text
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
      const responseData = await response.json() as NeutralVertexGeminiResponse;
      
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
   * This is a placeholder implementation that would need to be replaced with actual token counting logic
   * @param model The model to count tokens for
   * @param content The content to count tokens for
   * @returns The token count
   */
  public countTokens(model: string, content: NeutralMessageContent): number {
    // This is a placeholder implementation
    // In a real implementation, this would use a tokenizer appropriate for the model
    // or make an API call to the Vertex AI token counting endpoint if available
    
    // For now, return a simple estimate based on character count
    // This is not accurate and should be replaced with proper token counting
    const text = typeof content === 'string' 
      ? content 
      : Array.isArray(content)
        ? content.map(item => 
            item.type === 'text' ? item.text : JSON.stringify(item)
          ).join(' ')
        : JSON.stringify(content);
    
    // Very rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}