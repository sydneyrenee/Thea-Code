import * as vscode from 'vscode';

/**
 * Provides a proxy for accessing the extension context.
 * This is a simplified version of the original implementation.
 */
export class ContextProxy {
  public isInitialized = false;
  public extensionUri: vscode.Uri;
  public extensionMode: vscode.ExtensionMode;
  public globalStorageUri: vscode.Uri;

  /**
   * Creates a new instance of ContextProxy.
   * 
   * @param context The extension context
   */
  constructor(
    private readonly context: vscode.ExtensionContext
  ) {
    this.extensionUri = context.extensionUri;
    this.extensionMode = context.extensionMode;
    this.globalStorageUri = context.globalStorageUri;
  }

  /**
   * Initializes the context proxy.
   */
  public async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * Gets a value from the global state.
   * 
   * @param key The key to get
   * @returns The value
   */
  public getValue<T>(key: string): T | undefined {
    return this.context.globalState.get<T>(key);
  }

  /**
   * Sets a value in the global state.
   * 
   * @param key The key to set
   * @param value The value to set
   */
  public async setValue<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  /**
   * Gets multiple values from the global state.
   * 
   * @param keys The keys to get
   * @returns The values
   */
  public getValues<T>(keys: string[]): Record<string, T | undefined> {
    const result: Record<string, T | undefined> = {};
    for (const key of keys) {
      result[key] = this.getValue<T>(key);
    }
    return result;
  }

  /**
   * Sets multiple values in the global state.
   * 
   * @param values The values to set
   */
  public async setValues<T>(values: Record<string, T>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      await this.setValue(key, value);
    }
  }

  /**
   * Resets all state.
   */
  public async resetAllState(): Promise<void> {
    // In the full implementation, this would reset all state
  }
}