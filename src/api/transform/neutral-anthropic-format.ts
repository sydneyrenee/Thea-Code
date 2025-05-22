import { Anthropic } from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages"; // Import Anthropic types

import type {
    NeutralConversationHistory,
    NeutralMessage,
    NeutralMessageContent,
    NeutralContentBlock,
    NeutralTextContentBlock,
    NeutralImageContentBlock,
    NeutralToolUseContentBlock,
    NeutralToolResultContentBlock
} from "../../shared/neutral-history"; // Import neutral history types

/**
 * Converts a history from the Anthropic format to the Neutral format.
 */
export function convertToNeutralHistory(
    anthropicHistory: (MessageParam & { ts?: number })[] // Input type includes optional timestamp
): NeutralConversationHistory {
    return anthropicHistory.map(anthropicMessage => {
        const neutralMessage: NeutralMessage = {
            role: anthropicMessage.role as NeutralMessage['role'],
            content: [], // Initialize content as an array of blocks
            ts: anthropicMessage.ts,
            metadata: {} // Initialize metadata
        };

        if (typeof anthropicMessage.content === 'string') {
            // If content is a string, convert to a single text block
            neutralMessage.content = [{ type: 'text', text: anthropicMessage.content }];
        } else if (Array.isArray(anthropicMessage.content)) {
            // If content is an array of blocks, convert each block
            neutralMessage.content = anthropicMessage.content.map(block => {
                if (block.type === 'text') {
                    return { type: 'text', text: block.text } as NeutralTextContentBlock;
                } else if (block.type === 'image') {
                    // Convert Anthropic image source to Neutral image source
                    const source = block.source;
                    // Determine if it's a URL or Base64 source
                    if (source.type === 'url') {
                        return {
                            type: 'image_url',
                            source: {
                                type: 'image_url',
                                url: source.url
                            }
                        } as NeutralImageContentBlock;
                    } else {
                        return {
                            type: 'image_base64',
                            source: {
                                type: 'base64',
                                media_type: source.media_type,
                                data: source.data
                            }
                        } as NeutralImageContentBlock;
                    }
                } else if (block.type === 'tool_use') {
                    return {
                        type: 'tool_use',
                        id: block.id,
                        name: block.name,
                        input: block.input as Record<string, any> // Assuming input is compatible
                    } as NeutralToolUseContentBlock;
                } else if (block.type === 'tool_result') {
                    // Convert Anthropic tool result content to Neutral content
                    const toolResultContent: Array<NeutralTextContentBlock | NeutralImageContentBlock> = [];
                    if (typeof block.content === 'string') {
                         toolResultContent.push({ type: 'text', text: block.content });
                    } else if (Array.isArray(block.content)) {
                         block.content.forEach(part => {
                             if (part.type === 'text') {
                                 toolResultContent.push({ type: 'text', text: part.text });
                             } else if (part.type === 'image') {
                                  toolResultContent.push({
                                     type: 'image_base64',
                                     source: {
                                         type: 'base64',
                                         media_type: part.source.media_type,
                                         data: part.source.data
                                     }
                                  });
                             }
                         });
                    }

                    return {
                        type: 'tool_result',
                        tool_use_id: block.tool_use_id,
                        content: toolResultContent,
                        // Status and error are not explicitly in Anthropic's ToolResultBlockParam,
                        // so we might need to infer or add them elsewhere if needed.
                    } as NeutralToolResultContentBlock;
                }
                // Handle other potential block types if necessary, or return a default/error block
                return { type: 'text', text: `[Unsupported Anthropic block type: ${(block as any).type}]` } as NeutralTextContentBlock;
            });
        }

        // Filter out any null or undefined blocks if the mapping logic above could produce them
        neutralMessage.content = (neutralMessage.content as NeutralMessageContent).filter(block => block !== null);


        return neutralMessage;
    });
}

/**
 * Converts a history from the Neutral format back to the Anthropic format.
/**
 * Converts NeutralMessageContent to an array of Anthropic ContentBlockParam.
 */
export function convertToAnthropicContentBlocks(
    neutralContent: NeutralMessageContent
): Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam> {
    const anthropicBlocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam> = [];

    if (typeof neutralContent === 'string') {
        // If content is a string, convert to a single text block
        anthropicBlocks.push({ type: 'text', text: neutralContent });
    } else if (Array.isArray(neutralContent)) {
        // If content is an array of blocks, convert each block
        neutralContent.forEach(block => {
            if (block.type === 'text') {
                anthropicBlocks.push({ type: 'text', text: block.text });
            } else if (block.type === 'image_url' || block.type === 'image_base64') {
                 // Convert Neutral image source to Anthropic image source
                 if (block.type === 'image_url') {
                     anthropicBlocks.push({
                         type: 'image',
                         source: {
                             type: 'url',
                             url: (block.source as { type: 'image_url', url: string }).url
                         }
                     });
                 } else { // image_base64
                     anthropicBlocks.push({
                         type: 'image',
                         source: {
                             type: 'base64',
                             media_type: (block.source as { type: 'base64', media_type: string, data: string }).media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                             data: (block.source as { type: 'base64', media_type: string, data: string }).data
                         }
                     });
                 }
            } else if (block.type === 'tool_use') {
                anthropicBlocks.push({
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input // Assuming input is compatible
                });
            } else if (block.type === 'tool_result') {
                // Convert Neutral tool result content to Anthropic content
                const toolResultContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
                 if (Array.isArray(block.content)) { // Neutral tool_result content is always an array
                     block.content.forEach(part => {
                         if (part.type === 'text') {
                             toolResultContent.push({ type: 'text', text: part.text });
                         } else if (part.type === 'image_url' || part.type === 'image_base64') {
                              if (part.type === 'image_url') {
                                  toolResultContent.push({
                                      type: 'image',
                                      source: {
                                          type: 'url',
                                          url: (part.source as { type: 'image_url', url: string }).url
                                      }
                                  });
                              } else { // image_base64
                                  toolResultContent.push({
                                      type: 'image',
                                      source: {
                                          type: 'base64',
                                          media_type: (part.source as { type: 'base64', media_type: string, data: string }).media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                                          data: (part.source as { type: 'base64', media_type: string, data: string }).data
                                      }
                                  });
                              }
                         }
                     });
                 }

                anthropicBlocks.push({
                    type: 'tool_result',
                    tool_use_id: block.tool_use_id,
                    content: toolResultContent.length > 0 ? toolResultContent : '', // Anthropic tool_result content can be string or array
                });
            } else {
                // Handle other potential block types if necessary, or return a default/error block
                // This case should ideally not be reached if NeutralHistory is well-defined
                const unknownBlock = block as NeutralContentBlock;
                console.warn(`convertToAnthropicContentBlocks: Encountered unexpected Neutral block type: ${unknownBlock.type}`);
                anthropicBlocks.push({ type: 'text', text: `[Unsupported Neutral block type: ${unknownBlock.type}]` });
            }
        });
    }

    // Filter out any null or undefined blocks if the mapping logic above could produce them
    return anthropicBlocks.filter(block => block !== null);
}


/**
 * Converts a history from the Neutral format back to the Anthropic format.
 */
export function convertToAnthropicHistory(
    neutralHistory: NeutralConversationHistory
): (MessageParam & { ts?: number })[] { // Return type includes optional timestamp
    return neutralHistory.map(neutralMessage => {
        const anthropicMessage: MessageParam & { ts?: number } = {
            role: neutralMessage.role as MessageParam['role'],
            content: [], // Initialize content as an array of blocks
            ts: neutralMessage.ts,
            // Anthropic MessageParam does not have a metadata property, so we omit it
        };

        if (typeof neutralMessage.content === 'string') {
            // If content is a string, convert to a single text block
            anthropicMessage.content = neutralMessage.content; // Anthropic also supports string content
        } else if (Array.isArray(neutralMessage.content)) {
            // If content is an array of blocks, convert each block using the helper
            const convertedContent = convertToAnthropicContentBlocks(neutralMessage.content);
            anthropicMessage.content = convertedContent.length > 0 ? convertedContent : '';
        } else {
            // Handle unexpected content types by setting to empty string
            anthropicMessage.content = '';
        }


        return anthropicMessage;
    });
}