import { TheaTask } from "../TheaTask" // Renamed from Cline
import type { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import { getReadablePath } from "../../utils/path"
import path from "path"
import { regexSearchFiles } from "../../services/ripgrep"

export async function searchFilesTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relDirPath: string | undefined = block.params.path
	const regex: string | undefined = block.params.regex
	const filePattern: string | undefined = block.params.file_pattern
	const sharedMessageProps: TheaSayTool = {
		tool: "searchFiles",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relDirPath)),
		regex: removeClosingTag("regex", regex),
		filePattern: removeClosingTag("file_pattern", filePattern),
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
				pushToolResult(await theaTask.sayAndCreateMissingParamError("search_files", "path"))
				return
			}
			if (!regex) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("search_files", "regex"))
				return
			}
			theaTask.consecutiveMistakeCount = 0
			const absolutePath = path.resolve(theaTask.cwd, relDirPath)
			const results = await regexSearchFiles(
				theaTask.cwd,
				absolutePath,
				regex,
				filePattern,
				theaTask.theaIgnoreController,
			)
			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: results,
			} satisfies TheaSayTool)
			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}
			pushToolResult(results)
			return
		}
	} catch (error) {
		await handleError("searching files", error)
		return
	}
}
