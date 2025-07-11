import * as vscode from "vscode"

import { EXTENSION_NAME } from "../../../dist/thea-config" // Import branded constant
import { TheaCodeAPI } from "../../../src/exports/thea-code"

type WaitForOptions = {
	timeout?: number
	interval?: number
}

export const waitFor = (
	condition: (() => Promise<boolean>) | (() => boolean),
	{ timeout = 60_000, interval = 250 }: WaitForOptions = {},
) => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined

	return Promise.race([
		new Promise<void>((resolve) => {
			const check = async () => {
				const result = condition()
				const isSatisfied = result instanceof Promise ? await result : result

				if (isSatisfied) {
					if (timeoutId) {
						clearTimeout(timeoutId)
						timeoutId = undefined
					}

					resolve()
				} else {
					setTimeout(() => void check(), interval)
				}
			}

			void check()
		}),
		new Promise((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`Timeout after ${Math.floor(timeout / 1000)}s`))
			}, timeout)
		}),
	])
}

type WaitUntilReadyOptions = WaitForOptions & {
	api: TheaCodeAPI
}

export const waitUntilReady = async ({ api, ...options }: WaitUntilReadyOptions) => {
	await vscode.commands.executeCommand(`${EXTENSION_NAME}.SidebarProvider.focus`)
	await waitFor(() => api.isReady(), options)
}

type WaitUntilAbortedOptions = WaitForOptions & {
	api: TheaCodeAPI
	taskId: string
}

export const waitUntilAborted = async ({ api, taskId, ...options }: WaitUntilAbortedOptions) => {
	const set = new Set<string>()
	api.on("taskAborted", (taskId) => set.add(taskId))
	await waitFor(() => set.has(taskId), options)
}

export const waitForCompletion = async ({
	api,
	taskId,
	...options
}: WaitUntilReadyOptions & {
	taskId: string
}) => waitFor(() => !!getCompletion({ api, taskId }), options)

export const getCompletion = ({ api, taskId }: { api: TheaCodeAPI; taskId: string }) =>
	api.getMessages(taskId).find(({ say, partial }) => say === "completion_result" && partial === false)

type WaitForMessageOptions = WaitUntilReadyOptions & {
	taskId: string
	include: string
	exclude?: string
}

export const waitForMessage = async ({ api, taskId, include, exclude, ...options }: WaitForMessageOptions) =>
	waitFor(() => !!getMessage({ api, taskId, include, exclude }), options)

type GetMessageOptions = {
	api: TheaCodeAPI
	taskId: string
	include: string
	exclude?: string
}

export const getMessage = ({ api, taskId, include, exclude }: GetMessageOptions) =>
	api
		.getMessages(taskId)
		.find(
			({ type, text }) =>
				type === "say" && text && text.includes(include) && (!exclude || !text.includes(exclude)),
		)

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
