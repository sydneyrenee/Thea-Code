import { TheaTask } from "../TheaTask" // Renamed from Cline
import type { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import { formatResponse } from "../prompts/responses"
import { parseXml } from "../../utils/xml"

export async function askFollowupQuestionTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const question: string | undefined = block.params.question
	const follow_up: string | undefined = block.params.follow_up
	try {
		if (block.partial) {
			await theaTask.webviewCommunicator
				.ask("followup", removeClosingTag("question", question), block.partial)
				.catch(() => {}) // Use communicator
			return
		} else {
			if (!question) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("ask_followup_question", "question"))
				return
			}

			type Suggest = {
				answer: string
			}

			let follow_up_json = {
				question,
				suggest: [] as Suggest[],
			}

			if (follow_up) {
				let parsedSuggest: {
					suggest: Suggest[] | Suggest
				}

				try {
					parsedSuggest = parseXml(follow_up, ["suggest"]) as {
						suggest: Suggest[] | Suggest
					}
				} catch (error) {
					theaTask.consecutiveMistakeCount++
					const errorMessage = error instanceof Error ? error.message : String(error)
					await theaTask.webviewCommunicator.say("error", `Failed to parse operations: ${errorMessage}`) // Use communicator
					pushToolResult(formatResponse.toolError("Invalid operations xml format"))
					return
				}

				const normalizedSuggest = Array.isArray(parsedSuggest?.suggest)
					? parsedSuggest.suggest
					: [parsedSuggest?.suggest].filter((sug): sug is Suggest => sug !== undefined)

				follow_up_json.suggest = normalizedSuggest
			}

			theaTask.consecutiveMistakeCount = 0

			const { text, images } = await theaTask.webviewCommunicator.ask(
				"followup",
				JSON.stringify(follow_up_json),
				false,
			) // Use communicator
			await theaTask.webviewCommunicator.say("user_feedback", text ?? "", images) // Use communicator
			pushToolResult(formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images))
			return
		}
	} catch (error) {
		await handleError("asking question", error instanceof Error ? error : new Error(String(error)))
		return
	}
}
