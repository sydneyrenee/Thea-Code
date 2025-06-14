import fs from "fs"
import * as readline from "readline"
import { countFileLines } from "../line-counter"

// Mock the fs module
jest.mock("fs", () => {
	const originalModule: typeof import("fs") = jest.requireActual("fs")
	return {
		...originalModule,
		createReadStream: jest.fn(),
		promises: {
			access: jest.fn(),
		},
	} as typeof import("fs")
})

// Mock readline
jest.mock("readline", () => ({
	createInterface: jest.fn().mockReturnValue({
		on: jest.fn().mockImplementation(function (this: { mockLines?: number }, event: string, callback: () => void) {
			if (event === "line" && this.mockLines) {
				for (let i = 0; i < this.mockLines; i++) {
					callback()
				}
			}
			if (event === "close") {
				callback()
			}
			return this
		}),
		mockLines: 0,
	}),
}))

describe("countFileLines", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("should throw error if file does not exist", async () => {
		// Setup
		;(fs.promises.access as jest.Mock).mockRejectedValueOnce(new Error("File not found"))

		// Test & Assert
		await expect(countFileLines("non-existent-file.txt")).rejects.toThrow("File not found")
	})

	it("should return the correct line count for a file", async () => {
		// Setup
		;(fs.promises.access as jest.Mock).mockResolvedValueOnce(undefined)

		const mockEventEmitter = {
			on: jest.fn().mockImplementation(function (
				this: { mockLines?: number },
				event: string,
				callback: () => void,
			) {
				if (event === "line") {
					for (let i = 0; i < 10; i++) {
						callback()
					}
				}
				if (event === "close") {
					callback()
				}
				return this
			}),
		}

		const mockReadStream = {
			on: jest.fn().mockImplementation(function (this: unknown) {
				return this
			}),
		}

		;(fs.createReadStream as jest.Mock).mockReturnValueOnce(mockReadStream)
		const readlineMock = jest.mocked(readline)
		readlineMock.createInterface.mockReturnValueOnce(mockEventEmitter as unknown as readline.Interface)

		// Test
		const result = await countFileLines("test-file.txt")

		// Assert
		expect(result).toBe(10)
		expect(fs.promises.access).toHaveBeenCalledWith("test-file.txt", fs.constants.F_OK)
		expect(fs.createReadStream).toHaveBeenCalledWith("test-file.txt")
	})

	it("should handle files with no lines", async () => {
		// Setup
		;(fs.promises.access as jest.Mock).mockResolvedValueOnce(undefined)

		const mockEventEmitter = {
			on: jest.fn().mockImplementation(function (
				this: { mockLines?: number },
				event: string,
				callback: () => void,
			) {
				if (event === "close") {
					callback()
				}
				return this
			}),
		}

		const mockReadStream = {
			on: jest.fn().mockImplementation(function (this: unknown) {
				return this
			}),
		}

		;(fs.createReadStream as jest.Mock).mockReturnValueOnce(mockReadStream)
		const readlineMock = jest.mocked(readline)
		readlineMock.createInterface.mockReturnValueOnce(mockEventEmitter as unknown as readline.Interface)

		// Test
		const result = await countFileLines("empty-file.txt")

		// Assert
		expect(result).toBe(0)
	})

	it("should handle errors during reading", async () => {
		// Setup
		;(fs.promises.access as jest.Mock).mockResolvedValueOnce(undefined)

		const mockEventEmitter = {
			on: jest.fn().mockImplementation(function (
				this: { mockLines?: number },
				event: string,
				callback: (err?: Error) => void,
			) {
				if (event === "error") {
					callback(new Error("Read error"))
				}
				return this
			}),
		}

		const mockReadStream = {
			on: jest.fn().mockImplementation(function (this: unknown) {
				return this
			}),
		}

		;(fs.createReadStream as jest.Mock).mockReturnValueOnce(mockReadStream)
		const readlineMock = jest.mocked(readline)
		readlineMock.createInterface.mockReturnValueOnce(mockEventEmitter as unknown as readline.Interface)

		// Test & Assert
		await expect(countFileLines("error-file.txt")).rejects.toThrow("Read error")
	})
})
