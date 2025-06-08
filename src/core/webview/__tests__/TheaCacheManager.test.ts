import * as vscode from "vscode"
import * as path from "path"
import fs from "fs/promises"
import { TheaCacheManager } from "../cache/TheaCacheManager" // Updated import
import { fileExistsAtPath } from "../../../utils/fs"
import { ModelInfo } from "../../../shared/api"

// Mock dependencies
jest.mock("vscode")
jest.mock("fs/promises")
jest.mock("../../../utils/fs")
jest.mock("../../../shared/storagePathManager", () => {
	return {
                getCacheDirectoryPath: jest.fn().mockImplementation((storagePath) => {
			return path.join(storagePath, "cache")
		}),
                getSettingsDirectoryPath: jest.fn().mockImplementation((storagePath) => {
			return path.join(storagePath, "settings")
		}),
	}
})

describe("TheaCacheManager", () => {
	// Updated describe block
	let cacheManager: TheaCacheManager // Updated type
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Mock context
		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalStorageUri: {
				fsPath: "/test/storage/path",
			},
		} as unknown as vscode.ExtensionContext

		// Create instance of TheaCacheManager
		cacheManager = new TheaCacheManager(mockContext) // Updated instantiation

		// Mock console.error to prevent test output noise
		jest.spyOn(console, "error").mockImplementation(() => {})
		jest.spyOn(console, "log").mockImplementation(() => {})

		// Mock fs.readdir
		;(fs.readdir as jest.Mock) = jest.fn()
	})

	afterEach(() => {
		// Restore console.error mock
		jest.restoreAllMocks()
	})

	test("ensureCacheDirectoryExists creates and returns cache directory path", async () => {
		// Setup
		const expectedCachePath = path.join("/test/storage/path", "cache")

		// Execute
		const result = await cacheManager.ensureCacheDirectoryExists()

		// Verify
		expect(fs.mkdir).toHaveBeenCalledWith(expectedCachePath, { recursive: true })
		expect(result).toBe(expectedCachePath)
	})

	test("ensureCacheDirectoryExists handles errors gracefully", async () => {
		// Setup
		const expectedCachePath = path.join("/test/storage/path", "cache")
		const mockError = new Error("Directory creation failed")
		;(fs.mkdir as jest.Mock).mockRejectedValue(mockError)

		// Execute
		const result = await cacheManager.ensureCacheDirectoryExists()

		// Verify
		expect(fs.mkdir).toHaveBeenCalledWith(expectedCachePath, { recursive: true })
		expect(console.error).toHaveBeenCalled()
		expect(result).toBe(expectedCachePath)
	})

	test("ensureSettingsDirectoryExists creates and returns settings directory path", async () => {
		// Setup
		const expectedSettingsPath = path.join("/test/storage/path", "settings")

		// Execute
		const result = await cacheManager.ensureSettingsDirectoryExists()

		// Verify
		expect(fs.mkdir).toHaveBeenCalledWith(expectedSettingsPath, { recursive: true })
		expect(result).toBe(expectedSettingsPath)
	})

	test("ensureSettingsDirectoryExists handles errors gracefully", async () => {
		// Setup
		const expectedSettingsPath = path.join("/test/storage/path", "settings")
		const mockError = new Error("Directory creation failed")
		;(fs.mkdir as jest.Mock).mockRejectedValue(mockError)

		// Execute
		const result = await cacheManager.ensureSettingsDirectoryExists()

		// Verify
		expect(fs.mkdir).toHaveBeenCalledWith(expectedSettingsPath, { recursive: true })
		expect(console.error).toHaveBeenCalled()
		expect(result).toBe(expectedSettingsPath)
	})

	test("readModelsFromCache reads and parses file content", async () => {
		// Setup
		const expectedCachePath = path.join("/test/storage/path", "cache")
		const filename = "models.json"
		const expectedFilePath = path.join(expectedCachePath, filename)
		const mockModelData: Record<string, ModelInfo> = {
			"model-1": {
				contextWindow: 4000,
				supportsPromptCache: true,
				maxTokens: 1000,
			},
		}

		;(fileExistsAtPath as jest.Mock).mockResolvedValue(true)
		;(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockModelData))

		// Execute
		const result = await cacheManager.readModelsFromCache(filename)

		// Verify
		expect(fileExistsAtPath).toHaveBeenCalledWith(expectedFilePath)
		expect(fs.readFile).toHaveBeenCalledWith(expectedFilePath, "utf8")
		expect(result).toEqual(mockModelData)
	})

	test("readModelsFromCache returns undefined if file doesn't exist", async () => {
		// Setup
		const filename = "non-existent.json"
		;(fileExistsAtPath as jest.Mock).mockResolvedValue(false)

		// Execute
		const result = await cacheManager.readModelsFromCache(filename)

		// Verify
		expect(result).toBeUndefined()
		expect(fs.readFile).not.toHaveBeenCalled()
	})

	test("readModelsFromCache handles read/parse errors gracefully", async () => {
		// Setup
		const filename = "corrupt.json"
		;(fileExistsAtPath as jest.Mock).mockResolvedValue(true)
		;(fs.readFile as jest.Mock).mockRejectedValue(new Error("Read error"))

		// Execute
		const result = await cacheManager.readModelsFromCache(filename)

		// Verify
		expect(result).toBeUndefined()
		expect(console.error).toHaveBeenCalled()
	})

	test("writeModelsToCache writes model data to file", async () => {
		// Setup
		const expectedCachePath = path.join("/test/storage/path", "cache")
		const filename = "models.json"
		const expectedFilePath = path.join(expectedCachePath, filename)
		const mockModelData: Record<string, ModelInfo> = {
			"model-1": {
				contextWindow: 4000,
				supportsPromptCache: true,
				maxTokens: 1000,
			},
		}

		// Execute
		await cacheManager.writeModelsToCache(filename, mockModelData)

		// Verify
		expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, JSON.stringify(mockModelData, null, 2))
	})

	test("writeModelsToCache handles write errors gracefully", async () => {
		// Setup
		const filename = "error.json"
		const mockModelData: Record<string, ModelInfo> = {
			"model-1": {
				contextWindow: 4000,
				supportsPromptCache: true,
				maxTokens: 1000,
			},
		}
		const mockError = new Error("Write error")
		;(fs.writeFile as jest.Mock).mockRejectedValue(mockError)

		// Execute
		await cacheManager.writeModelsToCache(filename, mockModelData)

		// Verify
		expect(console.error).toHaveBeenCalled()
	})

	test("clearCache deletes all files in cache directory", async () => {
		// Setup
		const expectedCachePath = path.join("/test/storage/path", "cache")
		const mockFiles = ["file1.json", "file2.json"]
		;(fs.readdir as jest.Mock).mockResolvedValue(mockFiles)
		;(fs.unlink as jest.Mock) = jest.fn().mockResolvedValue(undefined)

		// Execute
		await cacheManager.clearCache()

		// Verify
		expect(fs.readdir).toHaveBeenCalledWith(expectedCachePath)
		expect(fs.unlink).toHaveBeenCalledTimes(2)
		expect(fs.unlink).toHaveBeenCalledWith(path.join(expectedCachePath, "file1.json"))
		expect(fs.unlink).toHaveBeenCalledWith(path.join(expectedCachePath, "file2.json"))
	})

	test("clearCache handles errors gracefully", async () => {
		// Setup
		const mockError = new Error("Read directory error")
		;(fs.readdir as jest.Mock).mockRejectedValue(mockError)

		// Execute
		await cacheManager.clearCache()

		// Verify
		expect(console.error).toHaveBeenCalled()
	})
})
