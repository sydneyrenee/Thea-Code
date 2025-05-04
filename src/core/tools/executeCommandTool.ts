import { TheaTask } from "../TheaTask" // Renamed from Cline
import { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { formatResponse } from "../prompts/responses"

export async function executeCommandTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	let command: string | undefined = block.params.command
	const customCwd: string | undefined = block.params.cwd
	try {
		if (block.partial) {
			await theaTask.webviewCommunicator.ask("command", removeClosingTag("command", command), block.partial).catch(() => {}) // Use communicator
			return
		} else {
			if (!command) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("execute_command", "command"))
				return
			}

			const ignoredFileAttemptedToAccess = theaTask.theaIgnoreController?.validateCommand(command)
			if (ignoredFileAttemptedToAccess) {
				await theaTask.webviewCommunicator.say("theaignore_error", ignoredFileAttemptedToAccess) // Use communicator
				pushToolResult(formatResponse.toolError(formatResponse.theaIgnoreError(ignoredFileAttemptedToAccess)))

				return
			}

			// unescape html entities (e.g. &lt; -> <)
			command = command.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

			theaTask.consecutiveMistakeCount = 0

			const didApprove = await askApproval("command", command)
			if (!didApprove) {
				return
			}
			const [userRejected, result] = await theaTask.executeCommandTool(command, customCwd) // Use theaTask method
			if (userRejected) {
				theaTask.didRejectTool = true
			}
			pushToolResult(result)
			return
		}
	} catch (error) {
		await handleError("executing command", error)
		return
	}
}
