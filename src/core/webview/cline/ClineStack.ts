import { Cline } from "../../Cline" // Adjusted import path
import { t } from "../../../i18n" // Adjusted import path

/**
 * Manages the stack of Cline instances representing ongoing tasks and subtasks.
 */
export class ClineStack {
	private stack: Cline[] = []

	/**
	 * Adds a new Cline instance to the stack.
	 * @param cline The Cline instance to add to the stack
	 */
	async addCline(cline: Cline): Promise<void> {
		console.log(`[subtasks] adding task ${cline.taskId}.${cline.instanceId} to stack`)
		// Add this cline instance into the stack that represents the order of all the called tasks.
		this.stack.push(cline)
		// Note: Validation logic involving `getState` was removed as it belongs in the provider calling this method.
	}

	/**
	 * Removes and destroys the top Cline instance (the current finished task).
	 * @returns The removed Cline instance, if any
	 */
	async removeCurrentCline(): Promise<Cline | undefined> {
		if (this.stack.length === 0) {
			return undefined
		}

		// Pop the top Cline instance from the stack.
		const cline = this.stack.pop()

		if (cline) {
			console.log(`[subtasks] removing task ${cline.taskId}.${cline.instanceId} from stack`)

			try {
				// Abort the running task and set isAbandoned to true so
				// all running promises will exit as well.
				await cline.abortTask(true)
			} catch (e) {
				// Note: Logging removed, should be handled by the caller or a dedicated logger.
				console.error( // Keep error log for now
					`[ClineStack] encountered error while aborting task ${cline.taskId}.${cline.instanceId}: ${e.message}`,
				)
			}
		}
		// Return the popped cline instance (it's already undefined if not found)
		return cline
	}

	/**
	 * Returns the current cline object in the stack (the top one)
	 * @returns The current Cline instance, if any
	 */
	getCurrentCline(): Cline | undefined {
		if (this.stack.length === 0) {
			return undefined
		}
		return this.stack[this.stack.length - 1]
	}

	/**
	 * Returns the current stack size
	 * @returns Number of Cline instances in the stack
	 */
	getSize(): number {
		return this.stack.length
	}

	/**
	 * Returns the IDs of all tasks in the stack
	 * @returns Array of task IDs
	 */
	getTaskStack(): string[] {
		return this.stack.map((cline) => cline.taskId)
	}

	/**
	 * Finishes a subtask and resumes its parent task
	 * @param lastMessage Optional message to pass to the parent task
	 */
	async finishSubTask(lastMessage?: string): Promise<void> {
		console.log(`[subtasks] finishing subtask ${lastMessage}`)
		// remove the last cline instance from the stack (this is the finished sub task)
		await this.removeCurrentCline()
		// resume the last cline instance in the stack (if it exists - this is the 'parent' calling task)
		this.getCurrentCline()?.resumePausedTask(lastMessage)
	}
}