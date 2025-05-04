import { TheaTask } from "../TheaTask" // Renamed from Cline
import { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { formatResponse } from "../prompts/responses"
import { defaultModeSlug } from "../../shared/modes"
import { getModeBySlug } from "../../shared/modes"
import delay from "delay"

export async function switchModeTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const mode_slug: string | undefined = block.params.mode_slug
	const reason: string | undefined = block.params.reason
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "switchMode",
				mode: removeClosingTag("mode_slug", mode_slug),
				reason: removeClosingTag("reason", reason),
			})
			await theaTask.webviewCommunicator.ask("tool", partialMessage, block.partial).catch(() => {}) // Use communicator
			return
		} else {
			if (!mode_slug) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("switch_mode", "mode_slug"))
				return
			}
			theaTask.consecutiveMistakeCount = 0

			// Verify the mode exists
			const targetMode = getModeBySlug(mode_slug, (await theaTask.providerRef.deref()?.getState())?.customModes)
			if (!targetMode) {
				pushToolResult(formatResponse.toolError(`Invalid mode: ${mode_slug}`))
				return
			}

			// Check if already in requested mode
			const currentMode = (await theaTask.providerRef.deref()?.getState())?.mode ?? defaultModeSlug
			if (currentMode === mode_slug) {
				pushToolResult(`Already in ${targetMode.name} mode.`)
				return
			}

			const completeMessage = JSON.stringify({
				tool: "switchMode",
				mode: mode_slug,
				reason,
			})

			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}

			// Switch the mode using shared handler
			await theaTask.providerRef.deref()?.handleModeSwitch(mode_slug)
			pushToolResult(
				`Successfully switched from ${getModeBySlug(currentMode)?.name ?? currentMode} mode to ${
					targetMode.name
				} mode${reason ? ` because: ${reason}` : ""}.`,
			)
			await delay(500) // delay to allow mode change to take effect before next tool is executed
			return
		}
	} catch (error) {
		await handleError("switching mode", error)
		return
	}
}
