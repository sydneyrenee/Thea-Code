import { TheaTask } from "../TheaTask" // Renamed from Cline
import { fetchInstructions } from "../prompts/instructions/instructions"
import { TheaSayTool } from "../../shared/ExtensionMessage" // Renamed import
import type { ToolUse } from "../assistant-message"
import { formatResponse } from "../prompts/responses"
import { AskApproval, HandleError, PushToolResult } from "./types"

export async function fetchInstructionsTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
) {
	const task: string | undefined = block.params.task
	const sharedMessageProps: TheaSayTool = {
		tool: "fetchInstructions",
		content: task,
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
			if (!task) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("fetch_instructions", "task"))
				return
			}

			theaTask.consecutiveMistakeCount = 0
			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: task,
			} satisfies TheaSayTool)

			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}

			// now fetch the content and provide it to the agent.
			const provider = theaTask.providerRef.deref()
			const mcpHub = provider?.getMcpHub()
			if (!mcpHub) {
				throw new Error("MCP hub not available")
			}
			const diffStrategy = theaTask.diffStrategy
			const context = provider?.context
			const content = await fetchInstructions(task, { mcpHub, diffStrategy, context })
			if (!content) {
				pushToolResult(formatResponse.toolError(`Invalid instructions request: ${task}`))
				return
			}
			pushToolResult(content)
		}
	} catch (error) {
		await handleError("fetch instructions", error)
	}
}
