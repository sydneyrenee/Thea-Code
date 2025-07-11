import path from "path"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import type { ToolUse } from "../assistant-message"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { getReadablePath } from "../../utils/path"
import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { extractTextFromFile, addLineNumbers } from "../../integrations/misc/extract-text"
import { parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"
import { isBinaryFile } from "isbinaryfile"

export async function readFileTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	const startLineStr: string | undefined = block.params.start_line
	const endLineStr: string | undefined = block.params.end_line

	// Get the full path and determine if it's outside the workspace
	const fullPath = relPath ? path.resolve(theaTask.cwd, removeClosingTag("path", relPath)) : ""
	const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

	const sharedMessageProps: TheaSayTool = {
		tool: "readFile",
		path: getReadablePath(theaTask.cwd, removeClosingTag("path", relPath)),
		isOutsideWorkspace,
	}
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				...sharedMessageProps,
				content: undefined,
			} satisfies TheaSayTool)
			await theaTask.webviewCommunicator.ask("tool", partialMessage, block.partial).catch(() => {}) // Use communicator
			return
		} else {
			if (!relPath) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("read_file", "path"))
				return
			}

			// Check if we're doing a line range read
			let isRangeRead = false
			let startLine: number | undefined = undefined
			let endLine: number | undefined = undefined

			// Check if we have either range parameter
			if (startLineStr || endLineStr) {
				isRangeRead = true
			}

			// Parse start_line if provided
			if (startLineStr) {
				startLine = parseInt(startLineStr)
				if (isNaN(startLine)) {
					// Invalid start_line
					theaTask.consecutiveMistakeCount++
					await theaTask.webviewCommunicator.say("error", `Failed to parse start_line: ${startLineStr}`) // Use communicator
					pushToolResult(formatResponse.toolError("Invalid start_line value"))
					return
				}
				startLine -= 1 // Convert to 0-based index
			}

			// Parse end_line if provided
			if (endLineStr) {
				endLine = parseInt(endLineStr)

				if (isNaN(endLine)) {
					// Invalid end_line
					theaTask.consecutiveMistakeCount++
					await theaTask.webviewCommunicator.say("error", `Failed to parse end_line: ${endLineStr}`) // Use communicator
					pushToolResult(formatResponse.toolError("Invalid end_line value"))
					return
				}

				// Convert to 0-based index
				endLine -= 1
			}

			const accessAllowed = theaTask.theaIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await theaTask.webviewCommunicator.say("theaignore_error", relPath) // Use communicator
				pushToolResult(formatResponse.toolError(formatResponse.theaIgnoreError(relPath)))

				return
			}

			const { maxReadFileLine = 500 } = (await theaTask.providerRef.deref()?.getState()) ?? {}

			// Create line snippet description for approval message
			let lineSnippet = ""
			if (startLine !== undefined && endLine !== undefined) {
				lineSnippet = t("tools:readFile.linesRange", { start: startLine + 1, end: endLine + 1 })
			} else if (startLine !== undefined) {
				lineSnippet = t("tools:readFile.linesFromToEnd", { start: startLine + 1 })
			} else if (endLine !== undefined) {
				lineSnippet = t("tools:readFile.linesFromStartTo", { end: endLine + 1 })
			} else if (maxReadFileLine === 0) {
				lineSnippet = t("tools:readFile.definitionsOnly")
			} else if (maxReadFileLine > 0) {
				lineSnippet = t("tools:readFile.maxLines", { max: maxReadFileLine })
			}

			theaTask.consecutiveMistakeCount = 0
			const absolutePath = path.resolve(theaTask.cwd, relPath)

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: absolutePath,
				reason: lineSnippet,
			} satisfies TheaSayTool)

			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}

			// Count total lines in the file
			let totalLines = 0
			try {
				totalLines = await countFileLines(absolutePath)
			} catch (error) {
				console.error(`Error counting lines in file ${absolutePath}:`, error)
			}

			// now execute the tool like normal
			let content: string
			let isFileTruncated = false
			let sourceCodeDef = ""

			const isBinary = await isBinaryFile(absolutePath).catch(() => false)

			if (isRangeRead) {
				if (startLine === undefined) {
					content = addLineNumbers(await readLines(absolutePath, endLine, startLine))
				} else {
					content = addLineNumbers(await readLines(absolutePath, endLine, startLine), startLine + 1)
				}
			} else if (!isBinary && maxReadFileLine >= 0 && totalLines > maxReadFileLine) {
				// If file is too large, only read the first maxReadFileLine lines
				isFileTruncated = true

				const res = await Promise.all([
					maxReadFileLine > 0 ? readLines(absolutePath, maxReadFileLine - 1, 0) : "",
					parseSourceCodeDefinitionsForFile(absolutePath, theaTask.theaIgnoreController),
				])

				content = res[0].length > 0 ? addLineNumbers(res[0]) : ""
				const result = res[1]
				if (result) {
					sourceCodeDef = `\n\n${result}`
				}
			} else {
				// Read entire file
				content = await extractTextFromFile(absolutePath)
			}

			// Add truncation notice if applicable
			if (isFileTruncated) {
				content += `\n\n[Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more]${sourceCodeDef}`
			}

			pushToolResult(content)
		}
	} catch (error) {
		await handleError("reading file", error instanceof Error ? error : new Error(String(error)))
	}
}
