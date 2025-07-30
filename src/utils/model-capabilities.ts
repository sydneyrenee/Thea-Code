/**
 * Model Capability Detection Utilities
 * 
 * This module provides utility functions for detecting model capabilities based on ModelInfo
 * properties rather than hardcoded model name checks. This approach makes the codebase more
 * maintainable and provider-agnostic.
 */

import type { ModelInfo } from "../schemas"

/**
 * Checks if a model supports computer use (tool use)
 * 
 * @param modelInfo The model information object
 * @returns True if the model supports computer use, false otherwise
 */
export function supportsComputerUse(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsComputerUse
}

/**
 * Checks if a model supports prompt caching
 * 
 * @param modelInfo The model information object
 * @returns True if the model supports prompt caching, false otherwise
 */
export function supportsPromptCaching(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsPromptCache
}

/**
 * Checks if a model supports image input
 * 
 * @param modelInfo The model information object
 * @returns True if the model supports images, false otherwise
 */
export function supportsImages(modelInfo: ModelInfo): boolean {
  return !!modelInfo.supportsImages
}

/**
 * Checks if a model supports thinking/reasoning
 * 
 * @param modelInfo The model information object
 * @returns True if the model supports thinking, false otherwise
 */
export function supportsThinking(modelInfo: ModelInfo): boolean {
  return !!modelInfo.thinking
}

/**
 * Checks if a model supports temperature adjustment
 * 
 * @param modelInfo The model information object
 * @returns True if the model supports temperature adjustment, false otherwise
 */
export function supportsTemperature(modelInfo: ModelInfo): boolean {
  return modelInfo.supportsTemperature !== false
}

/**
 * Gets the appropriate max tokens for a model
 * 
 * @param modelInfo The model information object
 * @param defaultMaxTokens The default max tokens to use if not specified in the model info
 * @returns The max tokens value to use for the model
 */
export function getMaxTokens(modelInfo: ModelInfo, defaultMaxTokens: number = 4096): number {
  return modelInfo.maxTokens ?? defaultMaxTokens
}

/**
 * Gets the reasoning effort level for a model
 * 
 * @param modelInfo The model information object
 * @returns The reasoning effort level or undefined if not specified
 */
export function getReasoningEffort(modelInfo: ModelInfo): "low" | "medium" | "high" | undefined {
  return modelInfo.reasoningEffort
}

/**
 * Checks if a model supports a specific capability
 * 
 * @param modelInfo The model information object
 * @param capability The capability to check for
 * @returns True if the model supports the capability, false otherwise
 */
export function hasCapability(
  modelInfo: ModelInfo, 
  capability: "computerUse" | "promptCache" | "images" | "thinking" | "temperature"
): boolean {
  switch (capability) {
    case "computerUse":
      return supportsComputerUse(modelInfo)
    case "promptCache":
      return supportsPromptCaching(modelInfo)
    case "images":
      return supportsImages(modelInfo)
    case "thinking":
      return supportsThinking(modelInfo)
    case "temperature":
      return supportsTemperature(modelInfo)
    default:
      return false
  }
}

/**
 * Gets the context window size for a model
 * 
 * @param modelInfo The model information object
 * @param defaultContextWindow The default context window to use if not specified
 * @returns The context window size for the model
 */
export function getContextWindowSize(modelInfo: ModelInfo, defaultContextWindow: number = 8192): number {
  return modelInfo.contextWindow ?? defaultContextWindow
}