import * as vscode from "vscode"
import * as os from "os"
import fs from "fs/promises"
import { TheaMcpManager } from "../mcp/TheaMcpManager"
import { McpHub } from "../../../services/mcp/management/McpHub"
import { EXTENSION_DISPLAY_NAME, EXTENSION_CONFIG_DIR } from "../../../../dist/thea-config"

// Mock dependencies
jest.mock("vscode")
jest.mock("os")
jest.mock("fs/promises")
jest.mock("../../../services/mcp/management/McpHub")
jest.mock("path", () => {
	const originalPath: Record<string, unknown> = jest.requireActual("path")
	return {
		...originalPath,
		// Ensure consistent path separators in tests regardless of platform
		join: (...paths: string[]) => {
			return paths.join("/")
		},
	}
})

describe("TheaMcpManager", () => {
	let mcpManager: TheaMcpManager
	let mockContext: vscode.ExtensionContext
	let mockMcpHub: jest.Mocked<McpHub>

	// Declare mock functions in outer scope to avoid unbound method issues
	let updateServerTimeoutMock: jest.Mock
	let deleteServerMock: jest.Mock
	let toggleServerDisabledMock: jest.Mock
	let restartConnectionMock: jest.Mock
	let getMcpSettingsFilePathMock: jest.Mock
	let getAllServersMock: jest.Mock

	const TEST_TEMP_DIR = "/tmp/thea-test"
	// Store original platform value
	const originalPlatform = process.platform

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Mock context
		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
		} as unknown as vscode.ExtensionContext

		// Mock os functions with temp directory
		;(os.homedir as jest.Mock).mockReturnValue(TEST_TEMP_DIR)
		;(os.tmpdir as jest.Mock).mockReturnValue(TEST_TEMP_DIR)

		// Mock fs functions
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.access as jest.Mock).mockResolvedValue(undefined)

		// Create individual mock functions to avoid unbound method issues
		updateServerTimeoutMock = jest.fn().mockResolvedValue(undefined)
		deleteServerMock = jest.fn().mockResolvedValue(undefined)
		toggleServerDisabledMock = jest.fn().mockResolvedValue(undefined)
		restartConnectionMock = jest.fn().mockResolvedValue(undefined)
		getMcpSettingsFilePathMock = jest.fn().mockResolvedValue(`${TEST_TEMP_DIR}/mcp/settings.json`)
		getAllServersMock = jest.fn().mockReturnValue([{ name: "server1", host: "localhost", port: 8000 }])

		mockMcpHub = {
			updateServerTimeout: updateServerTimeoutMock,
			deleteServer: deleteServerMock,
			toggleServerDisabled: toggleServerDisabledMock,
			restartConnection: restartConnectionMock,
			getMcpSettingsFilePath: getMcpSettingsFilePathMock,
			getAllServers: getAllServersMock,
		} as unknown as jest.Mocked<McpHub>

		// Create instance of ClineMcpManager
		mcpManager = new TheaMcpManager(mockContext)

		// Mock console to prevent test output noise
		jest.spyOn(console, "log").mockImplementation(() => {})
		jest.spyOn(console, "warn").mockImplementation(() => {})
		jest.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		jest.restoreAllMocks()
		// Restore original process.platform
		Object.defineProperty(process, "platform", { value: originalPlatform })
	})

	test("setMcpHub sets the hub instance", () => {
		// Execute
		mcpManager.setMcpHub(mockMcpHub)

		// Verify
		expect(mcpManager.getMcpHub()).toBe(mockMcpHub)
	})

	test("getMcpHub returns undefined when not set", () => {
		// Execute & Verify
		expect(mcpManager.getMcpHub()).toBeUndefined()
	})

	describe("ensureMcpServersDirectoryExists", () => {
		test("creates and returns correct directory path on macOS", async () => {
			// Setup - override process.platform
			Object.defineProperty(process, "platform", { value: "darwin" })

			// Execute
			const result = await mcpManager.ensureMcpServersDirectoryExists()

			// Verify
			const expectedPath = `${TEST_TEMP_DIR}/Documents/${EXTENSION_DISPLAY_NAME}/MCP`
			expect(result).toBe(expectedPath)
			expect(fs.mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true })
		})

		test("creates and returns correct directory path on Windows", async () => {
			// Setup - override process.platform
			Object.defineProperty(process, "platform", { value: "win32" })

			// Execute
			const result = await mcpManager.ensureMcpServersDirectoryExists()

			// Verify
			const expectedPath = `${TEST_TEMP_DIR}/AppData/Roaming/${EXTENSION_DISPLAY_NAME}/MCP`
			expect(result).toBe(expectedPath)
			expect(fs.mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true })
		})

		test("creates and returns correct directory path on Linux", async () => {
			// Setup - override process.platform
			Object.defineProperty(process, "platform", { value: "linux" })

			// Execute
			const result = await mcpManager.ensureMcpServersDirectoryExists()

			// Verify
			const expectedPath = `${TEST_TEMP_DIR}/.local/share/${EXTENSION_DISPLAY_NAME}/MCP`
			expect(result).toBe(expectedPath)
			expect(fs.mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true })
		})

		test("falls back to alternate path when directory creation fails", async () => {
			// Setup - use macOS for this test
			Object.defineProperty(process, "platform", { value: "darwin" })
			;(fs.mkdir as jest.Mock).mockRejectedValue(new Error("Permission denied"))

			// Execute
			const result = await mcpManager.ensureMcpServersDirectoryExists()

			// Verify
			const expectedPath = `${TEST_TEMP_DIR}/${EXTENSION_CONFIG_DIR}/mcp`
			expect(result).toBe(expectedPath)
			expect(console.error).toHaveBeenCalled()
		})
	})

	describe("McpHub delegation methods", () => {
		beforeEach(() => {
			// Set the McpHub for all delegation tests
			mcpManager.setMcpHub(mockMcpHub)
		})

		test("updateServerTimeout delegates to McpHub", async () => {
			// Execute
			await mcpManager.updateServerTimeout("server1", 60000)

			// Verify
			expect(updateServerTimeoutMock).toHaveBeenCalledWith("server1", 60000)
		})

		test("deleteServer delegates to McpHub", async () => {
			// Execute
			await mcpManager.deleteServer("server1")

			// Verify
			expect(deleteServerMock).toHaveBeenCalledWith("server1")
		})

		test("toggleServerDisabled delegates to McpHub", async () => {
			// Execute
			await mcpManager.toggleServerDisabled("server1", true)

			// Verify
			expect(toggleServerDisabledMock).toHaveBeenCalledWith("server1", true)
		})

		test("restartConnection delegates to McpHub", async () => {
			// Execute
			await mcpManager.restartConnection("server1")

			// Verify
			expect(restartConnectionMock).toHaveBeenCalledWith("server1")
		})

		test("getMcpSettingsFilePath delegates to McpHub", async () => {
			// Execute
			const result = await mcpManager.getMcpSettingsFilePath()

			// Verify
			expect(getMcpSettingsFilePathMock).toHaveBeenCalled()
			expect(result).toBe(`${TEST_TEMP_DIR}/mcp/settings.json`)
		})

		test("getAllServers delegates to McpHub", () => {
			// Execute
			const result = mcpManager.getAllServers()

			// Verify
			expect(getAllServersMock).toHaveBeenCalled()
			expect(result).toEqual([{ name: "server1", host: "localhost", port: 8000 }])
		})
	})

	describe("McpHub fallback behavior when not set", () => {
		test("updateServerTimeout logs warning when McpHub not set", async () => {
			// Execute
			await mcpManager.updateServerTimeout("server1", 60000)

			// Verify
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining("McpHub not available for updateServerTimeout"),
			)
		})

		test("deleteServer logs warning when McpHub not set", async () => {
			// Execute
			await mcpManager.deleteServer("server1")

			// Verify
			expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("McpHub not available for deleteServer"))
		})

		test("toggleServerDisabled logs warning when McpHub not set", async () => {
			// Execute
			await mcpManager.toggleServerDisabled("server1", true)

			// Verify
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining("McpHub not available for toggleServerDisabled"),
			)
		})

		test("restartConnection logs warning when McpHub not set", async () => {
			// Execute
			await mcpManager.restartConnection("server1")

			// Verify
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining("McpHub not available for restartConnection"),
			)
		})

		test("getMcpSettingsFilePath uses fallback path when McpHub not set", async () => {
			// Setup
			Object.defineProperty(process, "platform", { value: "darwin" })
			const expectedFallbackPath = `${TEST_TEMP_DIR}/Documents/${EXTENSION_DISPLAY_NAME}/MCP/mcp_settings.json`

			// Execute
			const result = await mcpManager.getMcpSettingsFilePath()

			// Verify
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining("McpHub not available for getMcpSettingsFilePath"),
			)
			expect(result).toBe(expectedFallbackPath)
		})

		test("getAllServers returns empty array when McpHub not set", () => {
			// Execute
			const result = mcpManager.getAllServers()

			// Verify
			expect(result).toEqual([])
		})
	})

	test("dispose clears the McpHub reference", () => {
		// Setup
		mcpManager.setMcpHub(mockMcpHub)
		expect(mcpManager.getMcpHub()).toBe(mockMcpHub)

		// Execute
		mcpManager.dispose()

		// Verify
		expect(mcpManager.getMcpHub()).toBeUndefined()
		expect(console.log).toHaveBeenCalledWith(expect.stringContaining("TheaMcpManager disposed"))
	})
})
