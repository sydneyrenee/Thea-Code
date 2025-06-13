import { TokenUsage } from "../schemas"

import type { NeutralConversationHistory, NeutralMessage } from "./neutral-history" // Import neutral types

/**
 * Calculates API metrics from a NeutralConversationHistory.
 *
 * This function processes NeutralMessages, looking for API metrics stored
 * in their metadata (under `metadata.apiMetrics`).
 * It sums up tokensIn, tokensOut, cacheWrites, cacheReads, and cost.
 * Context tokens are calculated from the last message found containing API metrics.
 *
 * @param messages - A NeutralConversationHistory (array of NeutralMessage objects) to process.
 * @returns A TokenUsage object.
 */
export function getApiMetrics(messages: NeutralConversationHistory): TokenUsage {
	const result: TokenUsage = {
		totalTokensIn: 0,
		totalTokensOut: 0,
		totalCacheWrites: undefined,
		totalCacheReads: undefined,
		totalCost: 0,
		contextTokens: 0,
	}

	let lastMessageWithMetrics: NeutralMessage | undefined = undefined

	for (const message of messages) {
		// Check if metadata and apiMetrics exist and apiMetrics is an object
		if (
			message.metadata &&
			typeof message.metadata.apiMetrics === "object" &&
			message.metadata.apiMetrics !== null
		) {
			const metrics = message.metadata.apiMetrics as {
				tokensIn?: number
				tokensOut?: number
				cacheWrites?: number
				cacheReads?: number
				cost?: number
			}

			if (typeof metrics.tokensIn === "number") {
				result.totalTokensIn += metrics.tokensIn
			}
			if (typeof metrics.tokensOut === "number") {
				result.totalTokensOut += metrics.tokensOut
			}
			if (typeof metrics.cacheWrites === "number") {
				result.totalCacheWrites = (result.totalCacheWrites ?? 0) + metrics.cacheWrites
			}
			if (typeof metrics.cacheReads === "number") {
				result.totalCacheReads = (result.totalCacheReads ?? 0) + metrics.cacheReads
			}
			if (typeof metrics.cost === "number") {
				result.totalCost += metrics.cost
			}
			// Update lastMessageWithMetrics if the current message has apiMetrics
			lastMessageWithMetrics = message
		}
	}

	// Calculate contextTokens from the last message that had API metrics
	if (lastMessageWithMetrics?.metadata?.apiMetrics) {
		const metrics = lastMessageWithMetrics.metadata.apiMetrics as {
			tokensIn?: number
			tokensOut?: number
			cacheWrites?: number
			cacheReads?: number
		}
		let currentContextTokens = 0
		if (typeof metrics.tokensIn === "number") currentContextTokens += metrics.tokensIn
		if (typeof metrics.tokensOut === "number") currentContextTokens += metrics.tokensOut
		// Per original logic, context tokens seemed to include cache R/W as well.
		if (typeof metrics.cacheWrites === "number") currentContextTokens += metrics.cacheWrites
		if (typeof metrics.cacheReads === "number") currentContextTokens += metrics.cacheReads
		result.contextTokens = currentContextTokens
	}

	return result
}
