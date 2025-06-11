import * as vscode from "vscode"

import { TheaTask } from "../TheaTask" // Renamed from Cline
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import type { ToolUse } from "../assistant-message"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import path from "path"
import { fileExistsAtPath } from "../../utils/fs"
import { addLineNumbers, stripLineNumbers } from "../../integrations/misc/extract-text"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { everyLineHasLineNumbers } from "../../integrations/misc/extract-text"
import delay from "delay"
import { detectCodeOmission } from "../../integrations/editor/detect-omission"

export async function writeToFileTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	let newContent: string | undefined = block.params.content
	let predictedLineCount: number | undefined = parseInt(block.params.line_count ?? "0")
	if (!relPath || !newContent) {
		// checking for newContent ensure relPath is complete
		// wait so we can determine if it's a new file or editing an existing file
		return
	}

	const accessAllowed = theaTask.theaIgnoreController?.validateAccess(relPath)
	if (!accessAllowed) {
		await theaTask.webviewCommunicator.say("theaignore_error", relPath) // Use communicator
		pushToolResult(formatResponse.toolError(formatResponse.theaIgnoreError(relPath)))

		return
	}

	// Check if file exists using cached map or fs.access
	let fileExists: boolean
	if (theaTask.diffViewProvider.editType !== undefined) {
		fileExists = theaTask.diffViewProvider.editType === "modify"
	} else {
		const absolutePath = path.resolve(theaTask.cwd, relPath)
		fileExists = await fileExistsAtPath(absolutePath)
		theaTask.diffViewProvider.editType = fileExists ? "modify" : "create"
	}

	// pre-processing newContent for cases where weaker models might add artifacts like markdown codeblock markers (deepseek/llama) or extra escape characters (gemini)
	if (newContent.startsWith("```")) {
		// cline handles cases where it includes language specifiers like ```python ```js
		newContent = newContent.split("\n").slice(1).join("\n").trim()
	}
	if (newContent.endsWith("```")) {
		newContent = newContent.split("\n").slice(0, -1).join("\n").trim()
	}

	if (!theaTask.api.getModel().id.includes("claude")) {
		// it seems not just llama models are doing cline, but also gemini and potentially others
		if (newContent.includes("&gt;") || newContent.includes("&lt;") || newContent.includes("&quot;")) {
			newContent = newContent
				.replace(/&gt;/g, ">")
				.replace(/&lt;/g, "<")
				.replace(/&quot;/g, '"')
		}
	}

	// Determine if the path is outside the workspace
	const fullPath = relPath ? path.resolve(theaTask.cwd, removeClosingTag("path", relPath)) : ""
	const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

	const sharedMessageProps: TheaSayTool = {
		// Renamed type
		tool: fileExists ? "editedExistingFile" : "newFileCreated",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relPath)),
		isOutsideWorkspace,
	}
	try {
		if (block.partial) {
			// update gui message
			const partialMessage = JSON.stringify(sharedMessageProps)
			await theaTask.webviewCommunicator.ask("tool", partialMessage, block.partial).catch(() => {}) // Use communicator
			// update editor
			if (!theaTask.diffViewProvider.isEditing) {
				// open the editor and prepare to stream content in
				await theaTask.diffViewProvider.open(relPath)
			}
			// editor is open, stream content in
			await theaTask.diffViewProvider.update(
				everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
				false,
			)
			return
		} else {
			if (!relPath) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("write_to_file", "path"))
				theaTask.diffViewProvider.reset()
				return
			}
			if (!newContent) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("write_to_file", "content"))
				theaTask.diffViewProvider.reset()
				return
			}
			if (!predictedLineCount) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("write_to_file", "line_count"))
				theaTask.diffViewProvider.reset()
				return
			}
			theaTask.consecutiveMistakeCount = 0

			// if isEditingFile false, that means we have the full contents of the file already.
			// it's important to note how cline function works, you can't make the assumption that the block.partial conditional will always be called since it may immediately get complete, non-partial data. So cline part of the logic will always be called.
			// in other words, you must always repeat the block.partial logic here
			if (!theaTask.diffViewProvider.isEditing) {
				// show gui message before showing edit animation
				const partialMessage = JSON.stringify(sharedMessageProps)
				await theaTask.webviewCommunicator.ask("tool", partialMessage, true).catch(() => {}) // Use communicator
				await theaTask.diffViewProvider.open(relPath)
			}
			await theaTask.diffViewProvider.update(
				everyLineHasLineNumbers(newContent) ? stripLineNumbers(newContent) : newContent,
				true,
			)
			await delay(300) // wait for diff view to update
			theaTask.diffViewProvider.scrollToFirstDiff()

			// Check for code omissions before proceeding
			if (detectCodeOmission(theaTask.diffViewProvider.originalContent || "", newContent, predictedLineCount)) {
				if (theaTask.diffStrategy) {
					await theaTask.diffViewProvider.revertChanges()
					pushToolResult(
						formatResponse.toolError(
							`Content appears to be truncated (file has ${
								newContent.split("\n").length
							} lines but was predicted to have ${predictedLineCount} lines), and found comments indicating omitted code (e.g., '// rest of code unchanged', '/* previous code */'). Please provide the complete file content without any omissions if possible, or otherwise use the 'apply_diff' tool to apply the diff to the original file.`,
						),
					)
					return
				} else {
					vscode.window
						.showWarningMessage(
							"Potential code truncation detected. cline happens when the AI reaches its max output limit.",
							"Follow cline guide to fix the issue",
						)
						.then((selection) => {
							if (selection === "Follow cline guide to fix the issue") {
								vscode.env.openExternal(
									vscode.Uri.parse(
										"https://github.com/cline/cline/wiki/Troubleshooting-%E2%80%90-Cline-Deleting-Code-with-%22Rest-of-Code-Here%22-Comments",
									),
								)
							}
						})
				}
			}

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: fileExists ? undefined : newContent,
				diff: fileExists
					? formatResponse.createPrettyPatch(relPath, theaTask.diffViewProvider.originalContent, newContent)
					: undefined,
			} satisfies TheaSayTool) // Renamed type
			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				await theaTask.diffViewProvider.revertChanges()
				return
			}
			const { newProblemsMessage, userEdits, finalContent } = await theaTask.diffViewProvider.saveChanges()
			theaTask.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request
			if (userEdits) {
				await theaTask.webviewCommunicator.say(
					// Use communicator
					"user_feedback_diff",
					JSON.stringify({
						tool: fileExists ? "editedExistingFile" : "newFileCreated",
						path: getReadablePath(theaTask.cwd, relPath),
						diff: userEdits,
					} satisfies TheaSayTool), // Renamed type
				)
				pushToolResult(
					`The user made the following updates to your content:\n\n${userEdits}\n\n` +
						`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file, including line numbers:\n\n` +
						`<final_file_content path="${relPath.toPosix()}">\n${addLineNumbers(
							finalContent || "",
						)}\n</final_file_content>\n\n` +
						`Please note:\n` +
						`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
						`2. Proceed with the task using the updated file content as the new baseline.\n` +
						`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
						`${newProblemsMessage}`,
				)
			} else {
				pushToolResult(`The content was successfully saved to ${relPath.toPosix()}.${newProblemsMessage}`)
			}
			theaTask.diffViewProvider.reset()
			return
		}
	} catch (error) {
		await handleError("writing file", error instanceof Error ? error : new Error(String(error)))
		theaTask.diffViewProvider.reset()
		return
	}
}
