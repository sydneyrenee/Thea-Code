import { ToolResponse } from "../TheaTask" // Renamed from Cline

import { ToolUse } from "../assistant-message"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import {
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
	ToolDescription,
	AskFinishSubTaskApproval,
} from "./types"
import { formatResponse } from "../prompts/responses"
import { telemetryService } from "../../services/telemetry/TelemetryService"
import Anthropic from "@anthropic-ai/sdk"

export async function attemptCompletionTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
	toolDescription: ToolDescription,
	askFinishSubTaskApproval: AskFinishSubTaskApproval,
) {
	const result: string | undefined = block.params.result
	const command: string | undefined = block.params.command
	try {
		const lastMessage = theaTask.taskStateManager.theaTaskMessages.at(-1) // Use state manager
		if (block.partial) {
			if (command) {
				// the attempt_completion text is done, now we're getting command
				// remove the previous partial attempt_completion ask, replace with say, post state to webview, then stream command

				// const secondLastMessage = cline.clineMessages.at(-2)
				if (lastMessage && lastMessage.ask === "command") {
					// update command
					await theaTask.webviewCommunicator
						.ask("command", removeClosingTag("command", command), block.partial)
						.catch(() => {}) // Use communicator
				} else {
					// last message is completion_result
					// we have command string, which means we have the result as well, so finish it (doesnt have to exist yet)
					await theaTask.webviewCommunicator.say(
						"completion_result",
						removeClosingTag("result", result),
						undefined,
						false,
					) // Use communicator

					telemetryService.captureTaskCompleted(theaTask.taskId)
					theaTask.emit("taskCompleted", theaTask.taskId, theaTask.taskStateManager.getTokenUsage()) // Use state manager

					await theaTask.webviewCommunicator
						.ask("command", removeClosingTag("command", command), block.partial)
						.catch(() => {}) // Use communicator
				}
			} else {
				// no command, still outputting partial result
				await theaTask.webviewCommunicator.say(
					"completion_result",
					removeClosingTag("result", result),
					undefined,
					block.partial,
				) // Use communicator
			}
			return
		} else {
			if (!result) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("attempt_completion", "result"))
				return
			}

			theaTask.consecutiveMistakeCount = 0

			let commandResult: ToolResponse | undefined

			if (command) {
				if (lastMessage && lastMessage.ask !== "command") {
					// Haven't sent a command message yet so first send completion_result then command.
					await theaTask.webviewCommunicator.say("completion_result", result, undefined, false) // Use communicator
					telemetryService.captureTaskCompleted(theaTask.taskId)
					theaTask.emit("taskCompleted", theaTask.taskId, theaTask.taskStateManager.getTokenUsage()) // Use state manager
				}

				// Complete command message.
				const didApprove = await askApproval("command", command)

				if (!didApprove) {
					return
				}

				const [userRejected, execCommandResult] = await theaTask.executeCommandTool(command) // Use theaTask method

				if (userRejected) {
					theaTask.didRejectTool = true
					pushToolResult(execCommandResult)
					return
				}

				// User didn't reject, but the command may have output.
				commandResult = execCommandResult
			} else {
				await theaTask.webviewCommunicator.say("completion_result", result, undefined, false) // Use communicator
				telemetryService.captureTaskCompleted(theaTask.taskId)
				theaTask.emit("taskCompleted", theaTask.taskId, theaTask.taskStateManager.getTokenUsage()) // Use state manager
			}

			if (theaTask.parentTask) {
				const didApprove = await askFinishSubTaskApproval()

				if (!didApprove) {
					return
				}

				// tell the provider to remove the current subtask and resume the previous task in the stack
				await theaTask.providerRef.deref()?.finishSubTask(`Task complete: ${lastMessage?.text}`)
				return
			}

			// We already sent completion_result says, an
			// empty string asks relinquishes control over
			// button and field.
			const { response, text, images } = await theaTask.webviewCommunicator.ask("completion_result", "", false) // Use communicator

			// Signals to recursive loop to stop (for now
			// cline never happens since yesButtonClicked
			// will trigger a new task).
			if (response === "yesButtonClicked") {
				pushToolResult("")
				return
			}

			await theaTask.webviewCommunicator.say("user_feedback", text ?? "", images) // Use communicator
			const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

			if (commandResult) {
				if (typeof commandResult === "string") {
					toolResults.push({ type: "text", text: commandResult })
				} else if (Array.isArray(commandResult)) {
					toolResults.push(...commandResult)
				}
			}

			toolResults.push({
				type: "text",
				text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
			})

			toolResults.push(...formatResponse.imageBlocks(images))

			theaTask.userMessageContent.push({
				type: "text",
				text: `${toolDescription()} Result:`,
			})

			theaTask.userMessageContent.push(...toolResults)
			return
		}
	} catch (error) {
		await handleError("inspecting site", error)
		return
	}
}
