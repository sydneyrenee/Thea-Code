import type {
    NeutralConversationHistory,
    NeutralMessage,
    NeutralMessageContent,
    NeutralTextContentBlock,
    NeutralImageContentBlock,
    NeutralToolUseContentBlock,
    NeutralToolResultContentBlock
} from "../../shared/neutral-history";
import { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage";
import { SystemMessage } from "@mistralai/mistralai/models/components/systemmessage";
import { ToolMessage } from "@mistralai/mistralai/models/components/toolmessage";
import { UserMessage } from "@mistralai/mistralai/models/components/usermessage";

export type MistralMessage =
    | (SystemMessage & { role: "system" })
    | (UserMessage & { role: "user" })
    | (AssistantMessage & { role: "assistant" })
    | (ToolMessage & { role: "tool" });

/**
 * Converts a history from the Neutral format to the Mistral format.
 */
export function convertToMistralMessages(
    neutralHistory: NeutralConversationHistory
): MistralMessage[] {
    const mistralMessages: MistralMessage[] = [];

    for (const neutralMessage of neutralHistory) {
        if (typeof neutralMessage.content === "string") {
            mistralMessages.push({
                role: neutralMessage.role,
                content: neutralMessage.content,
            });
        } else {
            if (neutralMessage.role === "user") {
                const { nonToolMessages, toolMessages } = neutralMessage.content.reduce<{
                    nonToolMessages: (NeutralTextContentBlock | NeutralImageContentBlock)[]
                    toolMessages: NeutralToolResultContentBlock[]
                }>(
                    (acc, part) => {
                        if (part.type === "tool_result") {
                            acc.toolMessages.push(part);
                        } else if (part.type === "text" || part.type === "image") {
                            acc.nonToolMessages.push(part);
                        } // user cannot send tool_use messages
                        return acc;
                    },
                    { nonToolMessages: [], toolMessages: [] },
                );

                if (nonToolMessages.length > 0) {
                    mistralMessages.push({
                        role: "user",
                        content: nonToolMessages.map((part) => {
                            if (part.type === "image") {
                                return {
                                    type: "image_url",
                                    imageUrl: {
                                        url: `data:${part.source.media_type};base64,${part.source.data}`,
                                    },
                                };
                            }
                            return { type: "text", text: part.text };
                        }),
                    });
                }
            } else if (neutralMessage.role === "assistant") {
                const { nonToolMessages, toolMessages } = neutralMessage.content.reduce<{
                    nonToolMessages: (NeutralTextContentBlock | NeutralImageContentBlock)[]
                    toolMessages: NeutralToolUseContentBlock[]
                }>(
                    (acc, part) => {
                        if (part.type === "tool_use") {
                            acc.toolMessages.push(part);
                        } else if (part.type === "text" || part.type === "image") {
                            acc.nonToolMessages.push(part);
                        } // assistant cannot send tool_result messages
                        return acc;
                    },
                    { nonToolMessages: [], toolMessages: [] },
                );

                let content: string | undefined;
                if (nonToolMessages.length > 0) {
                    content = nonToolMessages
                        .map((part) => {
                            if (part.type === "image") {
                                return ""; // impossible as the assistant cannot send images
                            }
                            return part.text;
                        })
                        .join("\n");
                }

                mistralMessages.push({
                    role: "assistant",
                    content,
                });
            } else if (neutralMessage.role === "system") {
                // Handle system messages
                const textContent = neutralMessage.content
                    .filter(block => block.type === "text")
                    .map(block => (block as NeutralTextContentBlock).text)
                    .join("\n");
                
                mistralMessages.push({
                    role: "system",
                    content: textContent,
                });
            }
        }
    }

    return mistralMessages;
}

/**
 * Converts a message content from the Neutral format to Mistral format.
 */
export function convertToMistralContent(
    neutralContent: NeutralMessageContent
): string | any[] {
    if (typeof neutralContent === "string") {
        return neutralContent;
    }

    // For array content, convert to Mistral's expected format
    return neutralContent.map(block => {
        if (block.type === "text") {
            return { type: "text", text: block.text };
        } else if (block.type === "image") {
            return {
                type: "image_url",
                imageUrl: {
                    url: `data:${block.source.media_type};base64,${block.source.data}`,
                }
            };
        }
        // Other block types are not directly supported in Mistral's content format
        return { type: "text", text: `[Unsupported content type: ${block.type}]` };
    });
}

/**
 * Converts a history from Mistral format to the Neutral format.
 */
export function convertToNeutralHistoryFromMistral(
    mistralMessages: MistralMessage[]
): NeutralConversationHistory {
    return mistralMessages.map(mistralMessage => {
        const neutralMessage: NeutralMessage = {
            role: mistralMessage.role as NeutralMessage['role'],
            content: []
        };

        if (typeof mistralMessage.content === "string") {
            neutralMessage.content = [{ type: "text", text: mistralMessage.content }];
        } else if (Array.isArray(mistralMessage.content)) {
            neutralMessage.content = mistralMessage.content.map(part => {
                if (part.type === "text") {
                    return { type: "text", text: part.text } as NeutralTextContentBlock;
                } else if (part.type === "image_url") {
                    // Extract base64 data from data URL
                    // Handle both string and object formats for imageUrl
                    const url = typeof part.imageUrl === 'string' ? part.imageUrl : part.imageUrl.url;
                    const match = url.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        const [, media_type, data] = match;
                        return {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type,
                                data
                            }
                        } as NeutralImageContentBlock;
                    }
                }
                return { type: "text", text: `[Unsupported Mistral content type: ${(part as any).type}]` } as NeutralTextContentBlock;
            });
        }

        return neutralMessage;
    });
}