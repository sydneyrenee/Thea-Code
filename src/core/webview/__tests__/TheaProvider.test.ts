import * as vscode from "vscode"
import { TheaProvider } from "../TheaProvider" // Renamed import
import { TheaTaskStack } from "../thea/TheaTaskStack" // Renamed import and path
import { TheaStateManager } from "../thea/TheaStateManager" // Renamed import and path
import { TheaApiManager } from "../api/TheaApiManager" // Renamed import
import { TheaTaskHistory } from "../history/TheaTaskHistory" // Renamed import
import { TheaCacheManager } from "../cache/TheaCacheManager" // Renamed import
import { TheaMcpManager } from "../mcp/TheaMcpManager" // Renamed import
import { ContextProxy } from "../../config/ContextProxy"
import { ProviderSettingsManager } from "../../config/ProviderSettingsManager"
import { CustomModesManager } from "../../config/CustomModesManager"
import { TheaTask } from "../../TheaTask" // Renamed import
import { McpServerManager } from "../../../services/mcp/management/McpServerManager"
import { defaultModeSlug } from "../../../shared/modes"
import { HistoryItem } from "../../../shared/HistoryItem"
import { t } from "../../../i18n"

// Mock dependencies
jest.mock("vscode")
jest.mock("../thea/TheaTaskStack") // Updated mock path
jest.mock("../thea/TheaStateManager") // Updated mock path
jest.mock("../api/TheaApiManager") // Updated mock path
jest.mock("../history/TheaTaskHistory") // Updated mock path
jest.mock("../cache/TheaCacheManager") // Updated mock path
jest.mock("../mcp/TheaMcpManager") // Updated mock path
jest.mock("../../config/ContextProxy")
jest.mock("../../config/ProviderSettingsManager")
jest.mock("../../config/CustomModesManager")
jest.mock("../../TheaTask") // Updated mock path
jest.mock("../webviewMessageHandler")
jest.mock("../../../services/telemetry/TelemetryService")
jest.mock("../../../services/mcp/management/McpServerManager")
jest.mock("../../../services/mcp/management/McpHub")
jest.mock("../../../services/checkpoints/ShadowCheckpointService")
jest.mock("../../../utils/sound")
jest.mock("../../../utils/tts")
jest.mock("../../../utils/path")
jest.mock("p-wait-for")
jest.mock("delay")
jest.mock("../../../i18n")

// Mock console to prevent test output noise
console.log = jest.fn()
console.error = jest.fn()

describe("TheaProvider", () => {
	// Renamed describe block
	// Setup variables
	let theaProvider: TheaProvider // Renamed variable and type
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockWebview: vscode.Webview
	let mockWebviewView: vscode.WebviewView
	let mockTheaTask: jest.Mocked<TheaTask> // Renamed variable and type

	// Create mocks for manager instances
	const mockTheaTaskStack = {
		// Renamed variable
		addTheaTask: jest.fn(),
		removeCurrentTheaTask: jest.fn(),
		getCurrentTheaTask: jest.fn(),
		getSize: jest.fn(),
		getTaskStack: jest.fn(),
		finishSubTask: jest.fn(),
	}

	const mockTheaStateManager = {
		// Renamed variable
		getState: jest.fn(),
		updateGlobalState: jest.fn(),
		getGlobalState: jest.fn(),
		setValue: jest.fn(),
		getValue: jest.fn(),
		getValues: jest.fn(),
		setValues: jest.fn(),
		getCustomModes: jest.fn(),
	}

	const mockTheaApiManager = {
		// Renamed variable
		handleModeSwitch: jest.fn(),
		updateApiConfiguration: jest.fn(),
		upsertApiConfiguration: jest.fn(),
		handleGlamaCallback: jest.fn(),
		handleOpenRouterCallback: jest.fn(),
		handleRequestyCallback: jest.fn(),
	}

	const mockTheaTaskHistory = {
		// Renamed variable
		getTaskWithId: jest.fn(),
		showTaskWithId: jest.fn(),
		exportTaskWithId: jest.fn(),
		deleteTaskWithId: jest.fn(),
		updateTaskHistory: jest.fn(),
	}

	const mockTheaCacheManager = {
		// Renamed variable
		ensureCacheDirectoryExists: jest.fn(),
		ensureSettingsDirectoryExists: jest.fn(),
		readModelsFromCache: jest.fn(),
		writeModelsToCache: jest.fn(),
	}

	const mockTheaMcpManager = {
		// Renamed variable
		setMcpHub: jest.fn(),
		getMcpHub: jest.fn(),
		getAllServers: jest.fn(),
		ensureMcpServersDirectoryExists: jest.fn(),
		dispose: jest.fn(),
	}

	const mockContextProxy = {
		initialize: jest.fn(),
		isInitialized: false,
		extensionUri: { fsPath: "/test/path" },
		extensionMode: vscode.ExtensionMode.Production,
		globalStorageUri: { fsPath: "/test/storage" },
		setValue: jest.fn(),
		getValue: jest.fn(),
		getValues: jest.fn(),
		setValues: jest.fn(),
		resetAllState: jest.fn(),
	}

	const mockProviderSettingsManager = {
		resetAllConfigs: jest.fn(),
		loadConfig: jest.fn(),
	}

	const mockCustomModesManager = {
		getCustomModes: jest.fn(),
		resetCustomModes: jest.fn(),
		dispose: jest.fn(),
	}

	const mockMcpHub = {
		dispose: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()

		// Setup mock extension context
		mockContext = {
			subscriptions: [],
			extension: {
				packageJSON: { version: "1.0.0" },
			},
		} as unknown as vscode.ExtensionContext

		// Setup mock output channel
		mockOutputChannel = {
			appendLine: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
		} as unknown as vscode.OutputChannel

		// Setup mock webview
		mockWebview = {
			onDidReceiveMessage: jest.fn(),
			postMessage: jest.fn().mockResolvedValue(true),
			html: "",
			options: {},
			cspSource: "https://test-source",
			asWebviewUri: jest.fn().mockImplementation((uri) => uri),
		} as unknown as vscode.Webview

		// Setup mock webview view
		mockWebviewView = {
			webview: mockWebview,
			onDidDispose: jest.fn(),
			onDidChangeVisibility: jest.fn(),
			visible: true,
			description: "Test view",
			title: "Test Title",
			viewType: "test.viewType",
			show: jest.fn(),
			dispose: jest.fn(),
		} as unknown as vscode.WebviewView

		// Setup mock TheaTask
		mockTheaTask = {
			// Renamed variable
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			abortTask: jest.fn(),
			resumePausedTask: jest.fn(),
			parentTask: undefined,
			rootTask: undefined,
			taskNumber: 1,
			customInstructions: "",
			isStreaming: false,
			didFinishAbortingStream: false,
			isWaitingForFirstChunk: false,
			clineMessages: [],
			abandoned: false,
			api: { getModel: jest.fn().mockReturnValue({ id: "test-model-id" }) },
			diffStrategy: { getName: jest.fn().mockReturnValue("test-diff-strategy") },
			taskStateManager: {
				// Add mock state manager
				clineMessages: [], // Provide at least clineMessages
				apiConversationHistory: [], // Add other properties if needed by tests
				getTokenUsage: jest
					.fn()
					.mockReturnValue({ totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, contextTokens: 0 }),
			},
		} as unknown as jest.Mocked<TheaTask>

		// Setup mock manager responses
		;(TheaTaskStack as jest.Mock).mockImplementation(() => mockTheaTaskStack) // Renamed class and variable
		;(TheaStateManager as jest.Mock).mockImplementation(() => mockTheaStateManager) // Renamed class and variable
		;(TheaApiManager as jest.Mock).mockImplementation(() => mockTheaApiManager) // Renamed class and variable
		;(TheaTaskHistory as jest.Mock).mockImplementation(() => mockTheaTaskHistory) // Renamed class and variable
		;(TheaCacheManager as jest.Mock).mockImplementation(() => mockTheaCacheManager) // Renamed class and variable
		;(TheaMcpManager as jest.Mock).mockImplementation(() => mockTheaMcpManager) // Renamed class and variable
		;(ContextProxy as jest.Mock).mockImplementation(() => mockContextProxy)
		;(ProviderSettingsManager as unknown as jest.Mock).mockImplementation(() => mockProviderSettingsManager)
		;(CustomModesManager as jest.Mock).mockImplementation(() => mockCustomModesManager)

		// Mock McpServerManager.getInstance to return a mock McpHub - fix the mock implementation
		const mockGetInstance = jest.fn().mockResolvedValue(mockMcpHub)
		McpServerManager.getInstance = mockGetInstance

		// Setup i18n translation mock - fix the mock implementation
		jest.mocked(t).mockImplementation((key: string) => {
			const translations: Record<string, string> = {
				"common:confirmation.reset_state": "Are you sure you want to reset all state?",
				"common:answers.yes": "Yes",
			}
			return translations[key] || key
		})

		// Create instance of TheaProvider
		theaProvider = new TheaProvider(mockContext, mockOutputChannel, "sidebar") // Renamed variable and constructor
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	test("constructor initializes dependencies correctly", () => {
		expect(TheaTaskStack).toHaveBeenCalled() // Renamed class
		expect(TheaStateManager).toHaveBeenCalled() // Renamed class
		expect(TheaApiManager).toHaveBeenCalled() // Renamed class
		expect(TheaTaskHistory).toHaveBeenCalled() // Renamed class
		expect(TheaCacheManager).toHaveBeenCalled() // Renamed class
		expect(TheaMcpManager).toHaveBeenCalled() // Renamed class
		expect(ContextProxy).toHaveBeenCalledWith(mockContext)
		expect(ProviderSettingsManager).toHaveBeenCalledWith(mockContext)
		expect(CustomModesManager).toHaveBeenCalled()

		// Verify McpServerManager was called
		expect(McpServerManager.getInstance).toHaveBeenCalledWith(mockContext, theaProvider)

		// Check initial properties
		expect(theaProvider.isViewLaunched).toBe(false)
		expect(theaProvider.contextProxy).toBe(mockContextProxy)
		expect(theaProvider.providerSettingsManager).toBe(mockProviderSettingsManager)
		expect(theaProvider.customModesManager).toBe(mockCustomModesManager) // Renamed variable
		expect(theaProvider["theaTaskStackManager"]).toBe(mockTheaTaskStack) // Renamed property access and variable
		expect(theaProvider["theaStateManager"]).toBe(mockTheaStateManager) // Renamed property access and variable
		expect(theaProvider["theaApiManager"]).toBe(mockTheaApiManager) // Renamed property access and variable
		expect(theaProvider["theaTaskHistoryManager"]).toBe(mockTheaTaskHistory) // Renamed property access and variable
		expect(theaProvider["theaCacheManager"]).toBe(mockTheaCacheManager) // Renamed property access and variable
		expect(theaProvider["theaMcpManager"]).toBe(mockTheaMcpManager) // Renamed property access and variable
	})

	test("resolveWebviewView initializes webview correctly", async () => {
		// Setup state manager to return mock state
		mockTheaStateManager.getState.mockResolvedValue({
			// Renamed variable
			soundEnabled: true,
			terminalShellIntegrationTimeout: 5000,
			ttsEnabled: false,
			ttsSpeed: 1.0,
		})

		// Execute
		await theaProvider.resolveWebviewView(mockWebviewView)

		// Verify
		expect(theaProvider.view).toBe(mockWebviewView)
		expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled()
		expect(mockWebviewView.onDidChangeVisibility).toHaveBeenCalled()
		expect(mockWebviewView.onDidDispose).toHaveBeenCalled()
		expect(mockWebview.options).toEqual({
			enableScripts: true,
			localResourceRoots: [mockContextProxy.extensionUri],
		})
		expect(mockTheaTaskStack.removeCurrentTheaTask).toHaveBeenCalled() // Updated to new method name
	})

	test("dispose cleans up resources properly", async () => {
		// Setup
		theaProvider.view = mockWebviewView

		// Execute
		await theaProvider.dispose()

		// Verify
		expect(mockTheaTaskStack.removeCurrentTheaTask).toHaveBeenCalled() // Updated to new method name
		// WebviewView doesn't have a dispose method, we should check if unregisterProvider was called
		// and if clineMcpManager.dispose was called, which are the important cleanup steps
		expect(mockTheaMcpManager.dispose).toHaveBeenCalled() // Renamed variable
		expect(McpServerManager.unregisterProvider).toHaveBeenCalledWith(theaProvider) // Renamed variable
	})

	test("initClineWithTask creates a new TheaTask instance and adds it to stack", async () => {
		// Updated test description
		// Setup state
		mockTheaStateManager.getState.mockResolvedValue({
			// Renamed variable
			apiConfiguration: { apiProvider: "test-provider" },
			customModePrompts: {},
			diffEnabled: true,
			enableCheckpoints: true,
			checkpointStorage: "task",
			fuzzyMatchThreshold: 1.0,
			mode: defaultModeSlug,
			customInstructions: "test instructions",
			experiments: {},
		})

		// Mock stack size for task number
		mockTheaTaskStack.getSize.mockReturnValue(0) // Renamed variable

		// Mock TheaTask constructor
		;(TheaTask as unknown as jest.Mock).mockImplementation(() => mockTheaTask) // Renamed class and variable

		// Execute
		const result = await theaProvider.initWithTask("test task") // Updated to new method name

		// Verify
		expect(mockTheaStateManager.getState).toHaveBeenCalled() // Renamed variable
		expect(TheaTask).toHaveBeenCalledWith(
			expect.objectContaining({
				// Renamed class
				provider: theaProvider, // Renamed variable
				task: "test task",
				enableDiff: true,
				enableCheckpoints: true,
				checkpointStorage: "task",
				fuzzyMatchThreshold: 1.0,
				taskNumber: 1,
			}),
		)
		expect(mockTheaTaskStack.addTheaTask).toHaveBeenCalledWith(mockTheaTask) // Updated to new method name
		expect(result).toBe(mockTheaTask) // Renamed variable
	})

	test("initClineWithHistoryItem initializes TheaTask from history and adds to stack", async () => {
		// Updated test description
		// Setup state
		mockTheaStateManager.getState.mockResolvedValue({
			// Renamed variable
			apiConfiguration: { apiProvider: "test-provider" },
			customModePrompts: {},
			diffEnabled: true,
			enableCheckpoints: true,
			checkpointStorage: "task",
			fuzzyMatchThreshold: 1.0,
			mode: defaultModeSlug,
			customInstructions: "test instructions",
			experiments: {},
		})

		// Create history item
		const historyItem: HistoryItem & { rootTask?: TheaTask; parentTask?: TheaTask } = {
			// Renamed type
			id: "test-history-id",
			task: "test history task",
			ts: Date.now(),
			number: 2,
			tokensIn: 0,
			tokensOut: 0,
			totalCost: 0,
		}

		// Mock TheaTask constructor
		;(TheaTask as unknown as jest.Mock).mockImplementation(() => mockTheaTask) // Renamed class and variable

		// Execute
		const result = await theaProvider.initWithHistoryItem(historyItem) // Updated to new method name

		// Verify
		expect(mockTheaTaskStack.removeCurrentTheaTask).toHaveBeenCalled() // Updated to new method name
		expect(mockTheaStateManager.getState).toHaveBeenCalled() // Renamed variable
		expect(TheaTask).toHaveBeenCalledWith(
			expect.objectContaining({
				// Renamed class
				provider: theaProvider, // Renamed variable
				historyItem,
				enableDiff: true,
				enableCheckpoints: true,
				checkpointStorage: expect.any(String),
				fuzzyMatchThreshold: 1.0,
				taskNumber: 2,
			}),
		)
		expect(mockTheaTaskStack.addTheaTask).toHaveBeenCalledWith(mockTheaTask) // Updated to new method name
		expect(result).toBe(mockTheaTask) // Renamed variable
	})

	test("cancelTask aborts current task and reloads from history", async () => {
		// Setup
		const historyItem = {
			id: "test-task-id",
			task: "test task",
			ts: Date.now(),
		}

		mockTheaTaskStack.getCurrentTheaTask.mockReturnValue(mockTheaTask) // Updated to new method name
		mockTheaTaskHistory.getTaskWithId.mockResolvedValue({ historyItem }) // Renamed variable

		// Execute
		await theaProvider.cancelTask()

		// Verify
		expect(mockTheaTask.abortTask).toHaveBeenCalled() // Renamed variable
		expect(mockTheaTask.abandoned).toBe(true) // Renamed variable
		expect(mockTheaTaskHistory.getTaskWithId).toHaveBeenCalledWith("test-task-id") // Renamed variable
	})

	test("postStateToWebview sends correct state to webview", async () => {
		// Setup
		const mockState = {
			apiConfiguration: { apiProvider: "test-provider" },
			mode: "default",
			soundEnabled: true,
			taskHistory: [{ id: "task1", ts: 1000, task: "Task 1" }],
		}

		mockTheaStateManager.getState.mockResolvedValue(mockState) // Renamed variable
		mockTheaTaskStack.getCurrentTheaTask.mockReturnValue(undefined) // Updated to new method name
		mockCustomModesManager.getCustomModes.mockResolvedValue([])
		mockTheaMcpManager.getAllServers.mockReturnValue([]) // Renamed variable

		theaProvider.view = mockWebviewView

		// Execute
		await theaProvider.postStateToWebview()

		// Verify
		expect(mockTheaStateManager.getState).toHaveBeenCalled() // Renamed variable
		expect(mockWebview.postMessage).toHaveBeenCalledWith({
			type: "state",
			state: expect.objectContaining({
				version: "1.0.0",
				mode: "default",
				soundEnabled: true,
				taskHistory: expect.arrayContaining([expect.objectContaining({ id: "task1", task: "Task 1" })]),
				currentTaskItem: undefined,
				clineMessages: [],
			}),
		})
	})

	test("resetState calls appropriate reset methods", async () => {
		// Mock the vscode.window.showInformationMessage to simulate user clicking "Yes"
		// Fix: Use proper type for the mock function to match VS Code API
		jest.mocked(vscode.window.showInformationMessage).mockImplementation(
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			(_message: string, _options: vscode.MessageOptions, ..._items: vscode.MessageItem[]) => {
				// Return the "Yes" option to simulate user confirmation
				return Promise.resolve("Yes" as unknown as vscode.MessageItem)
			},
		)

		theaProvider.view = mockWebviewView

		// Execute
		await theaProvider.resetState()

		// Verify
		expect(mockContextProxy.resetAllState).toHaveBeenCalled()
		expect(mockProviderSettingsManager.resetAllConfigs).toHaveBeenCalled()
		expect(mockCustomModesManager.resetCustomModes).toHaveBeenCalled()
		expect(mockTheaTaskStack.removeCurrentTheaTask).toHaveBeenCalled() // Updated to new method name
		expect(mockWebview.postMessage).toHaveBeenCalledTimes(2)
	})

	test("handleModeSwitchAndUpdateCline delegates to managers correctly", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "updated-provider" }
		mockTheaApiManager.handleModeSwitch.mockResolvedValue(mockApiConfig) // Renamed variable
		mockTheaTaskStack.getCurrentTheaTask.mockReturnValue(mockTheaTask) // Updated to new method name

		// Execute
		await theaProvider.handleModeSwitchAndUpdate("default") // Updated to new method name

		// Verify
		expect(mockTheaApiManager.handleModeSwitch).toHaveBeenCalledWith("default") // Renamed variable
		expect(mockTheaTask.api).toBeDefined() // Checks that api was updated // Renamed variable
	})

	test("updateCustomInstructions updates context value and current cline", async () => {
		// Setup
		const newInstructions = "New instructions"
		mockTheaTaskStack.getCurrentTheaTask.mockReturnValue(mockTheaTask) // Updated to new method name

		// Execute
		await theaProvider.updateCustomInstructions(newInstructions) // Renamed variable

		// Verify
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("customInstructions", newInstructions)
		expect(mockTheaTask.customInstructions).toBe(newInstructions) // Renamed variable
	})

	test("getTelemetryProperties returns correct properties", async () => {
		// Setup
		mockTheaStateManager.getState.mockResolvedValue({
			// Renamed variable
			mode: "default",
			apiConfiguration: { apiProvider: "test-provider" },
			language: "en",
		})
		mockTheaTaskStack.getCurrentTheaTask.mockReturnValue(mockTheaTask) // Updated to new method name

		// Execute
		const result = await theaProvider.getTelemetryProperties()

		// Verify
		expect(result).toEqual(
			expect.objectContaining({
				appVersion: "1.0.0",
				mode: "default",
				apiProvider: "test-provider",
				language: "en",
				modelId: "test-model-id",
				diffStrategy: "test-diff-strategy",
			}),
		)
	})

	test("proxy methods delegate to the appropriate manager instances", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "test-provider" }
		mockTheaStateManager.getValue.mockReturnValue(mockApiConfig) // Renamed variable
		mockTheaStateManager.getState.mockResolvedValue({ mode: "default" }) // Renamed variable
		mockProviderSettingsManager.loadConfig.mockResolvedValue(mockApiConfig)
		mockTheaTaskStack.getCurrentTheaTask.mockReturnValue(mockTheaTask) // Updated to new method name

		// Test state manager proxy methods
		await theaProvider.setValue("currentApiConfigName", "test-config") // Renamed variable
		expect(mockTheaStateManager.setValue).toHaveBeenCalledWith("currentApiConfigName", "test-config") // Renamed variable
		expect(mockProviderSettingsManager.loadConfig).toHaveBeenCalledWith("test-config")

		// Use a valid key for ProviderSettings instead of "apiConfig"
		const value = theaProvider.getValue("apiProvider") // Renamed variable
		expect(mockTheaStateManager.getValue).toHaveBeenCalledWith("apiProvider") // Renamed variable
		expect(value).toEqual(mockApiConfig)

		// Test stack manager proxy methods
		await theaProvider.addToStack(mockTheaTask) // Updated to new method name
		expect(mockTheaTaskStack.addTheaTask).toHaveBeenCalledWith(mockTheaTask) // Updated to new method name

		const currentTheaTask = theaProvider.getCurrent() // Updated to new method name
		expect(mockTheaTaskStack.getCurrentTheaTask).toHaveBeenCalled() // Updated to new method name
		expect(currentTheaTask).toBe(mockTheaTask) // Renamed variable

		// Call getStackSize and verify the method was called
		theaProvider.getStackSize() // Updated to new method name
		expect(mockTheaTaskStack.getSize).toHaveBeenCalled() // Renamed variable
	})
})
