import { loadRuleFiles, addCustomInstructions } from "../custom-instructions"
import fs from "fs/promises"

// Mock fs/promises
jest.mock("fs/promises")
const mockedFs = jest.mocked(fs)

describe("loadRuleFiles", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("should read and trim file content", async () => {
		mockedFs.readFile.mockResolvedValue("  content with spaces  ")
		const result = await loadRuleFiles("/fake/path")
		expect(mockedFs.readFile).toHaveBeenCalled()
		expect(result).toBe(
			"\n# Rules from .Thearules:\ncontent with spaces\n" +
				"\n# Rules from .cursorrules:\ncontent with spaces\n" +
				"\n# Rules from .windsurfrules:\ncontent with spaces\n",
		)
	})

	it("should handle ENOENT error", async () => {
		mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })
		const result = await loadRuleFiles("/fake/path")
		expect(result).toBe("")
	})

	it("should handle EISDIR error", async () => {
		mockedFs.readFile.mockRejectedValue({ code: "EISDIR" })
		const result = await loadRuleFiles("/fake/path")
		expect(result).toBe("")
	})

	it("should combine content from multiple rule files when they exist", async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mockedFs.readFile.mockImplementation((filePath: any) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (filePath.toString().endsWith(".Thearules")) {
				return Promise.resolve("cline rules content")
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (filePath.toString().endsWith(".cursorrules")) {
				return Promise.resolve("cursor rules content")
			}
			return Promise.reject(new Error("ENOENT"))
		})

		const result = await loadRuleFiles("/fake/path")
		expect(result).toBe(
			"\n# Rules from .Thearules:\ncline rules content\n" +
				"\n# Rules from .cursorrules:\ncursor rules content\n",
		)
	})

	it("should handle when no rule files exist", async () => {
		mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })

		const result = await loadRuleFiles("/fake/path")
		expect(result).toBe("")
	})

	it("should throw on unexpected errors", async () => {
		const error = new Error("Permission denied") as NodeJS.ErrnoException
		error.code = "EPERM"
		mockedFs.readFile.mockRejectedValue(error)

		await expect(async () => {
			await loadRuleFiles("/fake/path")
		}).rejects.toThrow()
	})

	it("should skip directories with same name as rule files", async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mockedFs.readFile.mockImplementation((filePath: any) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (filePath.toString().endsWith(".Thearules")) {
				const error = new Error("Directory error") as Error & { code: string }
				error.code = "EISDIR"
				return Promise.reject(error)
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (filePath.toString().endsWith(".cursorrules")) {
				return Promise.resolve("cursor rules content")
			}
			const error = new Error("File not found") as Error & { code: string }
			error.code = "ENOENT"
			return Promise.reject(error)
		})

		const result = await loadRuleFiles("/fake/path")
		expect(result).toBe("\n# Rules from .cursorrules:\ncursor rules content\n")
	})
})

describe("addCustomInstructions", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("should combine all instruction types when provided", async () => {
		mockedFs.readFile.mockResolvedValue("mode specific rules")

		const result = await addCustomInstructions(
			"mode instructions",
			"global instructions",
			"/fake/path",
			"test-mode",
			{ language: "es" },
		)

		expect(result).toContain("Language Preference:")
		expect(result).toContain("Español") // Check for language name
		expect(result).toContain("(es)") // Check for language code in parentheses
		expect(result).toContain("Global Instructions:\nglobal instructions")
		expect(result).toContain("Mode-specific Instructions:\nmode instructions")
		expect(result).toContain("Rules from .Thearules-test-mode:\nmode specific rules")
	})

	it("should return empty string when no instructions provided", async () => {
		mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })

		const result = await addCustomInstructions("", "", "/fake/path", "", {})
		expect(result).toBe("")
	})

	it("should handle missing mode-specific rules file", async () => {
		mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })

		const result = await addCustomInstructions(
			"mode instructions",
			"global instructions",
			"/fake/path",
			"test-mode",
		)

		expect(result).toContain("Global Instructions:")
		expect(result).toContain("Mode-specific Instructions:")
		expect(result).not.toContain("Rules from .Thearules-test-mode")
	})

	it("should handle unknown language codes properly", async () => {
		mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })

		const result = await addCustomInstructions(
			"mode instructions",
			"global instructions",
			"/fake/path",
			"test-mode",
			{ language: "xyz" }, // Unknown language code
		)

		expect(result).toContain("Language Preference:")
		expect(result).toContain('"xyz" (xyz) language') // For unknown codes, the code is used as the name too
		expect(result).toContain("Global Instructions:\nglobal instructions")
	})

	it("should throw on unexpected errors", async () => {
		const error = new Error("Permission denied") as NodeJS.ErrnoException
		error.code = "EPERM"
		mockedFs.readFile.mockRejectedValue(error)

		await expect(async () => {
			await addCustomInstructions("", "", "/fake/path", "test-mode")
		}).rejects.toThrow()
	})

	it("should skip mode-specific rule files that are directories", async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mockedFs.readFile.mockImplementation((filePath: any) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (filePath.toString().includes(".Thearules-test-mode")) {
				const error = new Error("Directory error") as Error & { code: string }
				error.code = "EISDIR"
				return Promise.reject(error)
			}
			const error = new Error("File not found") as Error & { code: string }
			error.code = "ENOENT"
			return Promise.reject(error)
		})

		const result = await addCustomInstructions(
			"mode instructions",
			"global instructions",
			"/fake/path",
			"test-mode",
		)

		expect(result).toContain("Global Instructions:\nglobal instructions")
		expect(result).toContain("Mode-specific Instructions:\nmode instructions")
		expect(result).not.toContain("Rules from .Thearules-test-mode")
	})
})
