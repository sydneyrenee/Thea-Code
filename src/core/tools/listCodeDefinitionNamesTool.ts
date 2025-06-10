import type { ToolUse } from "../assistant-message"
import { HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import type { AskApproval } from "./types"
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import { getReadablePath } from "../../utils/path"
import path from "path"
import fs from "fs/promises"
import { parseSourceCodeForDefinitionsTopLevel, parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"

export async function listCodeDefinitionNamesTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	const sharedMessageProps: TheaSayTool = {
		tool: "listCodeDefinitionNames",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relPath)),
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
			if (!relPath) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("list_code_definition_names", "path"))
				return
			}
			theaTask.consecutiveMistakeCount = 0
			const absolutePath = path.resolve(theaTask.cwd, relPath)
			let result: string
			try {
				const stats = await fs.stat(absolutePath)
				if (stats.isFile()) {
					const fileResult = await parseSourceCodeDefinitionsForFile(
						absolutePath,
						theaTask.theaIgnoreController,
					)
					result = fileResult ?? "No source code definitions found in cline file."
				} else if (stats.isDirectory()) {
					result = await parseSourceCodeForDefinitionsTopLevel(absolutePath, theaTask.theaIgnoreController)
				} else {
					result = "The specified path is neither a file nor a directory."
				}
			} catch {
				result = `${absolutePath}: does not exist or cannot be accessed.`
			}
			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: result,
			} satisfies TheaSayTool)
			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}
			pushToolResult(result)
			return
		}
	} catch (error) {
		await handleError("parsing source code definitions", error instanceof Error ? error : new Error(String(error)))
		return
	}
}
