import { EventEmitter } from "events"

import type { ProviderSettings, GlobalSettings, TheaMessage, TokenUsage } from "./types" // Renamed type

type TheaCodeSettings = GlobalSettings & ProviderSettings

export type { TheaCodeSettings, ProviderSettings, GlobalSettings, TheaMessage, TokenUsage } // Renamed type

export interface TheaCodeEvents {
	message: [{ taskId: string; action: "created" | "updated"; message: TheaMessage }] // Renamed type
	taskCreated: [taskId: string]
	taskStarted: [taskId: string]
	taskPaused: [taskId: string]
	taskUnpaused: [taskId: string]
	taskAskResponded: [taskId: string]
	taskAborted: [taskId: string]
	taskSpawned: [taskId: string, childTaskId: string]
	taskCompleted: [taskId: string, usage: TokenUsage]
	taskTokenUsageUpdated: [taskId: string, usage: TokenUsage]
}

export interface TheaCodeAPI extends EventEmitter<TheaCodeEvents> {
	/**
	 * Starts a new task with an optional initial message and images.
	 * @param task Optional initial task message.
	 * @param images Optional array of image data URIs (e.g., "data:image/webp;base64,...").
	 * @returns The ID of the new task.
	 */
	startNewTask(task?: string, images?: string[]): Promise<string>

	/**
	 * Returns the current task stack.
	 * @returns An array of task IDs.
	 */
	getCurrentTaskStack(): string[]

	/**
	 * Clears the current task.
	 */
	clearCurrentTask(lastMessage?: string): Promise<void>

	/**
	 * Cancels the current task.
	 */
	cancelCurrentTask(): Promise<void>

	/**
	 * Sends a message to the current task.
	 * @param message Optional message to send.
	 * @param images Optional array of image data URIs (e.g., "data:image/webp;base64,...").
	 */
	sendMessage(message?: string, images?: string[]): Promise<void>

	/**
	 * Simulates pressing the primary button in the chat interface.
	 */
	pressPrimaryButton(): Promise<void>

	/**
	 * Simulates pressing the secondary button in the chat interface.
	 */
	pressSecondaryButton(): Promise<void>

	/**
	 * Returns the current configuration.
	 * @returns The current configuration.
	 */
	getConfiguration(): TheaCodeSettings

	/**
	 * Returns the value of a configuration key.
	 * @param key The key of the configuration value to return.
	 * @returns The value of the configuration key.
	 */
	getConfigurationValue<K extends keyof TheaCodeSettings>(key: K): TheaCodeSettings[K]

	/**
	 * Sets the configuration for the current task.
	 * @param values An object containing key-value pairs to set.
	 */
	setConfiguration(values: TheaCodeSettings): Promise<void>

	/**
	 * Sets the value of a configuration key.
	 * @param key The key of the configuration value to set.
	 * @param value The value to set.
	 */
	setConfigurationValue<K extends keyof TheaCodeSettings>(key: K, value: TheaCodeSettings[K]): Promise<void>

	/**
	 * Returns true if the API is ready to use.
	 */
	isReady(): boolean

	/**
	 * Returns the messages for a given task.
	 * @param taskId The ID of the task.
	 * @returns An array of TheaMessage objects.
	 */
	getMessages(taskId: string): TheaMessage[] // Renamed return type

	/**
	 * Returns the token usage for a given task.
	 * @param taskId The ID of the task.
	 * @returns A TokenUsage object.
	 */
	getTokenUsage(taskId: string): TokenUsage

	/**
	 * Logs a message to the output channel.
	 * @param message The message to log.
	 */
	log(message: string): void
}
