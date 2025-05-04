import * as path from 'path';
import * as vscode from 'vscode';
import fs from 'fs/promises';

import { fileExistsAtPath } from '../../../utils/fs'; // Adjusted path
import { ModelInfo } from '../../../shared/api'; // Adjusted path
// Assuming storagePathManager is used similarly
// import { getCacheDirectoryPath, getSettingsDirectoryPath } from '../../../shared/storagePathManager'; // Adjusted path - dynamic import used below

/**
 * Manages disk cache operations, primarily for API model information.
 */
export class TheaCacheManager { // Renamed class

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {}

    /**
     * Ensures the cache directory exists and returns its path.
     * Creates the directory if it doesn't exist.
     */
    async ensureCacheDirectoryExists(): Promise<string> {
        // Use dynamic import as in the original code
        const { getCacheDirectoryPath } = await import("../../../shared/storagePathManager"); // Adjusted path
        const globalStoragePath = this.context.globalStorageUri.fsPath;
        const cacheDir = await getCacheDirectoryPath(globalStoragePath);

        try {
            await fs.mkdir(cacheDir, { recursive: true });
        } catch (error) {
            console.error(`Failed to create cache directory ${cacheDir}: ${error}`);
            // Consider re-throwing or returning a default path if critical
        }
        return cacheDir;
    }

    /**
     * Ensures the settings directory exists and returns its path.
     * Creates the directory if it doesn't exist.
     */
    async ensureSettingsDirectoryExists(): Promise<string> {
        // Use dynamic import as in the original code
        const { getSettingsDirectoryPath } = await import("../../../shared/storagePathManager"); // Adjusted path
        const globalStoragePath = this.context.globalStorageUri.fsPath;
        const settingsDir = await getSettingsDirectoryPath(globalStoragePath);

        try {
            await fs.mkdir(settingsDir, { recursive: true });
        } catch (error) {
            console.error(`Failed to create settings directory ${settingsDir}: ${error}`);
            // Consider re-throwing or returning a default path if critical
        }
        return settingsDir;
    }

    /**
     * Reads and parses model data from a file in the cache directory.
     * Returns undefined if the file doesn't exist or reading/parsing fails.
     */
    async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined> {
        try {
            const cacheDir = await this.ensureCacheDirectoryExists();
            const filePath = path.join(cacheDir, filename);
            const fileExists = await fileExistsAtPath(filePath);

            if (fileExists) {
                const fileContents = await fs.readFile(filePath, 'utf8');
                return JSON.parse(fileContents);
            }
        } catch (error) {
             console.error(`Error reading models from cache file ${filename}: ${error}`);
        }
        return undefined;
    }

     /**
     * Writes model data as JSON to a specified file in the cache directory.
     */
    async writeModelsToCache(filename: string, data: Record<string, ModelInfo>): Promise<void> {
        try {
            const cacheDir = await this.ensureCacheDirectoryExists();
            const filePath = path.join(cacheDir, filename);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2)); // Pretty print JSON
        } catch (error) {
            console.error(`Error writing models to cache file ${filename}: ${error}`);
            // Consider re-throwing if write failure is critical
        }
    }

    /**
     * Clears the cache directory by deleting all files within it.
     * Logs errors if deletion fails.
     */
    async clearCache(): Promise<void> {
        let cacheDir: string | undefined;
        try {
            cacheDir = await this.ensureCacheDirectoryExists(); // Ensure it exists first
            const files = await fs.readdir(cacheDir);
            await Promise.all(
                files.map(file => {
                    const filePath = path.join(cacheDir!, file);
                    console.log(`Deleting cache file: ${filePath}`); // Optional: log deletion
                    return fs.unlink(filePath);
                })
            );
             console.log(`Cache directory ${cacheDir} cleared.`);
        } catch (error) {
            console.error(`Error clearing cache directory ${cacheDir ?? 'N/A'}: ${error}`);
        }
    }
}