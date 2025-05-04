// filepath: /Volumes/stuff/Projects/Thea-Code/src/core/webview/__tests__/ClineStateManager.test.ts
import * as vscode from "vscode"
import * as os from "os"
import { TheaStateManager } from "../thea/TheaStateManager" // Renamed import and path
import { ContextProxy } from "../../config/ContextProxy"
import { ProviderSettingsManager } from "../../config/ProviderSettingsManager"
import { CustomModesManager } from "../../config/CustomModesManager"
import { defaultModeSlug } from "../../../shared/modes"
import { experimentDefault } from "../../../shared/experiments"
import { formatLanguage } from "../../../shared/language"
import { TERMINAL_SHELL_INTEGRATION_TIMEOUT } from "../../../integrations/terminal/Terminal"

// Mock dependencies
jest.mock("vscode")
jest.mock("os")
jest.mock("../../config/ContextProxy")
jest.mock("../../config/ProviderSettingsManager")
jest.mock("../../config/CustomModesManager")
jest.mock("../../../shared/language")

describe("TheaStateManager", () => {
	// Renamed describe block
	let stateManager: TheaStateManager // Renamed type
	let mockContext: vscode.ExtensionContext
	let mockContextProxy: jest.Mocked<ContextProxy>
	let mockProviderSettingsManager: jest.Mocked<ProviderSettingsManager>
	let mockCustomModesManager: jest.Mocked<CustomModesManager>

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Mock os.platform
		;(os.platform as jest.Mock).mockReturnValue("darwin")

		// Mock formatLanguage
		;(formatLanguage as jest.Mock).mockReturnValue("en")

		// Mock context
		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalState: {
				get: jest.fn(),
				update: jest.fn(),
				keys: jest.fn(),
			},
			secrets: {
				get: jest.fn(),
				store: jest.fn(),
				delete: jest.fn(),
			},
			subscriptions: [],
			extension: {
				packageJSON: { version: "1.0.0" },
			},
		} as unknown as vscode.ExtensionContext

		// Mock contextProxy
		mockContextProxy = {
			getValues: jest.fn().mockReturnValue({}),
			setValue: jest.fn().mockImplementation(() => Promise.resolve()),
			getValue: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
			setValues: jest.fn().mockImplementation(() => Promise.resolve()),
			getProviderSettings: jest.fn().mockReturnValue({ apiProvider: "anthropic" }),
			setProviderSettings: jest.fn().mockImplementation(() => Promise.resolve()),
		} as unknown as jest.Mocked<ContextProxy>

		// Mock ContextProxy constructor
		;(ContextProxy as jest.MockedClass<typeof ContextProxy>).mockImplementation(() => mockContextProxy)

		// Mock provider settings manager
		mockProviderSettingsManager = {} as jest.Mocked<ProviderSettingsManager>

		// Mock custom modes manager
		mockCustomModesManager = {
			getCustomModes: jest
				.fn()
				.mockResolvedValue([{ slug: "custom", name: "Custom", roleDefinition: "Role", groups: ["read"] }]),
		} as unknown as jest.Mocked<CustomModesManager>

		// Create instance of ClineStateManager
		stateManager = new TheaStateManager(mockContext, mockProviderSettingsManager, mockCustomModesManager) // Renamed constructor
	})

	test("getState returns correct default state when no values are provided", async () => {
		// Setup - empty state values from contextProxy
		mockContextProxy.getValues.mockReturnValue({})
		mockContextProxy.getProviderSettings.mockReturnValue({ apiProvider: "anthropic" })

		// Execute
		const state = await stateManager.getState()

		// Verify
		expect(state).toEqual(
			expect.objectContaining({
				apiConfiguration: { apiProvider: "anthropic" },
				osInfo: "unix",
				alwaysAllowReadOnly: false,
				alwaysAllowReadOnlyOutsideWorkspace: false,
				alwaysAllowWrite: false,
				alwaysAllowWriteOutsideWorkspace: false,
				alwaysAllowExecute: false,
				alwaysAllowBrowser: false,
				alwaysAllowMcp: false,
				alwaysAllowModeSwitch: false,
				alwaysAllowSubtasks: false,
				soundEnabled: false,
				ttsEnabled: false,
				ttsSpeed: 1.0,
				diffEnabled: true,
				enableCheckpoints: true,
				checkpointStorage: "task",
				browserViewportSize: "900x600",
				screenshotQuality: 75,
				remoteBrowserEnabled: false,
				fuzzyMatchThreshold: 1.0,
				writeDelayMs: 1000,
				terminalOutputLineLimit: 500,
				terminalShellIntegrationTimeout: TERMINAL_SHELL_INTEGRATION_TIMEOUT,
				mode: defaultModeSlug,
				language: "en",
				mcpEnabled: true,
				enableMcpServerCreation: true,
				alwaysApproveResubmit: false,
				requestDelaySeconds: 10,
				rateLimitSeconds: 0,
				currentApiConfigName: "default",
				listApiConfigMeta: [],
				pinnedApiConfigs: {},
				modeApiConfigs: {},
				customModePrompts: {},
				customSupportPrompts: {},
				experiments: experimentDefault,
				autoApprovalEnabled: false,
				customModes: [{ slug: "custom", name: "Custom", roleDefinition: "Role", groups: ["read"] }],
				maxOpenTabsContext: 20,
				maxWorkspaceFiles: 200,
				openRouterUseMiddleOutTransform: true,
				browserToolEnabled: true,
				telemetrySetting: "unset",
				showTheaIgnoredFiles: true,
				maxReadFileLine: 500,
			}),
		)
	})

	test("getState correctly integrates stored state values", async () => {
		// Setup - provide specific state values
		mockContextProxy.getValues.mockReturnValue({
			mode: "architect",
			soundEnabled: true,
			diffEnabled: false,
			browserViewportSize: "1200x800",
			maxWorkspaceFiles: 300,
			customModePrompts: { architect: { customInstructions: "Test instructions" } },
		})
		mockContextProxy.getProviderSettings.mockReturnValue({
			apiProvider: "openrouter",
			openRouterApiKey: "test-key",
		})

		// Execute
		const state = await stateManager.getState()

		// Verify
		expect(state).toEqual(
			expect.objectContaining({
				apiConfiguration: {
					apiProvider: "openrouter",
					openRouterApiKey: "test-key",
				},
				mode: "architect",
				soundEnabled: true,
				diffEnabled: false,
				browserViewportSize: "1200x800",
				maxWorkspaceFiles: 300,
				customModePrompts: { architect: { customInstructions: "Test instructions" } },
			}),
		)
	})

	test("getState uses getCustomModes method if available", async () => {
		// Setup - mock custom getCustomModes method
		const mockGetCustomModes = jest.fn().mockResolvedValue([
			{ slug: "custom1", name: "Custom 1", roleDefinition: "Role 1", groups: ["read"] },
			{ slug: "custom2", name: "Custom 2", roleDefinition: "Role 2", groups: ["read", "execute"] },
		])
		stateManager.getCustomModes = mockGetCustomModes

		// Execute
		const state = await stateManager.getState()

		// Verify
		expect(mockGetCustomModes).toHaveBeenCalled()
		expect(mockCustomModesManager.getCustomModes).not.toHaveBeenCalled()
		expect(state.customModes).toEqual([
			{ slug: "custom1", name: "Custom 1", roleDefinition: "Role 1", groups: ["read"] },
			{ slug: "custom2", name: "Custom 2", roleDefinition: "Role 2", groups: ["read", "execute"] },
		])
	})

	test("getState falls back to customModesManager if getCustomModes is not set", async () => {
		// Setup - ensure getCustomModes is undefined
		stateManager.getCustomModes = undefined

		// Execute
		const state = await stateManager.getState()

		// Verify
		expect(mockCustomModesManager.getCustomModes).toHaveBeenCalled()
		expect(state.customModes).toEqual([
			{ slug: "custom", name: "Custom", roleDefinition: "Role", groups: ["read"] },
		])
	})

	test("getState enforces minimum requestDelaySeconds", async () => {
		// Setup - provide state with low requestDelaySeconds
		mockContextProxy.getValues.mockReturnValue({
			requestDelaySeconds: 2,
		})

		// Execute
		const state = await stateManager.getState()

		// Verify - should enforce minimum of 5 seconds
		expect(state.requestDelaySeconds).toBe(5)
	})

	test("updateGlobalState delegates to contextProxy.setValue", async () => {
		// Execute
		await stateManager.updateGlobalState("diffEnabled", false)

		// Verify
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("diffEnabled", false)
	})

	test("getGlobalState delegates to contextProxy.getValue", async () => {
		// Setup
		mockContextProxy.getValue.mockImplementation(() => Promise.resolve(true))

		// Execute
		const result = await stateManager.getGlobalState("diffEnabled")

		// Verify
		expect(mockContextProxy.getValue).toHaveBeenCalledWith("diffEnabled")
		expect(result).toBe(true)
	})

	test("setValue delegates to contextProxy.setValue", async () => {
		// Execute
		await stateManager.setValue("diffEnabled", false)

		// Verify
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("diffEnabled", false)
	})

	test("getValue delegates to contextProxy.getValue", async () => {
		// Setup
		mockContextProxy.getValue.mockImplementation(() => Promise.resolve(true))

		// Execute
		const result = await stateManager.getValue("diffEnabled")

		// Verify
		expect(mockContextProxy.getValue).toHaveBeenCalledWith("diffEnabled")
		expect(result).toBe(true)
	})

	test("getValues delegates to contextProxy.getValues", () => {
		// Setup
		const mockValues = { diffEnabled: true, mode: "code" }
		mockContextProxy.getValues.mockReturnValue(mockValues)

		// Execute
		const result = stateManager.getValues()

		// Verify
		expect(mockContextProxy.getValues).toHaveBeenCalled()
		expect(result).toBe(mockValues)
	})

	test("setValues delegates to contextProxy.setValues", async () => {
		// Setup
		const mockValues = { diffEnabled: true, mode: "code" }

		// Execute
		await stateManager.setValues(mockValues)

		// Verify
		expect(mockContextProxy.setValues).toHaveBeenCalledWith(mockValues)
	})
})
