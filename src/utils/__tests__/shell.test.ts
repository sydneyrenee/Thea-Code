import * as vscode from "vscode"
import * as os from "os"
import { getShell } from "../shell"

// Mock the os module
jest.mock("os", () => ({
	...jest.requireActual("os"),
	userInfo: jest.fn(() => ({ shell: null }))
}))

const mockUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>

describe("Shell Detection Tests", () => {
	let originalPlatform: string
	let originalEnv: NodeJS.ProcessEnv
	let originalGetConfig: typeof vscode.workspace.getConfiguration

	// Helper to mock VS Code configuration
	function mockVsCodeConfig(
		platformKey: string,
		defaultProfileName: string | null,
		profiles: Record<string, unknown>,
	) {
		;(vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => ({
			get: (key: string) => {
				if (key === `defaultProfile.${platformKey}`) {
					return defaultProfileName
				}
				if (key === `profiles.${platformKey}`) {
					return profiles
				}
				return undefined
			},
		}))
	}

	// Helper function to create a properly typed mock for vscode.workspace.getConfiguration
	function createConfigMock(returnValue: unknown = undefined): typeof vscode.workspace.getConfiguration {
		return (() => ({ get: () => returnValue })) as unknown as typeof vscode.workspace.getConfiguration
	}

	beforeEach(() => {
		// Store original references
		originalPlatform = process.platform
		originalEnv = { ...process.env }
		originalGetConfig = vscode.workspace.getConfiguration

		// Clear environment variables for a clean test
		delete process.env.SHELL
		delete process.env.COMSPEC

		// Default userInfo() mock
		mockUserInfo.mockReturnValue({ 
			shell: null,
			username: "testuser",
			uid: 1000,
			gid: 1000,
			homedir: "/home/testuser"
		})
	})

	afterEach(() => {
		// Restore everything
		Object.defineProperty(process, "platform", { value: originalPlatform })
		process.env = originalEnv
		vscode.workspace.getConfiguration = originalGetConfig
		jest.resetAllMocks()
	})

	// --------------------------------------------------------------------------
	// Windows Shell Detection
	// --------------------------------------------------------------------------
	describe("Windows Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "win32" })
		})

		it("uses explicit PowerShell 7 path from VS Code config (profile path)", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("uses PowerShell 7 path if source is 'PowerShell' but no explicit path", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { source: "PowerShell" },
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("falls back to legacy PowerShell if profile includes 'powershell' but no path/source", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: {},
			})
			expect(getShell()).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
		})

		it("uses WSL bash when profile indicates WSL source", () => {
			mockVsCodeConfig("windows", "WSL", {
				WSL: { source: "WSL" },
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("uses WSL bash when profile name includes 'wsl'", () => {
			mockVsCodeConfig("windows", "Ubuntu WSL", {
				"Ubuntu WSL": {},
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("defaults to cmd.exe if no special profile is matched", () => {
			mockVsCodeConfig("windows", "CommandPrompt", {
				CommandPrompt: {},
			})
			expect(getShell()).toBe("C:\\Windows\\System32\\cmd.exe")
		})

		it("handles undefined profile gracefully", () => {
			// Mock a case where defaultProfileName exists but the profile doesn't
			mockVsCodeConfig("windows", "NonexistentProfile", {})
			expect(getShell()).toBe("C:\\Windows\\System32\\cmd.exe")
		})

		it("respects userInfo() if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			mockUserInfo.mockReturnValue({ 
				shell: "C:\\Custom\\PowerShell.exe",
				username: "testuser",
				uid: 1000,
				gid: 1000,
				homedir: "/home/testuser"
			})

			expect(getShell()).toBe("C:\\Custom\\PowerShell.exe")
		})

		it("respects an odd COMSPEC if no userInfo shell is available", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			process.env.COMSPEC = "D:\\CustomCmd\\cmd.exe"

			expect(getShell()).toBe("D:\\CustomCmd\\cmd.exe")
		})
	})

	// --------------------------------------------------------------------------
	// macOS Shell Detection
	// --------------------------------------------------------------------------
	describe("macOS Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "darwin" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("osx", "MyCustomShell", {
				MyCustomShell: { path: "/usr/local/bin/fish" },
			})
			expect(getShell()).toBe("/usr/local/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			mockUserInfo.mockReturnValue({ 
				shell: "/opt/homebrew/bin/zsh",
				username: "testuser",
				uid: 1000,
				gid: 1000,
				homedir: "/home/testuser"
			})
			expect(getShell()).toBe("/opt/homebrew/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			process.env.SHELL = "/usr/local/bin/zsh"
			expect(getShell()).toBe("/usr/local/bin/zsh")
		})

		it("falls back to /bin/zsh if no config, userInfo, or env variable is set", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			expect(getShell()).toBe("/bin/zsh")
		})
	})

	// --------------------------------------------------------------------------
	// Linux Shell Detection
	// --------------------------------------------------------------------------
	describe("Linux Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("linux", "CustomProfile", {
				CustomProfile: { path: "/usr/bin/fish" },
			})
			expect(getShell()).toBe("/usr/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			mockUserInfo.mockReturnValue({ 
				shell: "/usr/bin/zsh",
				username: "testuser",
				uid: 1000,
				gid: 1000,
				homedir: "/home/testuser"
			})
			expect(getShell()).toBe("/usr/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			process.env.SHELL = "/usr/bin/fish"
			expect(getShell()).toBe("/usr/bin/fish")
		})

		it("falls back to /bin/bash if nothing is set", () => {
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			expect(getShell()).toBe("/bin/bash")
		})
	})

	// --------------------------------------------------------------------------
	// Unknown Platform & Error Handling
	// --------------------------------------------------------------------------
	describe("Unknown Platform / Error Handling", () => {
		it("falls back to /bin/sh for unknown platforms", () => {
			Object.defineProperty(process, "platform", { value: "sunos" })
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			expect(getShell()).toBe("/bin/sh")
		})

		it("handles VS Code config errors gracefully, falling back to userInfo shell if present", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = (() => {
				throw new Error("Configuration error")
			}) as unknown as typeof vscode.workspace.getConfiguration
			mockUserInfo.mockReturnValue({ 
				shell: "/bin/bash",
				username: "testuser",
				uid: 1000,
				gid: 1000,
				homedir: "/home/testuser"
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("handles userInfo errors gracefully, falling back to environment variable if present", () => {
			Object.defineProperty(process, "platform", { value: "darwin" })
			vscode.workspace.getConfiguration = createConfigMock(undefined)
			mockUserInfo.mockImplementation(() => {
				throw new Error("userInfo error")
			})
			process.env.SHELL = "/bin/zsh"
			expect(getShell()).toBe("/bin/zsh")
		})

		it("falls back fully to default shell paths if everything fails", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = (() => {
				throw new Error("Configuration error")
			}) as unknown as typeof vscode.workspace.getConfiguration
			mockUserInfo.mockImplementation(() => {
				throw new Error("userInfo error")
			})
			expect(getShell()).toBe("/bin/bash")
		})
	})
})
