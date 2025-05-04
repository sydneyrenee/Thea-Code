import * as path from "path"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import { ToolParamName, ToolUse } from "../assistant-message"
import { formatResponse } from "../prompts/responses"
import { listFiles } from "../../services/glob/list-files"
import { getReadablePath } from "../../utils/path"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
/**
 * Implements the list_files tool.
 *
 * @param theaTask - The instance of TheaTask that is executing this tool.
 * @param block - The block of assistant message content that specifies the
 *   parameters for this tool.
 * @param askApproval - A function that asks the user for approval to show a
 *   message.
 * @param handleError - A function that handles an error that occurred while
 *   executing this tool.
 * @param pushToolResult - A function that pushes the result of this tool to the
 *   conversation.
 * @param removeClosingTag - A function that removes a closing tag from a string.
 */
export async function listFilesTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relDirPath: string | undefined = block.params.path
	const recursiveRaw: string | undefined = block.params.recursive
	const recursive = recursiveRaw?.toLowerCase() === "true"
	const sharedMessageProps: TheaSayTool = {
		tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relDirPath)),
	}
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				...sharedMessageProps,
				content: "",
			} satisfies TheaSayTool)
			await theaTask.webviewCommunicator.ask("tool", partialMessage, block.partial).catch(() => {}) // Use communicator
			return
		} else {
			if (!relDirPath) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("list_files", "path"))
				return
			}
			theaTask.consecutiveMistakeCount = 0
			const absolutePath = path.resolve(theaTask.cwd, relDirPath)
			const [files, didHitLimit] = await listFiles(absolutePath, recursive, 200)
			const { showTheaIgnoredFiles = true } = (await theaTask.providerRef.deref()?.getState()) ?? {}
			const result = formatResponse.formatFilesList(
				absolutePath,
				files,
				didHitLimit,
				theaTask.theaIgnoreController,
				showTheaIgnoredFiles,
			)
			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: result,
			} satisfies TheaSayTool)
			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}
			pushToolResult(result)
		}
	} catch (error) {
		await handleError("listing files", error)
	}
}
