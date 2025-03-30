import { Anthropic } from "@anthropic-ai/sdk"
import os from "os"
import * as path from "path"
import * as vscode from "vscode"
import * as fs from 'fs/promises';

/**
 * Converts API conversation history to Markdown format
 */
function convertToMarkdown(history: Anthropic.MessageParam[]): string {
    let markdown = '# Thea Code Conversation\n\n';
    
    for (const message of history) {
        const role = message.role === 'user' ? '## User' : '## Assistant';
        markdown += `${role}\n\n${message.content}\n\n`;
    }
    
    return markdown;
}

/**
 * Downloads the conversation history as a Markdown file
 */
export async function downloadTask(timestamp: number, apiConversationHistory: Anthropic.MessageParam[]): Promise<void> {
    try {
        // Convert timestamp to formatted date string for the filename
        const date = new Date(timestamp);
        const formattedDate = date.toISOString().replace(/:/g, '-').replace(/\..+/, '');
        
        // Create markdown content
        const markdown = convertToMarkdown(apiConversationHistory);
        
        // Ask the user where to save the file
        const fileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`thea-code-conversation-${formattedDate}.md`),
            filters: {
                'Markdown': ['md']
            },
            title: 'Export Conversation'
        });
        
        if (fileUri) {
            // Write the markdown to the selected file
            await fs.writeFile(fileUri.fsPath, markdown);
            vscode.window.showInformationMessage(`Conversation exported to ${path.basename(fileUri.fsPath)}`);
        }
    } catch (error) {
        console.error('Error exporting conversation:', error);
        vscode.window.showErrorMessage(`Failed to export conversation: ${error.message}`);
    }
}

export function formatContentBlockToMarkdown(block: Anthropic.Messages.ContentBlockParam): string {
	switch (block.type) {
		case "text":
			return block.text
		case "image":
			return `[Image]`
		case "tool_use":
			let input: string
			if (typeof block.input === "object" && block.input !== null) {
				input = Object.entries(block.input)
					.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
					.join("\n")
			} else {
				input = String(block.input)
			}
			return `[Tool Use: ${block.name}]\n${input}`
		case "tool_result":
			// For now we're not doing tool name lookup since we don't use tools anymore
			// const toolName = findToolName(block.tool_use_id, messages)
			const toolName = "Tool"
			if (typeof block.content === "string") {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}`
			} else if (Array.isArray(block.content)) {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content
					.map((contentBlock) => formatContentBlockToMarkdown(contentBlock))
					.join("\n")}`
			} else {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]`
			}
		default:
			return "[Unexpected content type]"
	}
}

export function findToolName(toolCallId: string, messages: Anthropic.MessageParam[]): string {
	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "tool_use" && block.id === toolCallId) {
					return block.name
				}
			}
		}
	}
	return "Unknown Tool"
}
