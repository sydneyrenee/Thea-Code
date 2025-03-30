import * as vscode from "vscode";
import { EditorUtils } from "./EditorUtils";
// TODO: Update this path if the generated file is elsewhere relative to src/core
import { EXTENSION_DISPLAY_NAME, COMMANDS as ConfigCommands, EXTENSION_NAME } from "../../dist/thea-config"; // Import from generated config, alias COMMANDS

// Use EXTENSION_DISPLAY_NAME for user-facing action names
export const ACTION_NAMES = {
	EXPLAIN: `${EXTENSION_DISPLAY_NAME}: Explain Code`,
	FIX: `${EXTENSION_DISPLAY_NAME}: Fix Code`,
	FIX_LOGIC: `${EXTENSION_DISPLAY_NAME}: Fix Logic`,
	IMPROVE: `${EXTENSION_DISPLAY_NAME}: Improve Code`,
	ADD_TO_CONTEXT: `${EXTENSION_DISPLAY_NAME}: Add to Context`,
	NEW_TASK: `${EXTENSION_DISPLAY_NAME}: New Task`, // Added based on original structure
} as const;

// Use COMMANDS constants from the generated config for command IDs
export const COMMAND_IDS = {
	EXPLAIN: ConfigCommands.EXPLAIN_CODE,
	FIX: ConfigCommands.FIX_CODE,
	IMPROVE: ConfigCommands.IMPROVE_CODE,
	ADD_TO_CONTEXT: ConfigCommands.ADD_TO_CONTEXT,
	// Assuming NEW_TASK corresponds to a command defined in the generated config, e.g., ConfigCommands.NEW_TASK
	// If not, this needs adjustment or removal. Let's assume it exists for now based on original structure.
	NEW_TASK: ConfigCommands.NEW_TASK ?? `${EXTENSION_NAME}.newTask`, // Fallback if not explicitly defined
} as const;

export class CodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix,
		vscode.CodeActionKind.RefactorRewrite,
	];

	private createAction(title: string, kind: vscode.CodeActionKind, command: string, args: any[]): vscode.CodeAction {
		const action = new vscode.CodeAction(title, kind);
		action.command = { command, title, arguments: args };
		return action;
	}

	private createActionPair(
		baseTitle: string,
		kind: vscode.CodeActionKind,
		baseCommand: string,
		args: any[],
	): vscode.CodeAction[] {
		// Ensure the 'InCurrentTask' variant also uses the correct base command ID structure
		// Assuming the InCurrentTask variant command ID is consistently named
		const currentTaskCommand = baseCommand.endsWith("InCurrentTask") ? baseCommand : `${baseCommand}InCurrentTask`;
		return [
			this.createAction(`${baseTitle} in New Task`, kind, baseCommand, args),
			this.createAction(`${baseTitle} in Current Task`, kind, currentTaskCommand, args),
		];
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		try {
			const effectiveRange = EditorUtils.getEffectiveRange(document, range);
			if (!effectiveRange) {
				return [];
			}

			const filePath = EditorUtils.getFilePath(document);
			const actions: vscode.CodeAction[] = [];

			// Use updated ACTION_NAMES and COMMAND_IDS
			actions.push(
				...this.createActionPair(ACTION_NAMES.EXPLAIN, vscode.CodeActionKind.QuickFix, COMMAND_IDS.EXPLAIN, [
					filePath,
					effectiveRange.text,
				]),
			);

			if (context.diagnostics.length > 0) {
				const relevantDiagnostics = context.diagnostics.filter((d) =>
					EditorUtils.hasIntersectingRange(effectiveRange.range, d.range),
				);

				if (relevantDiagnostics.length > 0) {
					const diagnosticMessages = relevantDiagnostics.map(EditorUtils.createDiagnosticData);
					actions.push(
						...this.createActionPair(ACTION_NAMES.FIX, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [
							filePath,
							effectiveRange.text,
							diagnosticMessages,
						]),
					);
				}
			} else {
				// Note: This still uses COMMAND_IDS.FIX for the Fix Logic action pair
				actions.push(
					...this.createActionPair(ACTION_NAMES.FIX_LOGIC, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [ 
						filePath,
						effectiveRange.text,
					]),
				);
			}

			actions.push(
				...this.createActionPair(
					ACTION_NAMES.IMPROVE,
					vscode.CodeActionKind.RefactorRewrite,
					COMMAND_IDS.IMPROVE,
					[filePath, effectiveRange.text],
				),
			);

			actions.push(
				this.createAction(
					ACTION_NAMES.ADD_TO_CONTEXT,
					vscode.CodeActionKind.QuickFix, // Kept original value
					COMMAND_IDS.ADD_TO_CONTEXT,
					[filePath, effectiveRange.text],
				),
			);

			return actions;
		} catch (error) {
			console.error("Error providing code actions:", error);
			return [];
		}
	}
}
