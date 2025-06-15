import * as vscode from 'vscode';

/**
 * Gets the URI for a resource in the webview.
 * 
 * @param webview The webview to get the URI for
 * @param extensionUri The URI of the extension
 * @param pathList The path segments to the resource
 * @returns The URI for the resource
 */
export function getUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}