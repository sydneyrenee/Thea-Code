import { ConversationRole, Message, ContentBlock } from "@aws-sdk/client-bedrock-runtime";
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
 * Convert Neutral messages to Bedrock Converse format
 */
export function convertToBedrockConverseMessages(neutralHistory: NeutralConversationHistory): Message[] {
    return neutralHistory.map((neutralMessage) => {
        // Map Neutral roles to Bedrock roles
        const role: ConversationRole = neutralMessage.role === "assistant" ? "assistant" : "user";

        if (typeof neutralMessage.content === "string") {
            return {
                role,
                content: [
                    {
                        text: neutralMessage.content,
                    },
                ] as ContentBlock[],
            };
        }

        // Process complex content types
        const content = neutralMessage.content.map((block) => {
            if (block.type === "text") {
                return {
                    text: block.text || "",
                } as ContentBlock;
            }

            if (block.type === "image") {
                // Convert base64 string to byte array if needed
                let byteArray: Uint8Array;
                if (typeof block.source.data === "string") {
                    const binaryString = atob(block.source.data);
                    byteArray = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        byteArray[i] = binaryString.charCodeAt(i);
                    }
                } else {
                    byteArray = block.source.data as unknown as Uint8Array;
                }

                // Extract format from media_type (e.g., "image/jpeg" -> "jpeg")
                const format = block.source.media_type.split("/")[1];
                if (!["png", "jpeg", "gif", "webp"].includes(format)) {
                    throw new Error(`Unsupported image format: ${format}`);
                }

                return {
                    image: {
                        format: format as "png" | "jpeg" | "gif" | "webp",
                        source: {
                            bytes: byteArray,
                        },
                    },
                } as ContentBlock;
            }

            if (block.type === "tool_use") {
                // Convert tool use to XML format
                const toolParams = Object.entries(block.input || {})
                    .map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
                    .join("\n");

                return {
                    toolUse: {
                        toolUseId: block.id || "",
                        name: block.name || "",
                        input: `<${block.name}>\n${toolParams}\n</${block.name}>`,
                    },
                } as ContentBlock;
            }

            if (block.type === "tool_result") {
                // First try to use content if available
                if (block.content && Array.isArray(block.content)) {
                    return {
                        toolResult: {
                            toolUseId: block.tool_use_id || "",
                            content: block.content.map((item) => {
                                if (item.type === "text") {
                                    return { text: item.text };
                                }
                                // Skip images in tool results as they're handled separately
                                return { text: "(see following message for image)" };
                            }),
                            status: "success",
                        },
                    } as ContentBlock;
                }

                // Default case
                return {
                    toolResult: {
                        toolUseId: block.tool_use_id || "",
                        content: [
                            {
                                text: "Tool result content unavailable",
                            },
                        ],
                        status: "success",
                    },
                } as ContentBlock;
            }

            // Default case for unknown block types
            return {
                text: `[Unknown Block Type]`,
            } as ContentBlock;
        });

        return {
            role,
            content,
        };
    });
}

/**
 * Convert Bedrock Converse messages to Neutral format
 */
export function convertToNeutralHistoryFromBedrock(bedrockMessages: Message[]): NeutralConversationHistory {
    return bedrockMessages.map((bedrockMessage) => {
        const neutralMessage: NeutralMessage = {
            role: bedrockMessage.role === "assistant" ? "assistant" : "user",
            content: [],
        };

        if (!bedrockMessage.content || !Array.isArray(bedrockMessage.content)) {
            neutralMessage.content = "[No content]";
            return neutralMessage;
        }

        const contentBlocks: NeutralMessageContent = bedrockMessage.content.map((block) => {
            if ("text" in block && block.text) {
                return {
                    type: "text",
                    text: block.text,
                } as NeutralTextContentBlock;
            }

            if ("image" in block && block.image) {
                // Convert byte array to base64 if needed
                let base64Data: string;
                if (block.image.source && "bytes" in block.image.source) {
                    const bytes = block.image.source.bytes;
                    // Ensure bytes is not undefined before creating Uint8Array
                    const binary = bytes ? Array.from(new Uint8Array(bytes))
                        .map((byte) => String.fromCharCode(byte))
                        .join("") : "";
                    base64Data = binary ? btoa(binary) : "";
                } else {
                    base64Data = "";
                }

                return {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: `image/${block.image.format}`,
                        data: base64Data,
                    },
                } as NeutralImageContentBlock;
            }

            if ("toolUse" in block && block.toolUse) {
                // Parse XML-formatted input to extract parameters
                const input: Record<string, any> = {};
                // Simple parsing logic - in a real implementation, this would need to be more robust
                const xmlContent = String(block.toolUse.input || "");
                // Use a safer approach than matchAll for TypeScript compatibility
                const regex = /<([^>]+)>\s*([\s\S]*?)\s*<\/\1>/g;
                let match;
                
                while ((match = regex.exec(xmlContent)) !== null) {
                    const key = match[1];
                    const value = match[2];
                    if (key !== block.toolUse.name) { // Skip the outer wrapper
                        input[key] = value.trim();
                    }
                }

                return {
                    type: "tool_use",
                    id: block.toolUse.toolUseId || "",
                    name: block.toolUse.name || "",
                    input,
                } as NeutralToolUseContentBlock;
            }

            if ("toolResult" in block && block.toolResult) {
                const content: Array<NeutralTextContentBlock | NeutralImageContentBlock> = [];
                
                if (block.toolResult.content && Array.isArray(block.toolResult.content)) {
                    block.toolResult.content.forEach((item) => {
                        if ("text" in item && item.text) {
                            content.push({
                                type: "text",
                                text: item.text,
                            } as NeutralTextContentBlock);
                        }
                    });
                }

                return {
                    type: "tool_result",
                    tool_use_id: block.toolResult.toolUseId || "",
                    content,
                    status: block.toolResult.status as "success" | "error" || "success",
                } as NeutralToolResultContentBlock;
            }

            // Default for unknown block types
            return {
                type: "text",
                text: `[Unsupported Bedrock block type]`,
            } as NeutralTextContentBlock;
        });

        neutralMessage.content = contentBlocks;
        return neutralMessage;
    });
}

/**
 * Convert Neutral content blocks to Bedrock content blocks
 */
export function convertToBedrockContentBlocks(
    neutralContent: NeutralMessageContent
): ContentBlock[] {
    if (typeof neutralContent === "string") {
        return [{ text: neutralContent } as ContentBlock];
    }

    return neutralContent.map((block) => {
        if (block.type === "text") {
            return {
                text: block.text || "",
            } as ContentBlock;
        }

        if (block.type === "image") {
            // Convert base64 string to byte array
            let byteArray: Uint8Array;
            if (typeof block.source.data === "string") {
                const binaryString = atob(block.source.data);
                byteArray = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    byteArray[i] = binaryString.charCodeAt(i);
                }
            } else {
                byteArray = block.source.data as unknown as Uint8Array;
            }

            // Extract format from media_type
            const format = block.source.media_type.split("/")[1];
            if (!["png", "jpeg", "gif", "webp"].includes(format)) {
                throw new Error(`Unsupported image format: ${format}`);
            }

            return {
                image: {
                    format: format as "png" | "jpeg" | "gif" | "webp",
                    source: {
                        bytes: byteArray,
                    },
                },
            } as ContentBlock;
        }

        // Other block types are not directly supported in content blocks
        return {
            text: `[Unsupported content type: ${block.type}]`,
        } as ContentBlock;
    });
}