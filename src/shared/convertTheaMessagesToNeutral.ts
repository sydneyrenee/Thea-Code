import type { NeutralConversationHistory } from "./neutral-history"
import type { TheaMessage } from "./ExtensionMessage"

interface TheaMessageMetricsPayload {
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
}

/**
 * Converts TheaMessage[] to NeutralConversationHistory for metrics calculation.
 * This function extracts API metrics from 'api_req_started' messages and converts them
 * to neutral format that can be processed by getApiMetrics().
 *
 * @param theaMessages - Array of TheaMessage objects from the UI
 * @returns NeutralConversationHistory with extracted metrics
 */
export function convertTheaMessagesToNeutralForMetrics(theaMessages: TheaMessage[]): NeutralConversationHistory {
	const neutralHistory: NeutralConversationHistory = []
	for (const tm of theaMessages) {
		// We are interested in 'api_req_started' messages as they historically contained metrics in tm.text
		if (tm.type === "say" && tm.say === "api_req_started" && tm.text) {
			try {
				const metricsPayload = JSON.parse(tm.text) as TheaMessageMetricsPayload
				// Ensure metricsPayload is an object and not null before accessing properties
				if (metricsPayload && typeof metricsPayload === "object") {
					neutralHistory.push({
						role: "assistant", // Assigning a role; 'assistant' or 'system' could be context-dependent
						content: "", // Content is not the primary concern for this metrics conversion
						ts: tm.ts, // Preserve timestamp
						metadata: {
							apiMetrics: {
								// Store extracted metrics here
								tokensIn:
									typeof metricsPayload.tokensIn === "number" ? metricsPayload.tokensIn : undefined,
								tokensOut:
									typeof metricsPayload.tokensOut === "number" ? metricsPayload.tokensOut : undefined,
								cacheWrites:
									typeof metricsPayload.cacheWrites === "number"
										? metricsPayload.cacheWrites
										: undefined,
								cacheReads:
									typeof metricsPayload.cacheReads === "number"
										? metricsPayload.cacheReads
										: undefined,
								cost: typeof metricsPayload.cost === "number" ? metricsPayload.cost : undefined,
							},
						},
					})
				}
			} catch (e) {
				// Log parsing errors, but continue processing other messages
				console.error(
					`[convertTheaMessagesToNeutralForMetrics] Error parsing metrics from TheaMessage text: ${tm.text}, Error: ${e}`,
				)
			}
		}
		// Other TheaMessage types are currently ignored by this specific conversion utility,
		// as it's focused on extracting metrics for getApiMetrics.
	}
	return neutralHistory
}
