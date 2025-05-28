import OpenAI from "openai";
import type {
    NeutralConversationHistory,
    NeutralMessage,
    NeutralMessageContent,
    NeutralTextContentBlock,
    NeutralImageContentBlock,
    NeutralToolUseContentBlock,
    NeutralToolResultContentBlock
} from "../../shared/neutral-history"; // Import neutral history types

/**
 * Converts a history from the Neutral format to the OpenAI format.
 */
export function convertToOpenAiHistory(
    neutralHistory: NeutralConversationHistory
): OpenAI.Chat.ChatCompletionMessageParam[] {
    return neutralHistory.map(neutralMessage => {
        // Create a properly typed message based on role
        let openAiMessage: OpenAI.Chat.ChatCompletionMessageParam;

        // Initialize with the appropriate role-specific type
        switch (neutralMessage.role) {
            case 'user':
                openAiMessage = {
                    role: 'user',
                    content: "" // Empty string instead of null
                };
                break;
            case 'assistant':
                openAiMessage = {
                    role: 'assistant',
                    content: "" // Empty string instead of null
                };
                break;
            case 'system':
                openAiMessage = {
                    role: 'system',
                    content: "" // Empty string instead of null
                };
                break;
            case 'tool':
                openAiMessage = {
                    role: 'tool',
                    content: "", // Empty string instead of null
                    tool_call_id: '' // Will be populated later
                };
                break;
            default:
                console.warn(`Unknown role type: ${String(neutralMessage.role)}, defaulting to 'user'`);
                openAiMessage = {
                    role: 'user',
                    content: "" // Empty string instead of null
                };
        }

        // Handle content based on its type
        if (typeof neutralMessage.content === 'string') {
            // If content is a simple string, use it directly
            openAiMessage.content = neutralMessage.content;
        } else if (Array.isArray(neutralMessage.content)) {
            // If content is an array of blocks, convert to OpenAI format
            const contentBlocks = convertToOpenAiContentBlocks(neutralMessage.content);

            // Check if there are tool calls or tool results
            const toolUseBlocks = neutralMessage.content.filter(block => block.type === 'tool_use');

            if (toolUseBlocks.length > 0 && neutralMessage.role === 'assistant') {
                // For assistant messages with tool calls, use the special tool_calls format
                // We need to cast to a more specific type because the TypeScript definitions
                // don't include tool_calls on the base message type
                interface AssistantMessageWithToolCalls extends OpenAI.Chat.ChatCompletionAssistantMessageParam {
                    tool_calls: Array<{
                        id: string;
                        type: 'function';
                        function: {
                            name: string;
                            arguments: string;
                        };
                    }>;
                }

                (openAiMessage as AssistantMessageWithToolCalls).tool_calls = toolUseBlocks.map(block => ({
                    id: block.id,
                    type: 'function' as const,
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input)
                    }
                }));

                // Filter out non-tool blocks for the content
                const textBlocks = neutralMessage.content.filter(block => block.type === 'text');
                if (textBlocks.length > 0) {
                    // If there are text blocks, combine them
                    openAiMessage.content = textBlocks.map(block => block.text).join('\n\n');
                } else {
                    // If no text blocks, set content to null (OpenAI allows this when tool_calls is present)
                    openAiMessage.content = null;
                }
            } else if (neutralMessage.role === 'tool') {
                // For tool messages, use the tool_call_id format
                const toolResultBlock = neutralMessage.content.find(block => block.type === 'tool_result') as NeutralToolResultContentBlock;
                if (toolResultBlock) {
                    // For tool messages, we can directly set tool_call_id
                    (openAiMessage as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id = toolResultBlock.tool_use_id;

                    // Combine all text content from the tool result
                    const textContent = toolResultBlock.content
                        .filter(block => block.type === 'text')
                        .map(block => (block).text)
                        .join('\n\n');

                    openAiMessage.content = textContent;
                }
            } else {
                // For regular messages with multiple content blocks
                if (contentBlocks.length === 1 && typeof contentBlocks[0] === 'string') {
                    // If there's only one text block, use it directly
                    openAiMessage.content = contentBlocks[0];
                } else if (contentBlocks.length > 0) {
                    // If there are multiple blocks or non-text blocks, use the array format
                    // Use a type assertion to a more specific type
                    openAiMessage.content = contentBlocks as Array<OpenAI.Chat.ChatCompletionContentPart>;
                }
            }
        }

        return openAiMessage;
    });
}


/**
 * Converts NeutralMessageContent to OpenAI content format.
 * This can return either a string (for simple text) or an array of content parts.
 */
export function convertToOpenAiContentBlocks(
    neutralContent: NeutralMessageContent
): string | Array<OpenAI.Chat.ChatCompletionContentPart> {
    // If content is a simple string, return it directly
    if (typeof neutralContent === 'string') {
        return neutralContent;
    }

    // If it's an array with only one text block, return it as a string for simplicity
    if (neutralContent.length === 1 && neutralContent[0].type === 'text') {
        return (neutralContent[0]).text;
    }

    // Otherwise, convert each block to the appropriate OpenAI format
    // Create a properly typed array
    const result: Array<OpenAI.Chat.ChatCompletionContentPart> = [];

    // Process each block
    for (const block of neutralContent) {
        if (block.type === 'text') {
            result.push({
                type: 'text',
                text: (block).text
            });
        } else if (block.type === 'image') {
            const imageBlock = block;
            result.push({
                type: 'image_url',
                image_url: {
                    url: `data:${imageBlock.source.media_type as string};base64,${imageBlock.source.data as string}`
                }
            });
        } else if (block.type === 'tool_use' || block.type === 'tool_result') {
            // Tool use and tool result blocks are handled separately in the message conversion
            // Return a placeholder that will be filtered out later
            result.push({
                type: 'text',
                text: `[${block.type} - handled separately]`
            });
        } else {
            // Handle any other block types - use a type assertion to avoid 'never' type issues
            const unknownBlock = block as { type: string };
            console.warn(`Unsupported block type: ${unknownBlock.type}`);
            result.push({
                type: 'text',
                text: `[Unsupported block type: ${unknownBlock.type}]`
            });
        }
    }

    return result;
}

/**
 * Converts a history from the OpenAI format to the Neutral format.
 */
export function convertToNeutralHistoryFromOpenAi(
    openAiHistory: OpenAI.Chat.ChatCompletionMessageParam[]
): NeutralConversationHistory {
    return openAiHistory.map(openAiMessage => {
        const neutralMessage: NeutralMessage = {
            role: mapRoleFromOpenAi(openAiMessage.role),
            content: [] // Will be populated below
        };

        // Handle content based on its type
        if (typeof openAiMessage.content === 'string') {
            // If content is a simple string, create a text block
            neutralMessage.content = [{
                type: 'text',
                text: openAiMessage.content
            }];
        } else if (Array.isArray(openAiMessage.content)) {
            // If content is an array, convert each part
            neutralMessage.content = openAiMessage.content.flatMap(part => {
                if (part.type === 'text') {
                    return {
                        type: 'text',
                        text: part.text
                    } as NeutralTextContentBlock;
                } else if (part.type === 'image_url') {
                    // Handle image URLs - this is a simplification
                    // For base64 images, we'd need to extract the data and media type
                    const url = typeof part.image_url === 'string'
                        ? part.image_url
                        : part.image_url.url;

                    // Check if it's a base64 image
                    if (url.startsWith('data:')) {
                        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
                        if (matches && matches.length === 3) {
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: matches[1],
                                    data: matches[2]
                                }
                            } as NeutralImageContentBlock;
                        }
                    }

                    // For non-base64 images, we'd need a different approach
                    console.warn('Non-base64 image URLs not fully supported');
                    return {
                        type: 'text',
                        text: `[Image: ${url}]`
                    } as NeutralTextContentBlock;
                }

                // Handle other part types
                console.warn(`Unsupported OpenAI content part type: ${part.type}`);
                return {
                    type: 'text',
                    text: `[Unsupported content type: ${part.type}]`
                } as NeutralTextContentBlock;
            });
        }

        // Handle tool calls for assistant messages
        // Define a more specific interface for assistant messages with tool calls
        interface AssistantMessageWithToolCalls extends OpenAI.Chat.ChatCompletionAssistantMessageParam {
            tool_calls: Array<{
                id: string;
                type: string;
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        }

        // Cast to the more specific type
        const assistantWithTools = openAiMessage as AssistantMessageWithToolCalls;

        if (assistantWithTools.tool_calls && openAiMessage.role === 'assistant') {
            assistantWithTools.tool_calls.forEach((toolCall: {
                id: string;
                type: string;
                function: {
                    name: string;
                    arguments: string;
                }
            }) => {
                if (toolCall.type === 'function') {
                    // Parse the arguments JSON
                    let args: Record<string, unknown> = {};
                    try {
                        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
                    } catch (e) {
                        console.warn('Failed to parse tool call arguments:', e);
                        args = { raw: toolCall.function.arguments };
                    }

                    // Add tool use block
                    (neutralMessage.content as NeutralMessageContent).push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input: args
                    } as NeutralToolUseContentBlock);
                }
            });
        }

        // Handle tool results for tool messages
        // Define a more specific interface for tool messages with tool_call_id
        interface ToolMessageWithCallId extends OpenAI.Chat.ChatCompletionToolMessageParam {
            tool_call_id: string;
        }

        // Cast to the more specific type
        const toolMessage = openAiMessage as ToolMessageWithCallId;

        if (openAiMessage.role === 'tool' && toolMessage.tool_call_id) {
            // Create a tool result block
            const toolResult: NeutralToolResultContentBlock = {
                type: 'tool_result',
                tool_use_id: toolMessage.tool_call_id,
                content: [{
                    type: 'text',
                    text: typeof openAiMessage.content === 'string'
                        ? openAiMessage.content
                        : JSON.stringify(openAiMessage.content)
                }]
            };

            // Replace the content with the tool result
            neutralMessage.content = [toolResult];
        }

        return neutralMessage;
    });
}

/**
 * Maps OpenAI roles to neutral roles
 */
function mapRoleFromOpenAi(role: string): 'user' | 'assistant' | 'system' | 'tool' {
    switch (role) {
        case 'user':
            return 'user';
        case 'assistant':
            return 'assistant';
        case 'system':
            return 'system';
        case 'tool':
            return 'tool';
        default:
            console.warn(`Unknown OpenAI role: ${role}, defaulting to 'user'`);
            return 'user';
    }
}
