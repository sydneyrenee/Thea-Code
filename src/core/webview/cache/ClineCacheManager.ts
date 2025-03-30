// Extracted from src/core/webview/ClineProvider-original.ts

import * as path from 'path'
import * as vscode from 'vscode'
import fs from 'fs/promises'
import { fileExistsAtPath } from '../../../utils/fs'
import { GlobalFileNames } from '../../../shared/globalFileNames'
import { ModelInfo } from '../../../shared/api'
import { EXTENSION_NAME } from '../../../../dist/thea-config'

/**
 * Manages disk cache operations for the Cline provider
 */
export class ClineCacheManager {
    constructor(
        private readonly context: vscode.ExtensionContext
    ) {}

    /**
     * Ensures the cache directory exists
     */
    async ensureCacheDirectoryExists(): Promise<string> {
        const { getCacheDirectoryPath } = await import("../../../shared/storagePathManager")
        const globalStoragePath = this.context.globalStorageUri.fsPath
        const cacheDir = await getCacheDirectoryPath(globalStoragePath)
        
        try {
            await fs.mkdir(cacheDir, { recursive: true })
        } catch (error) {
            console.error(`Failed to create cache directory: ${error}`)
        }
        
        return cacheDir
    }

    /**
     * Ensures the settings directory exists
     */
    async ensureSettingsDirectoryExists(): Promise<string> {
        const { getSettingsDirectoryPath } = await import("../../../shared/storagePathManager")
        const globalStoragePath = this.context.globalStorageUri.fsPath
        const settingsDir = await getSettingsDirectoryPath(globalStoragePath)
        
        try {
            await fs.mkdir(settingsDir, { recursive: true })
        } catch (error) {
            console.error(`Failed to create settings directory: ${error}`)
        }
        
        return settingsDir
    }
    
    /**
     * Reads model data from the cache
     */
    async readModelsFromCache(filename: string): Promise<Record<string, ModelInfo> | undefined> {
        const cacheDir = await this.ensureCacheDirectoryExists()
        const filePath = path.join(cacheDir, filename)
        const fileExists = await fileExistsAtPath(filePath)

        if (fileExists) {
            try {
                const fileContents = await fs.readFile(filePath, 'utf8')
                return JSON.parse(fileContents)
            } catch (error) {
                console.error(`Error reading models from cache: ${error}`)
            }
        }

        return undefined
    }

    /**
     * Writes model data to the cache
     */
    async writeModelsToCache(filename: string, data: Record<string, ModelInfo>): Promise<void> {
        const cacheDir = await this.ensureCacheDirectoryExists()
        const filePath = path.join(cacheDir, filename)
        
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2))
        } catch (error) {
            console.error(`Error writing models to cache: ${error}`)
        }
    }

    /**
     * Clears the cache directory
     */
    async clearCache(): Promise<void> {
        const cacheDir = await this.ensureCacheDirectoryExists()
        
        try {
            const files = await fs.readdir(cacheDir)
            await Promise.all(
                files.map(file => fs.unlink(path.join(cacheDir, file)))
            )
        } catch (error) {
            console.error(`Error clearing cache: ${error}`)
        }
    }
}
