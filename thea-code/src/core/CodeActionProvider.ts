import * as vscode from 'vscode';

/**
 * Action names for code actions.
 */
export const ACTION_NAMES = {
  EXPLAIN: 'Explain',
  FIX: 'Fix',
  DOCUMENT: 'Document',
  REFACTOR: 'Refactor',
  OPTIMIZE: 'Optimize',
  TEST: 'Test',
  IMPLEMENT: 'Implement',
};

/**
 * Provides code actions for the Thea Code extension.
 * This is a simplified version of the original implementation.
 */
export class CodeActionProvider implements vscode.CodeActionProvider {
  /**
   * The kinds of code actions provided by this provider.
   */
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  /**
   * Provides code actions for the given document and range.
   * 
   * @param document The document in which the command was invoked
   * @param range The range for which the command was invoked
   * @param context Context carrying additional information
   * @param token A cancellation token
   * @returns An array of code actions or a thenable that resolves to such
   */
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    // In the full implementation, this would provide code actions
    const actions: vscode.CodeAction[] = [];
    
    // Add a simple code action for each action name
    for (const [key, title] of Object.entries(ACTION_NAMES)) {
      const action = new vscode.CodeAction(`${title} with Thea`, vscode.CodeActionKind.QuickFix);
      action.command = {
        title: `${title} with Thea`,
        command: `thea-code.${key.toLowerCase()}`,
        arguments: [{ document, range }]
      };
      actions.push(action);
    }
    
    return actions;
  }
}