import pWaitFor from "p-wait-for"
import * as vscode from "vscode" // Assuming needed for provider context or types
import { TheaProvider } from "./webview/TheaProvider" // Renamed import and path
import { TheaAsk, TheaMessage, TheaSay, ToolProgressStatus } from "../shared/ExtensionMessage" // Renamed imports
import { ClineAskResponse as TheaAskResponse } from "../shared/WebviewMessage" // Renamed import and type // TODO: Rename source type

// TODO: Rename types if necessary

interface TaskWebviewCommunicatorOptions {
	providerRef: WeakRef<TheaProvider> // Renamed type
	getMessages: () => TheaMessage[] // Renamed type
	addMessage: (message: TheaMessage) => Promise<void> // Renamed type
	updateMessageUi: (message: TheaMessage) => Promise<void> // Renamed type
	saveMessages: () => Promise<void> // Function to trigger saving messages (calls state manager)
	isTaskAborted: () => boolean // Getter for abort status
	taskId: string
	instanceId: string
	onAskResponded: () => void // Callback when ask response is received
}

export class TaskWebviewCommunicator {
	private providerRef: WeakRef<TheaProvider> // Renamed type
	private getMessages: () => TheaMessage[] // Renamed type
	private addMessage: (message: TheaMessage) => Promise<void> // Renamed type
	private updateMessageUi: (message: TheaMessage) => Promise<void> // Renamed type
	private saveMessages: () => Promise<void>
	private isTaskAborted: () => boolean
	private taskId: string
	private instanceId: string
	private onAskResponded: () => void

	// State managed by this communicator
	private askResponse?: TheaAskResponse // Renamed type
	private askResponseText?: string
	private askResponseImages?: string[]
	private lastMessageTs?: number // Tracks the timestamp of the last ask/say message sent

	constructor(options: TaskWebviewCommunicatorOptions) {
		this.providerRef = options.providerRef
		this.getMessages = options.getMessages
		this.addMessage = options.addMessage
		this.updateMessageUi = options.updateMessageUi
		this.saveMessages = options.saveMessages
		this.isTaskAborted = options.isTaskAborted
		this.taskId = options.taskId
		this.instanceId = options.instanceId
		this.onAskResponded = options.onAskResponded
	}

	// --- Ask Logic ---

	async ask(
		type: TheaAsk, // Renamed type
		text?: string,
		partial?: boolean,
		progressStatus?: ToolProgressStatus,
	): Promise<{ response: TheaAskResponse; text?: string; images?: string[] }> { // Renamed type
		if (this.isTaskAborted()) {
			throw new Error(`[TaskWebviewCommunicator#ask] task ${this.taskId}.${this.instanceId} aborted`)
		}

		let askTs: number
		const currentMessages = this.getMessages()

		if (partial !== undefined) {
			const lastMessage = currentMessages.at(-1)
			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "ask" && lastMessage.ask === type

			if (partial) {
				if (isUpdatingPreviousPartial) {
					lastMessage.text = text
					lastMessage.partial = partial
					lastMessage.progressStatus = progressStatus
					await this.updateMessageUi(lastMessage) // Update UI only
					throw new Error("Current ask promise was ignored (#1)")
				} else {
					askTs = Date.now()
					this.lastMessageTs = askTs
					await this.addMessage({ ts: askTs, type: "ask", ask: type, text, partial })
					throw new Error("Current ask promise was ignored (#2)")
				}
			} else {
				if (isUpdatingPreviousPartial) {
					this.askResponse = undefined
					this.askResponseText = undefined
					this.askResponseImages = undefined
					askTs = lastMessage.ts
					this.lastMessageTs = askTs
					lastMessage.text = text
					lastMessage.partial = false
					lastMessage.progressStatus = progressStatus
					await this.saveMessages() // Save completed message
					await this.updateMessageUi(lastMessage) // Update UI
				} else {
					this.askResponse = undefined
					this.askResponseText = undefined
					this.askResponseImages = undefined
					askTs = Date.now()
					this.lastMessageTs = askTs
					await this.addMessage({ ts: askTs, type: "ask", ask: type, text })
				}
			}
		} else {
			this.askResponse = undefined
			this.askResponseText = undefined
			this.askResponseImages = undefined
			askTs = Date.now()
			this.lastMessageTs = askTs
			await this.addMessage({ ts: askTs, type: "ask", ask: type, text })
		}

		// Wait for the response or for a newer message to supersede this one
		await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTs, { interval: 100 })

		if (this.lastMessageTs !== askTs) {
			throw new Error("Current ask promise was ignored (superseded)")
		}

		// Capture result and clear state
		const result = { response: this.askResponse!, text: this.askResponseText, images: this.askResponseImages }
		this.askResponse = undefined
		this.askResponseText = undefined
		this.askResponseImages = undefined
		this.onAskResponded() // Notify listener
		return result
	}

	// Called by the provider when a response comes from the webview
	handleWebviewAskResponse(askResponse: TheaAskResponse, text?: string, images?: string[]) { // Renamed type
		this.askResponse = askResponse
		this.askResponseText = text
		this.askResponseImages = images
	}

	// --- Say Logic ---

	async say(
		type: TheaSay, // Renamed type
		text?: string,
		images?: string[],
		partial?: boolean,
		checkpoint?: Record<string, unknown>, // Checkpoint data might still be passed through say
		progressStatus?: ToolProgressStatus,
	): Promise<void> {
		if (this.isTaskAborted()) {
			throw new Error(`[TaskWebviewCommunicator#say] task ${this.taskId}.${this.instanceId} aborted`)
		}

		const currentMessages = this.getMessages()

		if (partial !== undefined) {
			const lastMessage = currentMessages.at(-1)
			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "say" && lastMessage.say === type

			if (partial) {
				if (isUpdatingPreviousPartial) {
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = partial
					lastMessage.progressStatus = progressStatus
					await this.updateMessageUi(lastMessage) // Update UI only
				} else {
					const sayTs = Date.now()
					this.lastMessageTs = sayTs
					await this.addMessage({ ts: sayTs, type: "say", say: type, text, images, partial })
				}
			} else {
				if (isUpdatingPreviousPartial) {
					this.lastMessageTs = lastMessage.ts // Keep original timestamp
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = false
					lastMessage.progressStatus = progressStatus
					await this.saveMessages() // Save completed message
					await this.updateMessageUi(lastMessage) // Update UI
				} else {
					const sayTs = Date.now()
					this.lastMessageTs = sayTs
					await this.addMessage({ ts: sayTs, type: "say", say: type, text, images })
				}
			}
		} else {
			const sayTs = Date.now()
			this.lastMessageTs = sayTs
			await this.addMessage({ ts: sayTs, type: "say", say: type, text, images, checkpoint })
		}
	}
}