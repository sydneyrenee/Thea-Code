import os from "os"
import type {
	NeutralMessage,
	NeutralTextContentBlock,
	NeutralImageContentBlock,
	NeutralToolUseContentBlock,
	NeutralToolResultContentBlock,
} from "../../shared/neutral-history"
import * as path from "path"
import * as vscode from "vscode"

export async function downloadTask(dateTs: number, conversationHistory: NeutralMessage[]) {
	// File name
	const date = new Date(dateTs)
	const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase()
	const day = date.getDate()
	const year = date.getFullYear()
	let hours = date.getHours()
	const minutes = date.getMinutes().toString().padStart(2, "0")
	const seconds = date.getSeconds().toString().padStart(2, "0")
	const ampm = hours >= 12 ? "pm" : "am"
	hours = hours % 12
	hours = hours ? hours : 12 // the hour '0' should be '12'
	const fileName = `cline_task_${month}-${day}-${year}_${hours}-${minutes}-${seconds}-${ampm}.md`

	// Generate markdown
	const markdownContent = conversationHistory
		.map((message) => {
			const role = message.role === "user" ? "**User:**" : "**Assistant:**"
			const content = Array.isArray(message.content)
				? message.content
						.map(
							(
								block:
									| NeutralTextContentBlock
									| NeutralImageContentBlock
									| NeutralToolUseContentBlock
									| NeutralToolResultContentBlock,
							) => formatContentBlockToMarkdown(block),
						)
						.join("\n")
				: message.content
			return `${role}\n\n${content}\n\n`
		})
		.join("---\n\n")

	// Prompt user for save location
	const saveUri = await vscode.window.showSaveDialog({
		filters: { Markdown: ["md"] },
		defaultUri: vscode.Uri.file(path.join(os.homedir(), "Downloads", fileName)),
	})

	if (saveUri) {
		// Write content to the selected location
		await vscode.workspace.fs.writeFile(saveUri, Buffer.from(markdownContent))
		vscode.window.showTextDocument(saveUri, { preview: true })
	}
}

export function formatContentBlockToMarkdown(
	block:
		| NeutralTextContentBlock
		| NeutralImageContentBlock
		| NeutralToolUseContentBlock
		| NeutralToolResultContentBlock,
): string {
	switch (block.type) {
		case "text":
			return block.text
		case "image":
			return `[Image]`
		case "tool_use":
			let input: string
			if (typeof block.input === "object" && block.input !== null) {
				input = Object.entries(block.input)
					.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${String(value)}`) // Ensure value is string
					.join("\n")
			} else {
				input = String(block.input)
			}
			return `[Tool Use: ${block.name}]\n${input}`
		case "tool_result":
			// For now we're not doing tool name lookup since we don't use tools anymore
			// const toolName = findToolName(block.tool_use_id, messages)
			const toolName = "Tool"
			const errorSuffix = block.status === "error" ? " (Error)" : ""
			const errorMessage = block.status === "error" && block.error ? `\nError: ${block.error.message}` : ""
			// For NeutralToolResultContentBlock, block.content is always Array<NeutralTextContentBlock | NeutralImageContentBlock>
			return `[${toolName}${errorSuffix}]\n${block.content
				.map((contentBlock) => formatContentBlockToMarkdown(contentBlock))
				.join("\n")}${errorMessage}`
		default:
			return "[Unexpected content type]"
	}
}

export function findToolName(toolCallId: string, messages: NeutralMessage[]): string {
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
