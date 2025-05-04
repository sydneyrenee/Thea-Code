import { EventEmitter } from "events"
import * as vscode from "vscode"

import { TheaProvider } from "../core/webview/TheaProvider" // Renamed import

import { TheaCodeAPI, TheaCodeEvents, TokenUsage, TheaCodeSettings } from "./thea-code"
import { MessageHistory } from "./message-history"

export class API extends EventEmitter<TheaCodeEvents> implements TheaCodeAPI {
	private readonly outputChannel: vscode.OutputChannel
	private readonly provider: TheaProvider // Renamed type
	private readonly history: MessageHistory
	private readonly tokenUsage: Record<string, TokenUsage>

	constructor(outputChannel: vscode.OutputChannel, provider: TheaProvider) { // Renamed type
		super()

		this.outputChannel = outputChannel
		this.provider = provider
		this.history = new MessageHistory()
		this.tokenUsage = {}

		this.provider.on("theaTaskCreated", (task) => { // Renamed event and parameter
			task.on("message", (message) => this.emit("message", { ...message })) // Remove duplicate taskId
			task.on("taskStarted", () => this.emit("taskStarted", task.taskId)) // Use renamed parameter
			task.on("taskPaused", () => this.emit("taskPaused", task.taskId)) // Use renamed parameter
			task.on("taskUnpaused", () => this.emit("taskUnpaused", task.taskId)) // Use renamed parameter
			task.on("taskAskResponded", () => this.emit("taskAskResponded", task.taskId)) // Use renamed parameter
			task.on("taskAborted", () => this.emit("taskAborted", task.taskId)) // Use renamed parameter
			task.on("taskSpawned", (childTaskId) => this.emit("taskSpawned", task.taskId, childTaskId)) // Use renamed parameter
			task.on("taskCompleted", (_, usage) => this.emit("taskCompleted", task.taskId, usage)) // Use renamed parameter
			task.on("taskTokenUsageUpdated", (_, usage) => this.emit("taskTokenUsageUpdated", task.taskId, usage)) // Use renamed parameter
			this.emit("taskCreated", task.taskId) // Use renamed parameter
		})

		this.on("message", ({ taskId, action, message }) => {
			if (action === "created") {
				this.history.add(taskId, message)
			} else if (action === "updated") {
				this.history.update(taskId, message)
			}
		})

		this.on("taskTokenUsageUpdated", (taskId, usage) => (this.tokenUsage[taskId] = usage))
	}

	public async startNewTask(text?: string, images?: string[]) {
		await this.provider.removeClineFromStack()
		await this.provider.postStateToWebview()
		await this.provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		await this.provider.postMessageToWebview({ type: "invoke", invoke: "newChat", text, images })

		const theaTask = await this.provider.initClineWithTask(text, images) // Renamed variable
		return theaTask.taskId // Use renamed variable
		return theaTask.taskId // Use renamed variable
	}

	public getCurrentTaskStack() {
		return this.provider.getCurrentTaskStack()
	}

	public async clearCurrentTask(lastMessage?: string) {
		await this.provider.finishSubTask(lastMessage)
	}

	public async cancelCurrentTask() {
		await this.provider.cancelTask()
	}

	public async sendMessage(text?: string, images?: string[]) {
		await this.provider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text, images })
	}

	public async pressPrimaryButton() {
		await this.provider.postMessageToWebview({ type: "invoke", invoke: "primaryButtonClick" })
	}

	public async pressSecondaryButton() {
		await this.provider.postMessageToWebview({ type: "invoke", invoke: "secondaryButtonClick" })
	}

	public getConfiguration() {
		return this.provider.getValues()
	}

	public getConfigurationValue<K extends keyof TheaCodeSettings>(key: K) {
		return this.provider.getValue(key)
	}

	public async setConfiguration(values: TheaCodeSettings) {
		await this.provider.setValues(values)
	}

	public async setConfigurationValue<K extends keyof TheaCodeSettings>(key: K, value: TheaCodeSettings[K]) {
		await this.provider.setValue(key, value)
	}

	public isReady() {
		return this.provider.viewLaunched
	}

	public getMessages(taskId: string) {
		return this.history.getMessages(taskId)
	}

	public getTokenUsage(taskId: string) {
		return this.tokenUsage[taskId]
	}

	public log(message: string) {
		this.outputChannel.appendLine(message)
	}
}
