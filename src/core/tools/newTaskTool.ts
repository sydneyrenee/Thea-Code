import type { ToolUse } from "../assistant-message"
import { HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import type { AskApproval } from "./types"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import delay from "delay"

export async function newTaskTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const mode: string | undefined = block.params.mode
	const message: string | undefined = block.params.message
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "newTask",
				mode: removeClosingTag("mode", mode),
				message: removeClosingTag("message", message),
			})
			await theaTask.webviewCommunicator.ask("tool", partialMessage, block.partial).catch(() => {}) // Use communicator
			return
		} else {
			if (!mode) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("new_task", "mode"))
				return
			}
			if (!message) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("new_task", "message"))
				return
			}
			theaTask.consecutiveMistakeCount = 0

			// Verify the mode exists
			const targetMode = getModeBySlug(mode, (await theaTask.providerRef.deref()?.getState())?.customModes)
			if (!targetMode) {
				pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
				return
			}

			const toolMessage = JSON.stringify({
				tool: "newTask",
				mode: targetMode.name,
				content: message,
			})
			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			const provider = theaTask.providerRef.deref()

			if (!provider) {
				return
			}

			// Preserve the current mode so we can resume with it later.
			theaTask.pausedModeSlug = (await provider.getState()).mode ?? defaultModeSlug

			// Switch mode first, then create new task instance.
			await provider.handleModeSwitch(mode)

			// Delay to allow mode change to take effect before next tool is executed.
			await delay(500)

			const newTheaTask = await provider.initWithTask(message, undefined, theaTask) // Renamed from initClineWithTask
			theaTask.emit("taskSpawned", theaTask.taskId, newTheaTask.taskId) // Add parent taskId

			pushToolResult(`Successfully created new task in ${targetMode.name} mode with message: ${message}`)

			// Set the isPaused flag to true so the parent
			// task can wait for the sub-task to finish.
			theaTask.isPaused = true
			theaTask.emit("taskPaused", theaTask.taskId) // Add taskId

			return
		}
	} catch (error) {
		await handleError("creating new task", error)
		return
	}
}
