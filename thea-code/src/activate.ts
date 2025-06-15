import * as vscode from 'vscode';
import { TheaProvider } from './core/webview/TheaProvider';

/**
 * Panel reference for the webview.
 */
let panel: vscode.WebviewPanel | vscode.WebviewView | undefined;

/**
 * Sets the panel reference.
 * 
 * @param p The panel to set
 * @param type The type of panel
 */
export function setPanel(p: vscode.WebviewPanel | vscode.WebviewView, type: 'tab' | 'sidebar'): void {
  panel = p;
}

/**
 * Interface for command registration options.
 */
interface CommandRegistrationOptions {
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  provider: TheaProvider;
}

/**
 * Registers commands for the extension.
 * 
 * @param options The command registration options
 */
export function registerCommands(options: CommandRegistrationOptions): void {
  const { context, outputChannel, provider } = options;

  // In the full implementation, this would register commands
  // Here we'll register a simple command as an example
  context.subscriptions.push(
    vscode.commands.registerCommand('thea-code.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from Thea Code!');
    })
  );
}

/**
 * Registers code actions for the extension.
 * 
 * @param context The extension context
 */
export function registerCodeActions(context: vscode.ExtensionContext): void {
  // In the full implementation, this would register code actions
}

/**
 * Registers terminal actions for the extension.
 * 
 * @param context The extension context
 */
export function registerTerminalActions(context: vscode.ExtensionContext): void {
  // In the full implementation, this would register terminal actions
}

/**
 * Handles a URI for the extension.
 * 
 * @param uri The URI to handle
 */
export function handleUri(uri: vscode.Uri): void {
  // In the full implementation, this would handle a URI
}