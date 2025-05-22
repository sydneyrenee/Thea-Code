import { ApiHandlerOptions, ModelInfo } from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ApiStream } from "../transform/stream"
import * as vscode from "vscode"
import { EXTENSION_NAME } from "../../../dist/thea-config" // Import branded constant
import { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history";
/**
 * Human Relay API processor
 * This processor does not directly call the API, but interacts with the model through human operations copy and paste.
 */
// export class HumanRelayHandler implements ApiHandler, SingleCompletionHandler { // Unused class
// 	private options: ApiHandlerOptions
//
// 	constructor(options: ApiHandlerOptions) { // Unused constructor
// 		this.options = options
// 	}
// 	countTokens(content: NeutralMessageContent): Promise<number> {
// 		return Promise.resolve(0)
// 	}
//
// 	/**
// 	 * Create a message processing flow, display a dialog box to request human assistance
// 	 * @param systemPrompt System prompt words
// 	 * @param messages Message list
// 	 */
// 	async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
// 		// Get the most recent user message
// 		const latestMessage = messages[messages.length - 1]
//
// 		if (!latestMessage) {
// 			throw new Error("No message to relay")
// 		}
//
// 		// If it is the first message, splice the system prompt word with the user message
// 		let promptText = getMessageContent(latestMessage) // Initializer is not redundant if used directly
// 		if (messages.length === 1) {
// 			promptText = `${systemPrompt}\\n\\n${promptText}`
// 		}
//
// 		// Copy to clipboard
// 		await vscode.env.clipboard.writeText(promptText)
//
// 		// A dialog box pops up to request user action
// 		const response = await showHumanRelayDialog(promptText)
//
// 		if (!response) {
// 			// The user canceled the operation
// 			throw new Error("Human relay operation cancelled")
// 		}
//
// 		// Return to the user input reply
// 		yield { type: "text", text: response }
// 	}
//
// 	/**
// 	 * Get model information
// 	 */
// 	getModel(): { id: string; info: ModelInfo } {
// 		// Human relay does not depend on a specific model, here is a default configuration
// 		return {
// 			id: "human-relay",
// 			info: {
// 				maxTokens: 16384,
// 				contextWindow: 100000,
// 				supportsImages: true,
// 				supportsPromptCache: false,
// 				supportsComputerUse: true,
// 				inputPrice: 0,
// 				outputPrice: 0,
// 				description: "Calling web-side AI model through human relay",
// 			},
// 		}
// 	}
//
// 	/**
// 	 * Implementation of a single prompt
// 	 * @param prompt Prompt content
// 	 */
// 	async completePrompt(prompt: string): Promise<string> {
// 		// Copy to clipboard
// 		await vscode.env.clipboard.writeText(prompt)
//
// 		// A dialog box pops up to request user action
// 		const response = await showHumanRelayDialog(prompt)
//
// 		if (!response) {
// 			throw new Error("Human relay operation cancelled")
// 		}
//
// 		return response
// 	}
// }

/**
 * Extract text content from message object
 * @param message
 */
function getMessageContent(message: NeutralConversationHistory[0]): string {
	if (typeof message.content === "string") {
		return message.content
	} else if (Array.isArray(message.content)) {
		return message.content
			.filter((item) => item.type === "text")
			.map((item) => (item.type === "text" ? item.text : ""))
			.join("\n")
	}
	return ""
}
/**
 * Displays the human relay dialog and waits for user response.
 * @param promptText The prompt text that needs to be copied.
 * @returns The user's input response or undefined (if canceled).
 */
async function showHumanRelayDialog(promptText: string): Promise<string | undefined> {
	return new Promise<string | undefined>((resolve) => {
		// Create a unique request ID
		const requestId = Date.now().toString()

		// Register a global callback function
		vscode.commands.executeCommand(
			`${EXTENSION_NAME}.registerHumanRelayCallback`,
			requestId,
			(response: string | undefined) => {
				resolve(response)
			},
		)

		// Open the dialog box directly using the current panel
		vscode.commands.executeCommand(`${EXTENSION_NAME}.showHumanRelayDialog`, {
			requestId,
			promptText,
		})
	})
}
