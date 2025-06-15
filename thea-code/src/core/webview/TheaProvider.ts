import * as vscode from 'vscode';
import * as os from 'os';
import EventEmitter from 'events';

import { getUri } from './getUri';
import { getNonce } from './getNonce';
import { TheaTaskStack } from './thea/TheaTaskStack';
import { TheaStateManager } from './thea/TheaStateManager';
import { TheaApiManager } from './api/TheaApiManager';
import { TheaTaskHistory } from './history/TheaTaskHistory';
import { TheaCacheManager } from './cache/TheaCacheManager';
import { TheaMcpManager } from './mcp/TheaMcpManager';
import { ContextProxy } from '../config/ContextProxy';
import { ProviderSettingsManager } from '../config/ProviderSettingsManager';
import { CustomModesManager } from '../config/CustomModesManager';

// Constants that would be imported from config
const EXTENSION_DISPLAY_NAME = 'Thea Code';
const VIEWS = {
  SIDEBAR: 'thea-code.sidebar',
  TAB_PANEL: 'thea-code.tabPanel'
};

/**
 * Events emitted by TheaProvider
 */
export type TheaProviderEvents = {
  theaTaskCreated: [task: any]
  message: [{ taskId: string; action: "created" | "updated"; message: any }]
  taskStarted: [taskId: string]
  taskPaused: [taskId: string]
  taskUnpaused: [taskId: string]
  taskAskResponded: [taskId: string]
  taskAborted: [taskId: string]
  taskSpawned: [taskId: string, childTaskId: string]
  taskCompleted: [taskId: string, usage: any]
  taskTokenUsageUpdated: [taskId: string, usage: any]
};

/**
 * Provides the webview for the Thea Code extension.
 * This is a simplified version of the original implementation.
 */
export class TheaProvider extends EventEmitter<TheaProviderEvents> implements vscode.WebviewViewProvider {
  public static readonly sideBarId = VIEWS.SIDEBAR;
  public static readonly tabPanelId = VIEWS.TAB_PANEL;
  private static activeInstances: Set<TheaProvider> = new Set();
  private disposables: vscode.Disposable[] = [];
  
  // View state
  view?: vscode.WebviewView | vscode.WebviewPanel;
  isViewLaunched = false;
  
  // Manager instances
  public readonly contextProxy: ContextProxy;
  public readonly providerSettingsManager: ProviderSettingsManager;
  public readonly customModesManager: CustomModesManager;
  private readonly theaTaskStackManager: TheaTaskStack;
  private readonly theaStateManager: TheaStateManager;
  private readonly theaApiManager: TheaApiManager;
  private readonly theaTaskHistoryManager: TheaTaskHistory;
  private readonly theaCacheManager: TheaCacheManager;
  private readonly theaMcpManager: TheaMcpManager;

  /**
   * Creates a new instance of TheaProvider.
   * 
   * @param context The extension context
   * @param outputChannel The output channel
   * @param renderContext The render context (sidebar or editor)
   */
  constructor(
    readonly context: vscode.ExtensionContext,
    readonly outputChannel: vscode.OutputChannel,
    private readonly renderContext: "sidebar" | "editor" = "sidebar"
  ) {
    super();

    this.outputChannel.appendLine("TheaProvider instantiated");
    
    // Initialize context proxy
    this.contextProxy = new ContextProxy(context);
    TheaProvider.activeInstances.add(this);

    // Initialize managers
    this.providerSettingsManager = new ProviderSettingsManager(this.context);
    this.customModesManager = new CustomModesManager(this.context, async () => {
      await this.postStateToWebview();
    });
    
    this.theaTaskStackManager = new TheaTaskStack();
    this.theaStateManager = new TheaStateManager(
      this.context,
      this.providerSettingsManager,
      this.customModesManager
    );
    this.theaStateManager.getCustomModes = () => this.customModesManager.getCustomModes();
    
    this.theaApiManager = new TheaApiManager(
      this.context,
      this.outputChannel,
      this.contextProxy,
      this.providerSettingsManager
    );
    
    this.theaTaskHistoryManager = new TheaTaskHistory(this.context, this.contextProxy);
    this.theaCacheManager = new TheaCacheManager(this.context);
    this.theaMcpManager = new TheaMcpManager(this.context);
  }

  /**
   * Disposes of the provider.
   */
  async dispose() {
    this.outputChannel.appendLine("Disposing TheaProvider...");
    await this.theaTaskStackManager.removeCurrentTheaTask();
    this.outputChannel.appendLine("Cleared task");

    if (this.view && "dispose" in this.view) {
      this.view.dispose();
      this.outputChannel.appendLine("Disposed webview");
    }

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }

    TheaProvider.activeInstances.delete(this);
    this.outputChannel.appendLine("Disposed all disposables");
  }

  /**
   * Gets the visible instance of TheaProvider.
   * 
   * @returns The visible instance of TheaProvider
   */
  public static getVisibleInstance(): TheaProvider | undefined {
    return Array.from(this.activeInstances).find(instance => instance.view?.visible === true);
  }

  /**
   * Gets an instance of TheaProvider.
   * 
   * @returns An instance of TheaProvider
   */
  public static async getInstance(): Promise<TheaProvider | undefined> {
    return TheaProvider.getVisibleInstance();
  }

  /**
   * Resolves the webview view.
   * 
   * @param webviewView The webview view to resolve
   */
  async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
    this.outputChannel.appendLine("Resolving webview view");
    
    if (!this.contextProxy.isInitialized) {
      await this.contextProxy.initialize();
    }

    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.contextProxy.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Set up event listeners
    this.setWebviewMessageListener(webviewView.webview);

    // Listen for when the view is disposed
    webviewView.onDidDispose(
      async () => {
        await this.dispose();
      },
      null,
      this.disposables
    );

    // If the extension is starting a new session, clear previous task state
    await this.theaTaskStackManager.removeCurrentTheaTask();

    this.outputChannel.appendLine("Webview view resolved");
  }

  /**
   * Posts a message to the webview.
   * 
   * @param message The message to post
   */
  public async postMessageToWebview(message: any) {
    await this.view?.webview.postMessage(message);
  }

  /**
   * Gets the HTML content for the webview.
   * 
   * @param webview The webview
   * @returns The HTML content
   */
  private getHtmlContent(webview: vscode.Webview): string {
    // Get URIs for resources
    const stylesUri = getUri(webview, this.contextProxy.extensionUri, [
      "webview-ui",
      "build",
      "assets",
      "index.css",
    ]);
    
    const scriptUri = getUri(webview, this.contextProxy.extensionUri, [
      "webview-ui",
      "build",
      "assets",
      "index.js"
    ]);
    
    const codiconsUri = getUri(webview, this.contextProxy.extensionUri, [
      "node_modules",
      "@vscode",
      "codicons",
      "dist",
      "codicon.css",
    ]);
    
    const imagesUri = getUri(webview, this.contextProxy.extensionUri, [
      "assets",
      "images"
    ]);

    // Use a nonce for security
    const nonce = getNonce();

    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
          <meta name="theme-color" content="#000000">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri.toString()}">
          <link href="${codiconsUri.toString()}" rel="stylesheet" />
          <script nonce="${nonce}">
            window.IMAGES_BASE_URI = "${imagesUri.toString()}"
          </script>
          <title>${EXTENSION_DISPLAY_NAME}</title> 
        </head>
        <body>
          <noscript>You need to enable JavaScript to run this app.</noscript>
          <div id="root"></div>
          <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
        </body>
      </html>
    `;
  }

  /**
   * Sets up the webview message listener.
   * 
   * @param webview The webview
   */
  private setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      async (message: any) => {
        // In the full implementation, this would handle messages from the webview
        console.log('Received message from webview:', message);
      },
      null,
      this.disposables
    );
  }

  /**
   * Posts the state to the webview.
   */
  async postStateToWebview() {
    const state = await this.getStateToPostToWebview();
    await this.postMessageToWebview({ type: "state", state });
  }

  /**
   * Gets the state to post to the webview.
   * 
   * @returns The state to post to the webview
   */
  async getStateToPostToWebview() {
    const state = await this.theaStateManager.getState();
    
    // Add additional properties
    return {
      ...state,
      version: this.context.extension?.packageJSON?.version || "",
      osInfo: os.platform() === "win32" ? "win32" : "unix",
      uriScheme: vscode.env.uriScheme,
      currentTaskItem: this.theaTaskStackManager.getCurrentTheaTask()?.taskId
        ? (state.taskHistory || []).find(
            (item: any) => item.id === this.theaTaskStackManager.getCurrentTheaTask()?.taskId
          )
        : undefined,
      cwd: this.cwd,
      renderContext: this.renderContext,
    };
  }

  /**
   * Gets the current working directory.
   * 
   * @returns The current working directory
   */
  get cwd() {
    // In the full implementation, this would get the workspace path
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /**
   * Logs a message.
   * 
   * @param message The message to log
   */
  public log(message: string) {
    this.outputChannel.appendLine(message);
    console.log(message);
  }

  /**
   * Gets the current task.
   * 
   * @returns The current task
   */
  public getCurrent(): any {
    return this.theaTaskStackManager.getCurrentTheaTask();
  }
}