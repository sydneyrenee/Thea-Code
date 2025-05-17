import OpenAI from "openai";
import type {
    NeutralConversationHistory,
    NeutralMessage,
    NeutralMessageContent,
    NeutralTextContentBlock,
    NeutralImageContentBlock,
    NeutralToolUseContentBlock,
    NeutralToolResultContentBlock
} from "../../shared/neutral-history";

/**
 * Converts a history from the Neutral format to the Ollama format.
 * Ollama uses OpenAI-compatible format, but with simpler structure.
 */
export function convertToOllamaHistory(
    neutralHistory: NeutralConversationHistory
): OpenAI.Chat.ChatCompletionMessageParam[] {
    return neutralHistory.map(neutralMessage => {
        // Create a properly typed message based on role
        let ollamaMessage: OpenAI.Chat.ChatCompletionMessageParam;
        
        // Initialize with the appropriate role-specific type
        switch (neutralMessage.role) {
            case 'user':
                ollamaMessage = {
                    role: 'user',
                    content: "" // Empty string instead of null
                };
                break;
            case 'assistant':
                ollamaMessage = {
                    role: 'assistant',
                    content: "" // Empty string instead of null
                };
                break;
            case 'system':
                ollamaMessage = {
                    role: 'system',
                    content: "" // Empty string instead of null
                };
                break;
            default:
                console.warn(`Unknown role type: ${neutralMessage.role}, defaulting to 'user'`);
                ollamaMessage = {
                    role: 'user',
                    content: "" // Empty string instead of null
                };
        }

        // Handle content based on its type
        if (typeof neutralMessage.content === 'string') {
            // If content is a simple string, use it directly
            ollamaMessage.content = neutralMessage.content;
        } else if (Array.isArray(neutralMessage.content)) {
            // For Ollama, we need to convert all content blocks to a single string
            // since it doesn't support complex content types
            const textBlocks = neutralMessage.content
                .filter(block => block.type === 'text')
                .map(block => (block as NeutralTextContentBlock).text);
            
            // Join all text blocks with newlines
            ollamaMessage.content = textBlocks.join('\n\n');
            
            // If there are non-text blocks, log a warning
            if (neutralMessage.content.some(block => block.type !== 'text')) {
                console.warn('Ollama does not support non-text content. Some content may be lost.');
            }
        }

        return ollamaMessage;
    });
}

/**
 * Converts NeutralMessageContent to a string for Ollama.
 * Ollama only supports text content, so we extract text from the content blocks.
 */
export function convertToOllamaContentBlocks(
    neutralContent: NeutralMessageContent
): string {
    // If content is a simple string, return it directly
    if (typeof neutralContent === 'string') {
        return neutralContent;
    }
    
    // Extract text from all text blocks
    const textBlocks = neutralContent
        .filter(block => block.type === 'text')
        .map(block => (block as NeutralTextContentBlock).text);
    
    // Join all text blocks with newlines
    return textBlocks.join('\n\n');
}

/**
 * Converts a history from the Ollama format to the Neutral format.
 */
export function convertToNeutralHistoryFromOllama(
    ollamaHistory: OpenAI.Chat.ChatCompletionMessageParam[]
): NeutralConversationHistory {
    return ollamaHistory.map(ollamaMessage => {
        const neutralMessage: NeutralMessage = {
            role: mapRoleFromOllama(ollamaMessage.role),
            content: [] // Will be populated below
        };

        // Handle content based on its type
        if (typeof ollamaMessage.content === 'string') {
            // If content is a simple string, create a text block
            neutralMessage.content = [{
                type: 'text',
                text: ollamaMessage.content
            }];
        } else if (Array.isArray(ollamaMessage.content)) {
            // This shouldn't happen with Ollama, but handle it just in case
            // by converting each part to a text block
            neutralMessage.content = ollamaMessage.content.map(part => {
                if (typeof part === 'string') {
                    return {
                        type: 'text',
                        text: part
                    } as NeutralTextContentBlock;
                } else {
                    // This is a fallback for unexpected content types
                    return {
                        type: 'text',
                        text: JSON.stringify(part)
                    } as NeutralTextContentBlock;
                }
            });
        } else if (ollamaMessage.content !== null && ollamaMessage.content !== undefined) {
            // Handle object or other non-string, non-array content by stringifying
            neutralMessage.content = [{
                type: 'text',
                text: JSON.stringify(ollamaMessage.content)
            }];
        }

        return neutralMessage;
    });
}

/**
 * Maps Ollama roles to neutral roles
 */
function mapRoleFromOllama(role: string): 'user' | 'assistant' | 'system' | 'tool' {
    switch (role) {
        case 'user':
            return 'user';
        case 'assistant':
            return 'assistant';
        case 'system':
            return 'system';
        default:
            console.warn(`Unknown Ollama role: ${role}, defaulting to 'user'`);
            return 'user';
    }
}