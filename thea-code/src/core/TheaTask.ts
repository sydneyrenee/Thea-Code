import * as vscode from 'vscode';
import { TheaProvider } from './webview/TheaProvider';

/**
 * Options for creating a TheaTask.
 */
export interface TheaTaskOptions {
  provider: TheaProvider;
  apiConfiguration?: any;
  customInstructions?: string;
  enableDiff?: boolean;
  enableCheckpoints?: boolean;
  checkpointStorage?: string;
  fuzzyMatchThreshold?: number;
  task?: string;
  images?: string[];
  experiments?: any;
  rootTask?: TheaTask;
  parentTask?: TheaTask;
  taskNumber?: number;
  historyItem?: any;
  onCreated?: (task: TheaTask) => void;
}

/**
 * Represents a task in the Thea Code extension.
 * This is a simplified version of the original implementation.
 */
export class TheaTask {
  public taskId: string;
  public instanceId: string;
  public taskStateManager: any = { theaTaskMessages: [] };
  public isStreaming = false;
  public didFinishAbortingStream = false;
  public isWaitingForFirstChunk = true;
  public abandoned = false;
  public customInstructions?: string;
  public api: any;
  public diffStrategy: any = { getName: () => 'default' };
  public rootTask?: TheaTask;
  public parentTask?: TheaTask;

  /**
   * Creates a new instance of TheaTask.
   * 
   * @param options The options for creating the task
   */
  constructor(private readonly options: TheaTaskOptions) {
    this.taskId = `task-${Date.now()}`;
    this.instanceId = `instance-${Date.now()}`;
    this.customInstructions = options.customInstructions;
    this.rootTask = options.rootTask;
    this.parentTask = options.parentTask;
    
    // Call the onCreated callback if provided
    if (options.onCreated) {
      options.onCreated(this);
    }
  }

  /**
   * Aborts the task.
   */
  public async abortTask(): Promise<void> {
    // In the full implementation, this would abort the task
    this.didFinishAbortingStream = true;
    this.isStreaming = false;
  }
}