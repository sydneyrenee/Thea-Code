import * as vscode from 'vscode';
import { TheaProvider } from '../core/webview/TheaProvider';

/**
 * Provides an API for other extensions to interact with the Thea Code extension.
 * This is a simplified version of the original implementation.
 */
export class API {
  /**
   * Creates a new instance of API.
   * 
   * @param outputChannel The output channel
   * @param provider The provider
   */
  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly provider: TheaProvider
  ) {}

  /**
   * Gets the current task.
   * 
   * @returns The current task
   */
  public getCurrentTask(): any {
    return this.provider.getCurrent();
  }

  /**
   * Logs a message.
   * 
   * @param message The message to log
   */
  public log(message: string): void {
    this.outputChannel.appendLine(message);
  }
}