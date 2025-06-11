import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import { getReadablePath } from "../../utils/path"
import type { ToolUse } from "../assistant-message"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import type { RemoveClosingTag } from "./types"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult } from "./types"
import { fileExistsAtPath } from "../../utils/fs"
import { addLineNumbers } from "../../integrations/misc/extract-text"
import path from "path"
import fs from "fs/promises"

export async function applyDiffTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	const diffContent: string | undefined = block.params.diff

	const sharedMessageProps: TheaSayTool = {
		tool: "appliedDiff",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relPath)),
	}

	try {
		if (block.partial) {
			// update gui message
			let toolProgressStatus
			if (theaTask.diffStrategy && theaTask.diffStrategy.getProgressStatus) {
				toolProgressStatus = theaTask.diffStrategy.getProgressStatus(block)
			}

			const partialMessage = JSON.stringify(sharedMessageProps)

			await theaTask.webviewCommunicator
				.ask("tool", partialMessage, block.partial, toolProgressStatus)
				.catch(() => {}) // Use communicator
			return
		} else {
			if (!relPath) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("apply_diff", "path"))
				return
			}
			if (!diffContent) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("apply_diff", "diff"))
				return
			}

			const accessAllowed = theaTask.theaIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await theaTask.webviewCommunicator.say("theaignore_error", relPath) // Use communicator
				pushToolResult(formatResponse.toolError(formatResponse.theaIgnoreError(relPath)))

				return
			}

			const absolutePath = path.resolve(theaTask.cwd, relPath)
			const fileExists = await fileExistsAtPath(absolutePath)

			if (!fileExists) {
				theaTask.consecutiveMistakeCount++
				const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
				await theaTask.webviewCommunicator.say("error", formattedError) // Use communicator
				pushToolResult(formattedError)
				return
			}

			const originalContent = await fs.readFile(absolutePath, "utf-8")

			// Apply the diff to the original content
			const diffResult = (await theaTask.diffStrategy?.applyDiff(
				originalContent,
				diffContent,
				parseInt(block.params.start_line ?? ""),
				parseInt(block.params.end_line ?? ""),
			)) ?? {
				success: false,
				error: "No diff strategy available",
			}
			
			if (!diffResult.success) {
				theaTask.consecutiveMistakeCount++
				const currentCount = (theaTask.consecutiveMistakeCountForApplyDiff.get(relPath) || 0) + 1
				theaTask.consecutiveMistakeCountForApplyDiff.set(relPath, currentCount)
				let formattedError = ""
				if (diffResult.failParts && diffResult.failParts.length > 0) {
					for (const failPart of diffResult.failParts) {
						if (failPart.success) {
							continue
						}
						const errorDetails = failPart.details ? JSON.stringify(failPart.details, null, 2) : ""
						formattedError = `<error_details>\n${
							failPart.error
						}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n</error_details>`
					}
				} else {
					const errorDetails = diffResult.details ? JSON.stringify(diffResult.details, null, 2) : ""
					formattedError = `Unable to apply diff to file: ${absolutePath}\n\n<error_details>\n${
						diffResult.error
					}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n</error_details>`
				}

				if (currentCount >= 2) {
					await theaTask.webviewCommunicator.say("error", formattedError) // Use communicator
				}
				pushToolResult(formattedError)
				return
			}

			theaTask.consecutiveMistakeCount = 0
			theaTask.consecutiveMistakeCountForApplyDiff.delete(relPath)
			// Show diff view before asking for approval
			theaTask.diffViewProvider.editType = "modify"
			await theaTask.diffViewProvider.open(relPath)
			await theaTask.diffViewProvider.update(diffResult.content, true)
			theaTask.diffViewProvider.scrollToFirstDiff()

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				diff: diffContent,
			} satisfies TheaSayTool) // Renamed type

			let toolProgressStatus
			if (theaTask.diffStrategy && theaTask.diffStrategy.getProgressStatus) {
				toolProgressStatus = theaTask.diffStrategy.getProgressStatus(block, diffResult)
			}

			const didApprove = await askApproval("tool", completeMessage, toolProgressStatus)
			if (!didApprove) {
				await theaTask.diffViewProvider.revertChanges() // theaTask likely handles closing the diff view
				return
			}

			const { newProblemsMessage, userEdits, finalContent } = await theaTask.diffViewProvider.saveChanges()
			theaTask.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request
			let partFailHint = ""
			if (diffResult.failParts && diffResult.failParts.length > 0) {
				partFailHint = `But unable to apply all diff parts to file: ${absolutePath}, silently use <read_file> tool to check newest file version and re-apply diffs\n`
			}
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
						partFailHint +
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
				pushToolResult(
					`Changes successfully applied to ${relPath.toPosix()}:\n\n${newProblemsMessage}\n` + partFailHint,
				)
			}
			theaTask.diffViewProvider.reset()
			return
		}
	} catch (error) {
		const errorObj = error instanceof Error ? error : new Error(String(error))
		await handleError("applying diff", errorObj)
		theaTask.diffViewProvider.reset()
		return
	}
}
