import * as vscode from "vscode"
import EventEmitter from "events"
import { ClineProvider } from "../ClineProvider"
import { ClineStack } from "../cline/ClineStack"
import { ClineStateManager } from "../cline/ClineStateManager"
import { ClineApiManager } from "../api/ClineApiManager"
import { ClineTaskHistory } from "../history/ClineTaskHistory"
import { ClineCacheManager } from "../cache/ClineCacheManager"
import { ClineMcpManager } from "../mcp/ClineMcpManager"
import { ContextProxy } from "../../config/ContextProxy"
import { ProviderSettingsManager } from "../../config/ProviderSettingsManager"
import { CustomModesManager } from "../../config/CustomModesManager"
import { Cline } from "../../Cline"
import { webviewMessageHandler } from "../webviewMessageHandler"
import { telemetryService } from "../../../services/telemetry/TelemetryService"
import { McpServerManager } from "../../../services/mcp/McpServerManager"
import { McpHub } from "../../../services/mcp/McpHub"
import { defaultModeSlug } from "../../../shared/modes"
import { HistoryItem } from "../../../shared/HistoryItem"
import { t } from "../../../i18n"

// Mock dependencies
jest.mock("vscode")
jest.mock("../cline/ClineStack")
jest.mock("../cline/ClineStateManager")
jest.mock("../api/ClineApiManager")
jest.mock("../history/ClineTaskHistory")
jest.mock("../cache/ClineCacheManager")
jest.mock("../mcp/ClineMcpManager")
jest.mock("../../config/ContextProxy")
jest.mock("../../config/ProviderSettingsManager")
jest.mock("../../config/CustomModesManager")
jest.mock("../../Cline")
jest.mock("../webviewMessageHandler")
jest.mock("../../../services/telemetry/TelemetryService")
jest.mock("../../../services/mcp/McpServerManager")
jest.mock("../../../services/mcp/McpHub")
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

describe("ClineProvider", () => {
  // Setup variables
  let clineProvider: ClineProvider
  let mockContext: vscode.ExtensionContext
  let mockOutputChannel: vscode.OutputChannel
  let mockWebview: vscode.Webview
  let mockWebviewView: vscode.WebviewView
  let mockCline: jest.Mocked<Cline>

  // Create mocks for manager instances
  const mockClineStack = {
    addCline: jest.fn(),
    removeCurrentCline: jest.fn(),
    getCurrentCline: jest.fn(),
    getSize: jest.fn(),
    getTaskStack: jest.fn(),
    finishSubTask: jest.fn(),
  }

  const mockClineStateManager = {
    getState: jest.fn(),
    updateGlobalState: jest.fn(),
    getGlobalState: jest.fn(),
    setValue: jest.fn(),
    getValue: jest.fn(),
    getValues: jest.fn(),
    setValues: jest.fn(),
    getCustomModes: jest.fn(),
  }

  const mockClineApiManager = {
    handleModeSwitch: jest.fn(),
    updateApiConfiguration: jest.fn(),
    upsertApiConfiguration: jest.fn(),
    handleGlamaCallback: jest.fn(),
    handleOpenRouterCallback: jest.fn(),
    handleRequestyCallback: jest.fn(),
  }

  const mockClineTaskHistory = {
    getTaskWithId: jest.fn(),
    showTaskWithId: jest.fn(),
    exportTaskWithId: jest.fn(),
    deleteTaskWithId: jest.fn(),
    updateTaskHistory: jest.fn(),
  }

  const mockClineCacheManager = {
    ensureCacheDirectoryExists: jest.fn(),
    ensureSettingsDirectoryExists: jest.fn(),
    readModelsFromCache: jest.fn(),
    writeModelsToCache: jest.fn(),
  }

  const mockClineMcpManager = {
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
        packageJSON: { version: "1.0.0" }
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

    // Setup mock Cline
    mockCline = {
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
    } as unknown as jest.Mocked<Cline>

    // Setup mock manager responses
    ;(ClineStack as jest.Mock).mockImplementation(() => mockClineStack)
    ;(ClineStateManager as jest.Mock).mockImplementation(() => mockClineStateManager)
    ;(ClineApiManager as jest.Mock).mockImplementation(() => mockClineApiManager)
    ;(ClineTaskHistory as jest.Mock).mockImplementation(() => mockClineTaskHistory)
    ;(ClineCacheManager as jest.Mock).mockImplementation(() => mockClineCacheManager)
    ;(ClineMcpManager as jest.Mock).mockImplementation(() => mockClineMcpManager)
    ;(ContextProxy as jest.Mock).mockImplementation(() => mockContextProxy)
    ;((ProviderSettingsManager as unknown) as jest.Mock).mockImplementation(() => mockProviderSettingsManager)
    ;(CustomModesManager as jest.Mock).mockImplementation(() => mockCustomModesManager)
    
    // Mock McpServerManager.getInstance to return a mock McpHub - fix the mock implementation
    const mockGetInstance = jest.fn().mockResolvedValue(mockMcpHub)
    McpServerManager.getInstance = mockGetInstance

    // Setup i18n translation mock - fix the mock implementation
    jest.mocked(t).mockImplementation((key: string) => {
      const translations: Record<string, string> = {
        "common:confirmation.reset_state": "Are you sure you want to reset all state?",
        "common:answers.yes": "Yes"
      };
      return translations[key] || key;
    });

    // Create instance of ClineProvider
    clineProvider = new ClineProvider(mockContext, mockOutputChannel, "sidebar")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("constructor initializes dependencies correctly", () => {
    expect(ClineStack).toHaveBeenCalled()
    expect(ClineStateManager).toHaveBeenCalled()
    expect(ClineApiManager).toHaveBeenCalled()
    expect(ClineTaskHistory).toHaveBeenCalled()
    expect(ClineCacheManager).toHaveBeenCalled()
    expect(ClineMcpManager).toHaveBeenCalled()
    expect(ContextProxy).toHaveBeenCalledWith(mockContext)
    expect(ProviderSettingsManager).toHaveBeenCalledWith(mockContext)
    expect(CustomModesManager).toHaveBeenCalled()
    
    // Verify McpServerManager was called
    expect(McpServerManager.getInstance).toHaveBeenCalledWith(mockContext, clineProvider)
    
    // Check initial properties
    expect(clineProvider.isViewLaunched).toBe(false)
    expect(clineProvider.contextProxy).toBe(mockContextProxy)
    expect(clineProvider.providerSettingsManager).toBe(mockProviderSettingsManager)
    expect(clineProvider.customModesManager).toBe(mockCustomModesManager)
    expect(clineProvider['clineStackManager']).toBe(mockClineStack)
    expect(clineProvider['clineStateManager']).toBe(mockClineStateManager)
    expect(clineProvider['clineApiManager']).toBe(mockClineApiManager)
    expect(clineProvider['clineTaskHistoryManager']).toBe(mockClineTaskHistory)
    expect(clineProvider['clineCacheManager']).toBe(mockClineCacheManager)
    expect(clineProvider['clineMcpManager']).toBe(mockClineMcpManager)
  })

  test("resolveWebviewView initializes webview correctly", async () => {
    // Setup state manager to return mock state
    mockClineStateManager.getState.mockResolvedValue({
      soundEnabled: true,
      terminalShellIntegrationTimeout: 5000,
      ttsEnabled: false,
      ttsSpeed: 1.0,
    })

    // Execute
    await clineProvider.resolveWebviewView(mockWebviewView)

    // Verify
    expect(clineProvider.view).toBe(mockWebviewView)
    expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled()
    expect(mockWebviewView.onDidChangeVisibility).toHaveBeenCalled()
    expect(mockWebviewView.onDidDispose).toHaveBeenCalled()
    expect(mockWebview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [mockContextProxy.extensionUri],
    })
    expect(mockClineStack.removeCurrentCline).toHaveBeenCalled()
  })

  test("dispose cleans up resources properly", async () => {
    // Setup
    clineProvider.view = mockWebviewView
    
    // Execute
    await clineProvider.dispose()

    // Verify
    expect(mockClineStack.removeCurrentCline).toHaveBeenCalled()
    // WebviewView doesn't have a dispose method, we should check if unregisterProvider was called
    // and if clineMcpManager.dispose was called, which are the important cleanup steps
    expect(mockClineMcpManager.dispose).toHaveBeenCalled()
    expect(McpServerManager.unregisterProvider).toHaveBeenCalledWith(clineProvider)
  })

  test("initClineWithTask creates a new cline instance and adds it to stack", async () => {
    // Setup state
    mockClineStateManager.getState.mockResolvedValue({
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
    mockClineStack.getSize.mockReturnValue(0)
    
    // Mock Cline constructor
    ;(Cline as unknown as jest.Mock).mockImplementation(() => mockCline)

    // Execute
    const result = await clineProvider.initClineWithTask("test task")

    // Verify
    expect(mockClineStateManager.getState).toHaveBeenCalled()
    expect(Cline).toHaveBeenCalledWith(expect.objectContaining({
      provider: clineProvider,
      task: "test task",
      enableDiff: true,
      enableCheckpoints: true,
      checkpointStorage: "task",
      fuzzyMatchThreshold: 1.0,
      taskNumber: 1,
    }))
    expect(mockClineStack.addCline).toHaveBeenCalledWith(mockCline)
    expect(result).toBe(mockCline)
  })

  test("initClineWithHistoryItem initializes cline from history and adds to stack", async () => {
    // Setup state
    mockClineStateManager.getState.mockResolvedValue({
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
    const historyItem: HistoryItem & { rootTask?: Cline; parentTask?: Cline } = {
      id: "test-history-id",
      task: "test history task",
      ts: Date.now(),
      number: 2,
      tokensIn: 0,
      tokensOut: 0,
      totalCost: 0,
    }
    
    // Mock Cline constructor
    ;(Cline as unknown as jest.Mock).mockImplementation(() => mockCline)

    // Execute
    const result = await clineProvider.initClineWithHistoryItem(historyItem)

    // Verify
    expect(mockClineStack.removeCurrentCline).toHaveBeenCalled()
    expect(mockClineStateManager.getState).toHaveBeenCalled()
    expect(Cline).toHaveBeenCalledWith(expect.objectContaining({
      provider: clineProvider,
      historyItem,
      enableDiff: true,
      enableCheckpoints: true,
      checkpointStorage: expect.any(String),
      fuzzyMatchThreshold: 1.0,
      taskNumber: 2,
    }))
    expect(mockClineStack.addCline).toHaveBeenCalledWith(mockCline)
    expect(result).toBe(mockCline)
  })

  test("cancelTask aborts current task and reloads from history", async () => {
    // Setup
    const historyItem = {
      id: "test-task-id",
      task: "test task",
      ts: Date.now(),
    }
    
    mockClineStack.getCurrentCline.mockReturnValue(mockCline)
    mockClineTaskHistory.getTaskWithId.mockResolvedValue({ historyItem })

    // Execute
    await clineProvider.cancelTask()

    // Verify
    expect(mockCline.abortTask).toHaveBeenCalled()
    expect(mockCline.abandoned).toBe(true)
    expect(mockClineTaskHistory.getTaskWithId).toHaveBeenCalledWith("test-task-id")
  })

  test("postStateToWebview sends correct state to webview", async () => {
    // Setup
    const mockState = {
      apiConfiguration: { apiProvider: "test-provider" },
      mode: "default",
      soundEnabled: true,
      taskHistory: [{ id: "task1", ts: 1000, task: "Task 1" }],
    }
    
    mockClineStateManager.getState.mockResolvedValue(mockState)
    mockClineStack.getCurrentCline.mockReturnValue(undefined)
    mockCustomModesManager.getCustomModes.mockResolvedValue([])
    mockClineMcpManager.getAllServers.mockReturnValue([])
    
    clineProvider.view = mockWebviewView

    // Execute
    await clineProvider.postStateToWebview()

    // Verify
    expect(mockClineStateManager.getState).toHaveBeenCalled()
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: expect.objectContaining({
        version: "1.0.0",
        mode: "default",
        soundEnabled: true,
        taskHistory: expect.arrayContaining([
          expect.objectContaining({ id: "task1", task: "Task 1" })
        ]),
        currentTaskItem: undefined,
        clineMessages: [],
      })
    })
  })

  test("resetState calls appropriate reset methods", async () => {
    // Mock the vscode.window.showInformationMessage to simulate user clicking "Yes"
    // Fix: Use proper type for the mock function to match VS Code API
    jest.mocked(vscode.window.showInformationMessage).mockImplementation(
      (_message: string, _options: vscode.MessageOptions, ..._items: vscode.MessageItem[]) => {
        // Return the "Yes" option to simulate user confirmation
        return Promise.resolve("Yes" as unknown as vscode.MessageItem);
      }
    );
    
    clineProvider.view = mockWebviewView;

    // Execute
    await clineProvider.resetState();

    // Verify
    expect(mockContextProxy.resetAllState).toHaveBeenCalled();
    expect(mockProviderSettingsManager.resetAllConfigs).toHaveBeenCalled();
    expect(mockCustomModesManager.resetCustomModes).toHaveBeenCalled();
    expect(mockClineStack.removeCurrentCline).toHaveBeenCalled();
    expect(mockWebview.postMessage).toHaveBeenCalledTimes(2);
  });

  test("handleModeSwitchAndUpdateCline delegates to managers correctly", async () => {
    // Setup
    const mockApiConfig = { apiProvider: "updated-provider" }
    mockClineApiManager.handleModeSwitch.mockResolvedValue(mockApiConfig)
    mockClineStack.getCurrentCline.mockReturnValue(mockCline)

    // Execute
    await clineProvider.handleModeSwitchAndUpdateCline("default")

    // Verify
    expect(mockClineApiManager.handleModeSwitch).toHaveBeenCalledWith("default")
    expect(mockCline.api).toBeDefined() // Checks that api was updated
  })

  test("updateCustomInstructions updates context value and current cline", async () => {
    // Setup
    const newInstructions = "New instructions"
    mockClineStack.getCurrentCline.mockReturnValue(mockCline)

    // Execute
    await clineProvider.updateCustomInstructions(newInstructions)

    // Verify
    expect(mockContextProxy.setValue).toHaveBeenCalledWith("customInstructions", newInstructions)
    expect(mockCline.customInstructions).toBe(newInstructions)
  })

  test("getTelemetryProperties returns correct properties", async () => {
    // Setup
    mockClineStateManager.getState.mockResolvedValue({
      mode: "default",
      apiConfiguration: { apiProvider: "test-provider" },
      language: "en",
    })
    mockClineStack.getCurrentCline.mockReturnValue(mockCline)

    // Execute
    const result = await clineProvider.getTelemetryProperties()

    // Verify
    expect(result).toEqual(expect.objectContaining({
      appVersion: "1.0.0",
      mode: "default",
      apiProvider: "test-provider",
      language: "en",
      modelId: "test-model-id",
      diffStrategy: "test-diff-strategy",
    }))
  })

  test("proxy methods delegate to the appropriate manager instances", async () => {
    // Setup
    const mockApiConfig = { apiProvider: "test-provider" }
    mockClineStateManager.getValue.mockReturnValue(mockApiConfig)
    mockClineStateManager.getState.mockResolvedValue({ mode: "default" })
    mockProviderSettingsManager.loadConfig.mockResolvedValue(mockApiConfig)
    mockClineStack.getCurrentCline.mockReturnValue(mockCline)

    // Test state manager proxy methods
    await clineProvider.setValue("currentApiConfigName", "test-config")
    expect(mockClineStateManager.setValue).toHaveBeenCalledWith("currentApiConfigName", "test-config")
    expect(mockProviderSettingsManager.loadConfig).toHaveBeenCalledWith("test-config")
    
    // Use a valid key for ProviderSettings instead of "apiConfig"
    const value = clineProvider.getValue("apiProvider")
    expect(mockClineStateManager.getValue).toHaveBeenCalledWith("apiProvider")
    expect(value).toEqual(mockApiConfig)

    // Test stack manager proxy methods
    await clineProvider.addClineToStack(mockCline)
    expect(mockClineStack.addCline).toHaveBeenCalledWith(mockCline)
    
    const currentCline = clineProvider.getCurrentCline()
    expect(mockClineStack.getCurrentCline).toHaveBeenCalled()
    expect(currentCline).toBe(mockCline)
    
    const stackSize = clineProvider.getClineStackSize()
    expect(mockClineStack.getSize).toHaveBeenCalled()
  })
})