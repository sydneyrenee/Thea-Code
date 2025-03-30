import fs from "fs/promises";
import path from "path";
import { Mode } from "../../../shared/modes";
import { fileExistsAtPath } from "../../../utils/fs";
// TODO: Update this path if the generated file is elsewhere relative to src/core/prompts/sections
import { EXTENSION_CONFIG_DIR } from "../../../../dist/thea-config"; // Import from generated config

/**
 * Safely reads a file, returning an empty string if the file doesn't exist
 */
async function safeReadFile(filePath: string): Promise<string> {
	try {
		const content = await fs.readFile(filePath, "utf-8");
		return content.trim();
	} catch (err) {
		const errorCode = (err as NodeJS.ErrnoException).code;
		if (!errorCode || !["ENOENT", "EISDIR"].includes(errorCode)) {
			throw err;
		}
		return "";
	}
}

/**
 * Get the path to a system prompt file for a specific mode
 */
export function getSystemPromptFilePath(cwd: string, mode: Mode): string {
	// Use the config directory constant
	return path.join(cwd, EXTENSION_CONFIG_DIR, `system-prompt-${mode}`);
}

/**
 * Loads custom system prompt from a file at [config-dir]/system-prompt-[mode slug]
 * If the file doesn't exist, returns an empty string
 */
export async function loadSystemPromptFile(cwd: string, mode: Mode): Promise<string> {
	const filePath = getSystemPromptFilePath(cwd, mode);
	return safeReadFile(filePath);
}

/**
 * Ensures the config directory exists, creating it if necessary
 */
// Renamed function to be more generic
export async function ensureConfigDirectory(cwd: string): Promise<void> { 
	// Use the config directory constant
	const configDir = path.join(cwd, EXTENSION_CONFIG_DIR); 

	// Check if directory already exists
	if (await fileExistsAtPath(configDir)) {
		return;
	}

	// Create the directory
	try {
		// Use the config directory constant
		await fs.mkdir(configDir, { recursive: true }); 
	} catch (err) {
		// If directory already exists (race condition), ignore the error
		const errorCode = (err as NodeJS.ErrnoException).code;
		if (errorCode !== "EEXIST") {
			throw err;
		}
	}
}
