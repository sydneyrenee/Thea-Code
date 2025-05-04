import { TheaTask } from "../../TheaTask" // Updated import path and type
import { t } from "../../../i18n" // Adjusted import path

/**
 * Manages the stack of Cline instances representing ongoing tasks and subtasks.
 */
export class TheaTaskStack {
	// Renamed class
	private stack: TheaTask[] = [] // Renamed type

	/**
	 * Adds a new Cline instance to the stack.
	 * @param task The TheaTask instance to add to the stack
	 */
	async addTheaTask(task: TheaTask): Promise<void> {
		// Renamed parameter and type
		console.log(`[subtasks] adding task ${task.taskId}.${task.instanceId} to stack`) // Use renamed parameter
		// Add this task instance into the stack that represents the order of all the called tasks.
		this.stack.push(task) // Use renamed parameter
		// Note: Validation logic involving `getState` was removed as it belongs in the provider calling this method.
	}

	/**
	 * Removes and destroys the top Cline instance (the current finished task).
	 * @returns The removed TheaTask instance, if any
	 */
	async removeCurrentTheaTask(): Promise<TheaTask | undefined> {
		// Renamed return type
		if (this.stack.length === 0) {
			return undefined
		}

		// Pop the top Cline instance from the stack.
		const task = this.stack.pop() // Renamed variable

		if (task) {
			// Use renamed variable
			console.log(`[subtasks] removing task ${task.taskId}.${task.instanceId} from stack`) // Use renamed variable

			try {
				// Abort the running task and set isAbandoned to true so
				// all running promises will exit as well.
				await task.abortTask(true) // Use renamed variable
			} catch (e) {
				// Note: Logging removed, should be handled by the caller or a dedicated logger.
				console.error(
					// Keep error log for now
					`[TheaTaskStack] encountered error while aborting task ${task.taskId}.${task.instanceId}: ${e.message}`, // Renamed class in log, use renamed variable
				)
			}
		}
		// Return the popped cline instance (it's already undefined if not found)
		return task // Return renamed variable
	}

	/**
	 * Returns the current cline object in the stack (the top one)
	 * @returns The current TheaTask instance, if any
	 */
	getCurrentTheaTask(): TheaTask | undefined {
		// Renamed return type
		if (this.stack.length === 0) {
			return undefined
		}
		return this.stack[this.stack.length - 1]
	}

	/**
	 * Returns the current stack size
	 * @returns Number of TheaTask instances in the stack
	 */
	getSize(): number {
		return this.stack.length
	}

	/**
	 * Returns the IDs of all tasks in the stack
	 * @returns Array of task IDs
	 */
	getTaskStack(): string[] {
		return this.stack.map((task) => task.taskId) // Use renamed parameter
	}

	/**
	 * Finishes a subtask and resumes its parent task
	 * @param lastMessage Optional message to pass to the parent task
	 */
	async finishSubTask(lastMessage?: string): Promise<void> {
		console.log(`[subtasks] finishing subtask ${lastMessage}`)
		// remove the last cline instance from the stack (this is the finished sub task)
		await this.removeCurrentTheaTask()
		// resume the last cline instance in the stack (if it exists - this is the 'parent' calling task)
		this.getCurrentTheaTask()?.resumePausedTask(lastMessage)
	}
}
