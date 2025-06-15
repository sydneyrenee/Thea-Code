import { TheaTask } from '../../TheaTask';

/**
 * Manages the stack of TheaTask instances.
 * This is a simplified version of the original implementation.
 */
export class TheaTaskStack {
  private stack: TheaTask[] = [];

  /**
   * Adds a TheaTask to the stack.
   * 
   * @param task The TheaTask to add
   */
  public async addTheaTask(task: TheaTask): Promise<void> {
    this.stack.push(task);
  }

  /**
   * Removes the current TheaTask from the stack.
   */
  public async removeCurrentTheaTask(): Promise<void> {
    if (this.stack.length > 0) {
      const task = this.stack.pop();
      // In the full implementation, we would clean up the task here
    }
  }

  /**
   * Gets the current TheaTask from the stack.
   * 
   * @returns The current TheaTask or undefined if the stack is empty
   */
  public getCurrentTheaTask(): TheaTask | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }

  /**
   * Gets the size of the stack.
   * 
   * @returns The number of TheaTask instances in the stack
   */
  public getSize(): number {
    return this.stack.length;
  }

  /**
   * Gets the entire task stack.
   * 
   * @returns The array of TheaTask instances
   */
  public getTaskStack(): TheaTask[] {
    return [...this.stack];
  }

  /**
   * Finishes a subtask and removes it from the stack.
   * 
   * @param message Optional message to pass to the parent task
   */
  public async finishSubTask(message?: string): Promise<void> {
    if (this.stack.length > 1) {
      // In the full implementation, we would handle the message and parent task here
      await this.removeCurrentTheaTask();
    }
  }
}