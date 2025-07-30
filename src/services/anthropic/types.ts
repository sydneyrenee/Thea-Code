/**
 * Neutral Anthropic Types
 * 
 * This module provides neutral type definitions for Anthropic API interactions,
 * removing direct dependencies on the Anthropic SDK.
 */

import type { NeutralConversationHistory } from "../../shared/neutral-history"

/**
 * Type for Anthropic history format used in conversion functions
 */
export interface AnthropicHistoryMessage {
  role: "user" | "assistant"
  content: string | Array<unknown>
  ts?: number
}

/**
 * Type for the Anthropic API client options
 */
export interface NeutralAnthropicClientOptions {
  apiKey: string
  baseURL?: string
}

/**
 * Cache control type for ephemeral caching
 */
export interface NeutralCacheControlEphemeral {
  type: "ephemeral"
}

/**
 * Content block with text
 */
export interface NeutralTextBlock {
  type: "text"
  text: string
  cache_control?: NeutralCacheControlEphemeral
}

/**
 * Content block with thinking
 */
export interface NeutralThinkingBlock {
  type: "thinking"
  thinking: string
}

/**
 * Content block with tool use
 */
export interface NeutralToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Union type for all content block types
 */
export type NeutralContentBlock = NeutralTextBlock | NeutralThinkingBlock | NeutralToolUseBlock

/**
 * Message parameter for Anthropic API
 */
export interface NeutralMessageParam {
  role: "user" | "assistant"
  content: string | NeutralContentBlock[]
}

/**
 * Thinking configuration parameter
 */
export interface NeutralThinkingParam {
  type: "enabled" | "disabled"
  budget_tokens?: number
}

/**
 * Parameters for creating a message
 */
export interface NeutralCreateMessageParams {
  model: string
  systemPrompt: string
  messages: NeutralConversationHistory
  maxTokens?: number
  temperature?: number
  thinking?: NeutralThinkingParam
}

/**
 * Usage information returned by the API
 */
export interface NeutralUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/**
 * Message start event in streaming response
 */
export interface NeutralMessageStartEvent {
  type: "message_start"
  message: {
    usage: NeutralUsage
  }
}

/**
 * Message delta event in streaming response
 */
export interface NeutralMessageDeltaEvent {
  type: "message_delta"
  usage: {
    output_tokens: number
  }
}

/**
 * Content block start event in streaming response
 */
export interface NeutralContentBlockStartEvent {
  type: "content_block_start"
  content_block: NeutralContentBlock
  index: number
}

/**
 * Text delta in streaming response
 */
export interface NeutralTextDelta {
  type: "text_delta"
  text: string
}

/**
 * Thinking delta in streaming response
 */
export interface NeutralThinkingDelta {
  type: "thinking_delta"
  thinking: string
}

/**
 * Content block delta event in streaming response
 */
export interface NeutralContentBlockDeltaEvent {
  type: "content_block_delta"
  delta: NeutralTextDelta | NeutralThinkingDelta
}

/**
 * Union type for all streaming events
 */
export type NeutralMessageStreamEvent = 
  | NeutralMessageStartEvent 
  | NeutralMessageDeltaEvent 
  | NeutralContentBlockStartEvent 
  | NeutralContentBlockDeltaEvent

/**
 * Parameters for counting tokens
 */
export interface NeutralCountTokensParams {
  model: string
  messages: NeutralMessageParam[]
}

/**
 * Response from token counting
 */
export interface NeutralCountTokensResponse {
  input_tokens: number
}