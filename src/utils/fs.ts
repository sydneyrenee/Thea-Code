import fs from "fs/promises"
import * as path from "path"

/**
 * Check if a file exists at the specified path
 * @param filepath Path to the file to check
 * @returns True if the file exists, false otherwise
 */
export async function fileExistsAtPath(filepath: string): Promise<boolean> {
    try {
        await fs.access(filepath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Asynchronously creates all non-existing subdirectories for a given file path
 * and collects them in an array for later deletion.
 *
 * @param filePath - The full path to a file.
 * @returns A promise that resolves to an array of newly created directories.
 */
export async function createDirectoriesForFile(filePath: string): Promise<string[]> {
    const newDirectories: string[] = []
    const normalizedFilePath = path.normalize(filePath) // Normalize path for cross-platform compatibility
    const directoryPath = path.dirname(normalizedFilePath)

    let currentPath = directoryPath
    const dirsToCreate: string[] = []

    // Traverse up the directory tree and collect missing directories
    while (!(await fileExistsAtPath(currentPath))) {
        dirsToCreate.push(currentPath)
        currentPath = path.dirname(currentPath)
    }

    // Create directories from the topmost missing one down to the target directory
    for (let i = dirsToCreate.length - 1; i >= 0; i--) {
        await fs.mkdir(dirsToCreate[i])
        newDirectories.push(dirsToCreate[i])
    }

    return newDirectories
}

/**
 * Creates a directory recursively if it doesn't exist
 * @param dirPath Path to create
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        console.error(`Error creating directory ${dirPath}:`, error);
        throw error;
    }
}

/**
 * Safely write a file ensuring the directory exists
 * @param filePath Path to file
 * @param content File content
 */
export async function safeWriteFile(filePath: string, content: string | Buffer): Promise<void> {
    const dirPath = path.dirname(filePath);
    await ensureDirectoryExists(dirPath);
    await fs.writeFile(filePath, content);
}
