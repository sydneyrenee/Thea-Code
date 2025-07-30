import type { NeutralConversationHistory } from "../../shared/neutral-history";

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

/**
 * Cache control for ephemeral content
 */
export interface NeutralCacheControlEphemeral {
  type: "ephemeral";
}

/**
 * Gemini API response structure for streaming
 */
export interface NeutralVertexGeminiStreamEvent {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

/**
 * Gemini API response structure for non-streaming
 */
export interface NeutralVertexGeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}