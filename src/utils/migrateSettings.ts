import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { fileExistsAtPath } from "./fs"
import { GlobalFileNames } from "../shared/globalFileNames"
import { configSection, SETTING_KEYS } from "../../dist/thea-config"; // Import branded config helpers

/**
 * Migrates old settings files to new file names
 *
 * TODO: Remove this migration code in September 2025 (6 months after implementation)
 */
export async function migrateSettings(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	// Legacy file names that need to be migrated to the new names in GlobalFileNames
	const fileMigrations = [
		{ oldName: "cline_custom_modes.json", newName: GlobalFileNames.customModes },
		{ oldName: "cline_mcp_settings.json", newName: GlobalFileNames.mcpSettings },
	]

	try {
		const settingsDir = path.join(context.globalStorageUri.fsPath, "settings")

		// Check if settings directory exists first
		if (!(await fileExistsAtPath(settingsDir))) {
			outputChannel.appendLine("No settings directory found, no migrations necessary")
			return
		}

		// Process each file migration
		for (const migration of fileMigrations) {
			const oldPath = path.join(settingsDir, migration.oldName)
			const newPath = path.join(settingsDir, migration.newName)

			// Only migrate if old file exists and new file doesn't exist yet
			// This ensures we don't overwrite any existing new files
			const oldFileExists = await fileExistsAtPath(oldPath)
			const newFileExists = await fileExistsAtPath(newPath)

			if (oldFileExists && !newFileExists) {
				await fs.rename(oldPath, newPath)
				outputChannel.appendLine(`Renamed ${migration.oldName} to ${migration.newName}`)
			} else {
				outputChannel.appendLine(
					`Skipping migration of ${migration.oldName} to ${migration.newName}: ${oldFileExists ? "new file already exists" : "old file not found"}`,
				)
			}
		}
	} catch (error) {
		outputChannel.appendLine(`Error migrating settings files: ${error}`)
	}


	// Migrate specific setting keys
	try {
		const oldConfigSection = "thea-code"; // Hardcode old section name
		const newConfigSection = configSection(); // Use imported config section name
		const settingKeyMigration = {
			oldKey: "showRooIgnoredFiles",
			newKey: SETTING_KEYS.SHOW_IGNORED_FILES, // Use imported constant
		};

		const config = vscode.workspace.getConfiguration(oldConfigSection);
		const oldValue = config.inspect<boolean>(settingKeyMigration.oldKey)?.globalValue;

		if (oldValue !== undefined) {
			outputChannel.appendLine(`Migrating setting ${oldConfigSection}.${settingKeyMigration.oldKey} to ${newConfigSection}.${settingKeyMigration.newKey}`);
			// Update the new setting
			await vscode.workspace.getConfiguration(newConfigSection).update(
				settingKeyMigration.newKey,
				oldValue,
				vscode.ConfigurationTarget.Global
			);
			// Remove the old setting
			await vscode.workspace.getConfiguration(oldConfigSection).update(
				settingKeyMigration.oldKey,
				undefined, // Setting to undefined removes it
				vscode.ConfigurationTarget.Global
			);
		} else {
			outputChannel.appendLine(`No old setting found for ${oldConfigSection}.${settingKeyMigration.oldKey}, skipping migration.`);
		}


	// Migrate global state keys
	try {
		const oldStateKey = "showRooIgnoredFiles"; // Hardcode old state key
		const newStateKey = SETTING_KEYS.SHOW_IGNORED_FILES; // Use imported constant

		const oldValue = context.globalState.get<boolean>(oldStateKey);

		if (oldValue !== undefined) {
			outputChannel.appendLine(`Migrating global state key ${oldStateKey} to ${newStateKey}`);
			// Update the new state key
			await context.globalState.update(newStateKey, oldValue);
			// Remove the old state key
			await context.globalState.update(oldStateKey, undefined);
		} else {
			outputChannel.appendLine(`No old global state value found for ${oldStateKey}, skipping migration.`);
		}
	} catch (error) {
		outputChannel.appendLine(`Error migrating global state keys: ${error}`);
	}
	} catch (error) {
		outputChannel.appendLine(`Error migrating setting keys: ${error}`);
	}
}
