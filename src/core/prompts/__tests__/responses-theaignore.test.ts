// npx jest src/core/prompts/__tests__/responses-theignore.test.ts

import { formatResponse } from "../responses"
import { TheaIgnoreController, LOCK_TEXT_SYMBOL } from "../../ignore/TheaIgnoreController" // Keep original path, use renamed class
import { fileExistsAtPath } from "../../../utils/fs"
import { GLOBAL_FILENAMES } from "../../../../dist/thea-config" // Import branded constant
import * as fs from "fs/promises"
import { toPosix } from "./utils"

// Mock dependencies
jest.mock("../../../utils/fs")
jest.mock("fs/promises")
jest.mock("vscode", () => {
	const mockDisposable = { dispose: jest.fn() }
	return {
		workspace: {
			createFileSystemWatcher: jest.fn(() => ({
				onDidCreate: jest.fn(() => mockDisposable),
				onDidChange: jest.fn(() => mockDisposable),
				onDidDelete: jest.fn(() => mockDisposable),
				dispose: jest.fn(),
			})),
		},
		RelativePattern: jest.fn(),
	}
})

describe("TheaIgnore Response Formatting", () => {
	const TEST_CWD = "/test/path"
	let mockFileExists: jest.MockedFunction<typeof fileExistsAtPath>
	let mockReadFile: jest.MockedFunction<typeof fs.readFile>

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Setup fs mocks
		mockFileExists = fileExistsAtPath as jest.MockedFunction<typeof fileExistsAtPath>
		mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>

		// Default mock implementations
		mockFileExists.mockResolvedValue(true)
		mockReadFile.mockResolvedValue("node_modules\n.git\nsecrets/**\n*.log")
	})

	describe("formatResponse.theaIgnoreError", () => {
		/**
		 * Tests the error message format for ignored files
		 */
		it("should format error message for ignored files", () => {
			const errorMessage = formatResponse.theaIgnoreError("secrets/api-keys.json")

			// Verify error message format
			expect(errorMessage).toContain(
				`Access to secrets/api-keys.json is blocked by the ${GLOBAL_FILENAMES.IGNORE_FILENAME} file settings`,
			)
			expect(errorMessage).toContain("continue in the task without using this file")
			expect(errorMessage).toContain(`ask the user to update the ${GLOBAL_FILENAMES.IGNORE_FILENAME} file`)
		})

		/**
		 * Tests with different file paths
		 */
		it("should include the file path in the error message", () => {
			const paths = ["node_modules/package.json", ".git/HEAD", "secrets/credentials.env", "logs/app.log"]

			// Test each path
			for (const testPath of paths) {
				const errorMessage = formatResponse.theaIgnoreError(testPath)
				expect(errorMessage).toContain(`Access to ${testPath} is blocked`)
			}
		})
	})

	describe("formatResponse.formatFilesList with TheaIgnoreController", () => {
		/**
		 * Tests file listing with theaignore controller
		 */
		it("should format files list with lock symbols for ignored files", async () => {
			// Create controller
			const controller = new TheaIgnoreController(TEST_CWD) // Use renamed class
			await controller.initialize()

			// Mock validateAccess to control which files are ignored
			controller.validateAccess = jest.fn().mockImplementation((filePath: string) => {
				// Only allow files not matching these patterns
				return (
					!filePath.includes("node_modules") &&
					!filePath.includes(".git") &&
					!toPosix(filePath).includes("secrets/")
				)
			})

			// Files list with mixed allowed/ignored files
			const files = [
				"src/app.ts", // allowed
				"node_modules/package.json", // ignored
				"README.md", // allowed
				".git/HEAD", // ignored
				"secrets/keys.json", // ignored
			]

			// Format with controller
			const result = formatResponse.formatFilesList(
				TEST_CWD,
				files,
				false,
				controller as any,
				true,
			)

			// Should contain each file
			expect(result).toContain("src/app.ts")
			expect(result).toContain("README.md")

			// Should contain lock symbols for ignored files - case insensitive check using regex
			expect(result).toMatch(new RegExp(`${LOCK_TEXT_SYMBOL}.*node_modules/package.json`, "i"))
			expect(result).toMatch(new RegExp(`${LOCK_TEXT_SYMBOL}.*\\.git/HEAD`, "i"))
			expect(result).toMatch(new RegExp(`${LOCK_TEXT_SYMBOL}.*secrets/keys.json`, "i"))

			// No lock symbols for allowed files
			expect(result).not.toContain(`${LOCK_TEXT_SYMBOL} src/app.ts`)
			expect(result).not.toContain(`${LOCK_TEXT_SYMBOL} README.md`)
		})

		/**
		 * Tests formatFilesList when showTheaIgnoredFiles is set to false
		 */
		it("should hide ignored files when showTheaIgnoredFiles is false", async () => {
			// Create controller
			const controller = new TheaIgnoreController(TEST_CWD) // Use renamed class
			await controller.initialize()

			// Mock validateAccess to control which files are ignored
			controller.validateAccess = jest.fn().mockImplementation((filePath: string) => {
				// Only allow files not matching these patterns
				return (
					!filePath.includes("node_modules") &&
					!filePath.includes(".git") &&
					!toPosix(filePath).includes("secrets/")
				)
			})

			// Files list with mixed allowed/ignored files
			const files = [
				"src/app.ts", // allowed
				"node_modules/package.json", // ignored
				"README.md", // allowed
				".git/HEAD", // ignored
				"secrets/keys.json", // ignored
			]

			// Format with controller and showTheaIgnoredFiles = false
			const result = formatResponse.formatFilesList(
				TEST_CWD,
				files,
				false,
				controller as any,
				false, // showTheaIgnoredFiles = false
			)

			// Should contain allowed files
			expect(result).toContain("src/app.ts")
			expect(result).toContain("README.md")

			// Should NOT contain ignored files (even with lock symbols)
			expect(result).not.toContain("node_modules/package.json")
			expect(result).not.toContain(".git/HEAD")
			expect(result).not.toContain("secrets/keys.json")

			// Double-check with regex to ensure no form of these filenames appears
			expect(result).not.toMatch(/node_modules\/package\.json/i)
			expect(result).not.toMatch(/\.git\/HEAD/i)
			expect(result).not.toMatch(/secrets\/keys\.json/i)
		})

		/**
		 * Tests formatFilesList handles truncation correctly with TheaIgnoreController
		 */
		it("should handle truncation with TheaIgnoreController", async () => {
			// Create controller
			const controller = new TheaIgnoreController(TEST_CWD) // Use renamed class
			await controller.initialize()

			// Format with controller and truncation flag
			const result = formatResponse.formatFilesList(
				TEST_CWD,
				["file1.txt", "file2.txt"],
				true, // didHitLimit = true
				controller as any,
				true,
			)

			// Should contain truncation message (case-insensitive check)
			expect(result).toContain("File list truncated")
			expect(result).toMatch(/use list_files on specific subdirectories/i)
		})

		/**
		 * Tests formatFilesList handles empty results
		 */
		it("should handle empty file list with TheaIgnoreController", async () => {
			// Create controller
			const controller = new TheaIgnoreController(TEST_CWD) // Use renamed class
			await controller.initialize()

			// Format with empty files array
			const result = formatResponse.formatFilesList(
				TEST_CWD,
				[],
				false,
				controller as any,
				true,
			)

			// Should show "No files found"
			expect(result).toBe("No files found.")
		})
	})

	describe("getInstructions", () => {
		/**
		 * Tests the instructions format
		 */
		it("should format .theaignore instructions for the LLM", async () => {
			// Create controller
			const controller = new TheaIgnoreController(TEST_CWD) // Use renamed class
			await controller.initialize()

			// Get instructions
			const instructions = controller.getInstructions()

			// Verify format and content
			expect(instructions).toContain(`# ${GLOBAL_FILENAMES.IGNORE_FILENAME}`)
			expect(instructions).toContain(LOCK_TEXT_SYMBOL)
			expect(instructions).toContain("node_modules")
			expect(instructions).toContain(".git")
			expect(instructions).toContain("secrets/**")
			expect(instructions).toContain("*.log")

			// Should explain what the lock symbol means
			expect(instructions).toContain("you'll notice a")
			expect(instructions).toContain("next to files that are blocked")
		})

		/**
		 * Tests null/undefined case when ignore file doesn't exist
		 */
		it(`should return undefined when no ${GLOBAL_FILENAMES.IGNORE_FILENAME} exists`, async () => {
			// Set up no .theaignore
			mockFileExists.mockResolvedValue(false) // Mock file not existing

			// Create controller without .theaignore
			const controller = new TheaIgnoreController(TEST_CWD) // Use renamed class
			await controller.initialize()

			// Should return undefined
			expect(controller.getInstructions()).toBeUndefined()
		})
	})
})
