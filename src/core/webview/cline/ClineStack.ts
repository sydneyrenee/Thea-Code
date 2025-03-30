// Extracted from src/core/webview/ClineProvider-original.ts

import { Cline } from "../../Cline"
import { t } from "../../../i18n"

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
        this.stack.push(cline)
        // No validation here - this was done in the original ClineProvider by checking state.mode
        // The validation will be handled by ClineProvider's addClineToStack method
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
                console.log(
                    `[subtasks] encountered error while aborting task ${cline.taskId}.${cline.instanceId}: ${e.message}`,
                )
            }
        }

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
        // Remove the last cline instance from the stack (this is the finished sub task)
        await this.removeCurrentCline()
        // Resume the last cline instance in the stack (if it exists - this is the 'parent' calling task)
        const parentCline = this.getCurrentCline();
        if (parentCline) {
            parentCline.resumePausedTask(lastMessage)
        }
    }
}
