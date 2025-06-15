import * as vscode from 'vscode';

/**
 * Gets the workspace path.
 * 
 * @returns The workspace path
 */
export function getWorkspacePath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

// Add toPosix method to String prototype
declare global {
  interface String {
    toPosix(): string;
  }
}

// Implement toPosix method
if (!String.prototype.toPosix) {
  String.prototype.toPosix = function(this: string): string {
    return this.replace(/\\/g, '/');
  };
}