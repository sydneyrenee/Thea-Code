import { getReadablePath } from "../../utils/path"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import type { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { formatResponse } from "../prompts/responses"
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import path from "path"
import { fileExistsAtPath } from "../../utils/fs"
import { insertGroups } from "../diff/insert-groups"
import delay from "delay"
import fs from "fs/promises"

export async function insertContentTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	const operations: string | undefined = block.params.operations

	const sharedMessageProps: TheaSayTool = {
		tool: "appliedDiff",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relPath)),
	}

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify(sharedMessageProps)
			await theaTask.webviewCommunicator.ask("tool", partialMessage, block.partial).catch(() => {}) // Use communicator
			return
		}

		// Validate required parameters
		if (!relPath) {
			theaTask.consecutiveMistakeCount++
			pushToolResult(await theaTask.sayAndCreateMissingParamError("insert_content", "path"))
			return
		}

		if (!operations) {
			theaTask.consecutiveMistakeCount++
			pushToolResult(await theaTask.sayAndCreateMissingParamError("insert_content", "operations"))
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

		let parsedOperations: Array<{
			start_line: number
			content: string
		}>

		try {
			const parsed: unknown = JSON.parse(operations)
			if (!Array.isArray(parsed)) {
				throw new Error("Operations must be an array")
			}
			parsedOperations = parsed as Array<{ start_line: number; content: string }>
		} catch (error) {
			theaTask.consecutiveMistakeCount++
			const errorMessage = error instanceof Error ? error.message : String(error)
			await theaTask.webviewCommunicator.say("error", `Failed to parse operations JSON: ${errorMessage}`) // Use communicator
			pushToolResult(formatResponse.toolError("Invalid operations JSON format"))
			return
		}

		theaTask.consecutiveMistakeCount = 0

		// Read the file
		const fileContent = await fs.readFile(absolutePath, "utf8")
		theaTask.diffViewProvider.editType = "modify"
		theaTask.diffViewProvider.originalContent = fileContent
		const lines = fileContent.split("\n")

		const updatedContent = insertGroups(
			lines,
			parsedOperations.map((elem) => {
				return {
					index: elem.start_line - 1,
					elements: elem.content.split("\n"),
				}
			}),
		).join("\n")

		// Show changes in diff view
		if (!theaTask.diffViewProvider.isEditing) {
			await theaTask.webviewCommunicator.ask("tool", JSON.stringify(sharedMessageProps), true).catch(() => {}) // Use communicator
			// First open with original content
			await theaTask.diffViewProvider.open(relPath)
			await theaTask.diffViewProvider.update(fileContent, false)
			theaTask.diffViewProvider.scrollToFirstDiff()
			await delay(200)
		}

		const diff = formatResponse.createPrettyPatch(relPath, fileContent, updatedContent)

		if (!diff) {
			pushToolResult(`No changes needed for '${relPath}'`)
			return
		}

		await theaTask.diffViewProvider.update(updatedContent, true)

		const completeMessage = JSON.stringify({
			...sharedMessageProps,
			diff,
		} satisfies TheaSayTool)

		const didApprove = await theaTask.webviewCommunicator // Use communicator
			.ask("tool", completeMessage, false)
			.then((response) => response.response === "yesButtonClicked")

		if (!didApprove) {
			await theaTask.diffViewProvider.revertChanges()
			pushToolResult("Changes were rejected by the user.")
			return
		}

		const { newProblemsMessage, userEdits, finalContent } = await theaTask.diffViewProvider.saveChanges()
		theaTask.didEditFile = true

		if (!userEdits) {
			pushToolResult(`The content was successfully inserted in ${relPath.toPosix()}.${newProblemsMessage}`)
			theaTask.diffViewProvider.reset()
			return
		}

		const userFeedbackDiff = JSON.stringify({
			tool: "appliedDiff",
			path: getReadablePath(theaTask.cwd, relPath),
			diff: userEdits,
		} satisfies TheaSayTool)

		console.debug("[DEBUG] User made edits, sending feedback diff:", userFeedbackDiff)
		await theaTask.webviewCommunicator.say("user_feedback_diff", userFeedbackDiff) // Use communicator
		pushToolResult(
			`The user made the following updates to your content:\n\n${userEdits}\n\n` +
				`The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file:\n\n` +
				`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
				`Please note:\n` +
				`1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
				`2. Proceed with the task using the updated file content as the new baseline.\n` +			`3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
			`${newProblemsMessage}`,
		)
		theaTask.diffViewProvider.reset()
	} catch (error) {
		const errorObj = error instanceof Error ? error : new Error(String(error))
		await handleError("insert content", errorObj)
		theaTask.diffViewProvider.reset()
	}
}
