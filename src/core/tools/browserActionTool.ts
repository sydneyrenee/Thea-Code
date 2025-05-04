import { TheaTask } from "../TheaTask" // Renamed from Cline
import { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "./types"
import {
	BrowserAction,
	BrowserActionResult,
	browserActions,
	TheaSayBrowserAction, // Renamed import
} from "../../shared/ExtensionMessage"
import { formatResponse } from "../prompts/responses"

export async function browserActionTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const action: BrowserAction | undefined = block.params.action as BrowserAction
	const url: string | undefined = block.params.url
	const coordinate: string | undefined = block.params.coordinate
	const text: string | undefined = block.params.text
	if (!action || !browserActions.includes(action)) {
		// checking for action to ensure it is complete and valid
		if (!block.partial) {
			// if the block is complete and we don't have a valid action cline is a mistake
			theaTask.consecutiveMistakeCount++
			pushToolResult(await theaTask.sayAndCreateMissingParamError("browser_action", "action"))
			await theaTask.browserSession.closeBrowser()
		}
		return
	}

	try {
		if (block.partial) {
			if (action === "launch") {
				await theaTask.webviewCommunicator
					.ask("browser_action_launch", removeClosingTag("url", url), block.partial)
					.catch(() => {}) // Use communicator
			} else {
				await theaTask.webviewCommunicator.say(
					// Use communicator
					"browser_action",
					JSON.stringify({
						action: action as BrowserAction,
						coordinate: removeClosingTag("coordinate", coordinate),
						text: removeClosingTag("text", text),
					} satisfies TheaSayBrowserAction), // Renamed type
					undefined,
					block.partial,
				)
			}
			return
		} else {
			// Initialize with empty object to avoid "used before assigned" errors
			let browserActionResult: BrowserActionResult = {}
			if (action === "launch") {
				if (!url) {
					theaTask.consecutiveMistakeCount++
					pushToolResult(await theaTask.sayAndCreateMissingParamError("browser_action", "url"))
					await theaTask.browserSession.closeBrowser()
					return
				}
				theaTask.consecutiveMistakeCount = 0
				const didApprove = await askApproval("browser_action_launch", url)
				if (!didApprove) {
					return
				}

				// NOTE: it's okay that we call cline message since the partial inspect_site is finished streaming. The only scenario we have to avoid is sending messages WHILE a partial message exists at the end of the messages array. For example the api_req_finished message would interfere with the partial message, so we needed to remove that.
				// await theaTask.webviewCommunicator.say("inspect_site_result", "") // no result, starts the loading spinner waiting for result
				await theaTask.webviewCommunicator.say("browser_action_result", "") // Use communicator

				await theaTask.browserSession.launchBrowser()
				browserActionResult = await theaTask.browserSession.navigateToUrl(url)
			} else {
				if (action === "click") {
					if (!coordinate) {
						theaTask.consecutiveMistakeCount++
						pushToolResult(await theaTask.sayAndCreateMissingParamError("browser_action", "coordinate"))
						await theaTask.browserSession.closeBrowser()
						return // can't be within an inner switch
					}
				}
				if (action === "type") {
					if (!text) {
						theaTask.consecutiveMistakeCount++
						pushToolResult(await theaTask.sayAndCreateMissingParamError("browser_action", "text"))
						await theaTask.browserSession.closeBrowser()
						return
					}
				}
				theaTask.consecutiveMistakeCount = 0
				await theaTask.webviewCommunicator.say(
					// Use communicator
					"browser_action",
					JSON.stringify({
						action: action as BrowserAction,
						coordinate,
						text,
					} satisfies TheaSayBrowserAction), // Renamed type
					undefined,
					false,
				)
				switch (action) {
					case "click":
						browserActionResult = await theaTask.browserSession.click(coordinate!)
						break
					case "type":
						browserActionResult = await theaTask.browserSession.type(text!)
						break
					case "scroll_down":
						browserActionResult = await theaTask.browserSession.scrollDown()
						break
					case "scroll_up":
						browserActionResult = await theaTask.browserSession.scrollUp()
						break
					case "close":
						browserActionResult = await theaTask.browserSession.closeBrowser()
						break
				}
			}

			switch (action) {
				case "launch":
				case "click":
				case "type":
				case "scroll_down":
				case "scroll_up":
					await theaTask.webviewCommunicator.say("browser_action_result", JSON.stringify(browserActionResult)) // Use communicator
					pushToolResult(
						formatResponse.toolResult(
							`The browser action has been executed. The console logs and screenshot have been captured for your analysis.\n\nConsole logs:\n${
								browserActionResult?.logs || "(No new logs)"
							}\n\n(REMEMBER: if you need to proceed to using non-\`browser_action\` tools or launch a new browser, you MUST first close cline browser. For example, if after analyzing the logs and screenshot you need to edit a file, you must first close the browser before you can use the write_to_file tool.)`,
							browserActionResult?.screenshot ? [browserActionResult.screenshot] : [],
						),
					)
					break
				case "close":
					pushToolResult(
						formatResponse.toolResult(
							`The browser has been closed. You may now proceed to using other tools.`,
						),
					)
					break
			}
			return
		}
	} catch (error) {
		await theaTask.browserSession.closeBrowser() // if any error occurs, the browser session is terminated
		await handleError("executing browser action", error)
		return
	}
}
