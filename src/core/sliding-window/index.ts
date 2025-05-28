import type { ApiHandler } from "../../api";
import type { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history";

/**
 * Default percentage of the context window to use as a buffer when deciding when to truncate
 */
export const TOKEN_BUFFER_PERCENTAGE = 0.1

/**
 * Counts tokens for user content using the provider's token counting implementation.
 *
 * @param {NeutralMessageContent} content - The content to count tokens for
 * @param {ApiHandler} apiHandler - The API handler to use for token counting
 * @returns {Promise<number>} A promise resolving to the token count
 */
export async function estimateTokenCount(
	content: NeutralMessageContent,
	apiHandler: ApiHandler,
): Promise<number> {
	if (!content || content.length === 0) return 0;

	// content is already an array of blocks (NeutralMessageContent)
	let total = 0;
	for (const block of content) {
		if (block.type === 'text') {
			// apiHandler.countTokens might expect Anthropic's format.
			// For now, we'll assume it can handle a neutral text block or we'll need a conversion.
			// This part might need further adjustment based on ApiHandler's capabilities.
			total += await apiHandler.countTokens([{ type: 'text', text: block.text }]);
		} else if (block.type === 'image' && block.source) {
			if (block.source.type === 'base64') {
				const data = String(block.source.data || '');
				total += Math.ceil(Math.sqrt(data.length)) * 1.5; // Approximation for image tokens
			} else if (block.source.type === 'image_url') {
				// Placeholder for URL-based image token counting, might be a fixed value or require fetching
				total += 1000; // Arbitrary placeholder
			}
		} else {
			// For other block types (tool_use, tool_result), convert to JSON string for rough estimation
			const jsonStr = JSON.stringify(block);
			total += await apiHandler.countTokens([{ type: 'text', text: jsonStr }]);
		}
	}
	return Math.ceil(total);
}

/**
 * Truncates a conversation by removing a fraction of the messages.
 *
 * The first message is always retained, and a specified fraction (rounded to an even number)
 * of messages from the beginning (excluding the first) is removed.
 *
 * @param {NeutralConversationHistory} messages - The conversation messages.
 * @param {number} fracToRemove - The fraction (between 0 and 1) of messages (excluding the first) to remove.
 * @returns {NeutralConversationHistory} The truncated conversation messages.
 */
export function truncateConversation(
 messages: NeutralConversationHistory,
 fracToRemove: number,
): NeutralConversationHistory {
 if (messages.length === 0) return [];
 const truncatedMessages = [messages[0]];
	const rawMessagesToRemove = Math.floor((messages.length - 1) * fracToRemove)
	const messagesToRemove = rawMessagesToRemove - (rawMessagesToRemove % 2)
	const remainingMessages = messages.slice(messagesToRemove + 1)
	truncatedMessages.push(...remainingMessages)

	return truncatedMessages
}

/**
 * Conditionally truncates the conversation messages if the total token count
 * exceeds the model's limit, considering the size of incoming content.
 *
 * @param {NeutralConversationHistory} messages - The conversation messages.
 * @param {number} totalTokens - The total number of tokens in the conversation (excluding the last user message).
 * @param {number} contextWindow - The context window size.
 * @param {number} maxTokens - The maximum number of tokens allowed.
 * @param {ApiHandler} apiHandler - The API handler to use for token counting.
 * @returns {NeutralConversationHistory} The original or truncated conversation messages.
 */

type TruncateOptions = {
 messages: NeutralConversationHistory;
 totalTokens: number;
 contextWindow: number;
	maxTokens?: number | null
	apiHandler: ApiHandler
}

/**
 * Conditionally truncates the conversation messages if the total token count
 * exceeds the model's limit, considering the size of incoming content.
 *
 * @param {TruncateOptions} options - The options for truncation
 * @returns {Promise<NeutralConversationHistory>} The original or truncated conversation messages.
 */
export async function truncateConversationIfNeeded({
 messages,
 totalTokens,
 contextWindow,
 maxTokens,
 apiHandler,
}: TruncateOptions): Promise<NeutralConversationHistory> {
 if (messages.length === 0) return [];
 // Calculate the maximum tokens reserved for response
	const reservedTokens = maxTokens || contextWindow * 0.2

	// Estimate tokens for the last message (which is always a user message)
	const lastMessage = messages[messages.length - 1]
	const lastMessageContent = lastMessage.content;
	const lastMessageTokens = Array.isArray(lastMessageContent)
		? await estimateTokenCount(lastMessageContent, apiHandler)
		: await estimateTokenCount([{ type: "text", text: lastMessageContent as string }], apiHandler); // Cast to string if not array

	// Calculate total effective tokens (totalTokens never includes the last message)
	const effectiveTokens = totalTokens + lastMessageTokens

	// Calculate available tokens for conversation history
	// Truncate if we're within TOKEN_BUFFER_PERCENTAGE of the context window
	const allowedTokens = contextWindow * (1 - TOKEN_BUFFER_PERCENTAGE) - reservedTokens

	// Determine if truncation is needed and apply if necessary
	return effectiveTokens > allowedTokens ? truncateConversation(messages, 0.5) : messages
}
