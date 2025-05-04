import * as vscode from "vscode"
import axios from "axios"
import { TheaApiManager } from "../api/TheaApiManager"
import { ContextProxy } from "../../config/ContextProxy"
import { ProviderSettingsManager } from "../../config/ProviderSettingsManager"
import {
	openRouterDefaultModelId,
	openRouterDefaultModelInfo,
	glamaDefaultModelId,
	glamaDefaultModelInfo,
	requestyDefaultModelId,
	requestyDefaultModelInfo,
} from "../../../shared/api"

// Mock dependencies
jest.mock("vscode")
jest.mock("axios")
jest.mock("../../config/ContextProxy")
jest.mock("../../config/ProviderSettingsManager")
jest.mock("../../../api")
jest.mock("../../../services/telemetry/TelemetryService")

describe("ClineApiManager", () => {
	let manager: TheaApiManager
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockContextProxy: jest.Mocked<ContextProxy>
	let mockProviderSettingsManager: jest.Mocked<ProviderSettingsManager>

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

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

		// Mock output channel
		mockOutputChannel = {
			appendLine: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
		} as unknown as vscode.OutputChannel

		// Mock context proxy
		mockContextProxy = {
			getValue: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
			setValue: jest.fn().mockImplementation(() => Promise.resolve()),
			getProviderSettings: jest.fn().mockImplementation(() => ({})),
			setProviderSettings: jest.fn().mockImplementation(() => Promise.resolve()),
		} as unknown as jest.Mocked<ContextProxy>

		// Mock provider settings manager
		mockProviderSettingsManager = {
			getModeConfigId: jest.fn(),
			setModeConfig: jest.fn(),
			listConfig: jest.fn(),
			loadConfig: jest.fn(),
			saveConfig: jest.fn(),
		} as unknown as jest.Mocked<ProviderSettingsManager>

		// Create instance of ClineApiManager
		manager = new TheaApiManager(
			mockContext,
			mockOutputChannel,
			mockContextProxy,
			mockProviderSettingsManager
		)
	})

	test("updateApiConfiguration updates mode config association", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "openrouter" as const }
		mockContextProxy.getValue.mockImplementation(async (key) => {
			if (key === "mode") return "code"
			if (key === "currentApiConfigName") return "test-config"
			return undefined
		})
		mockProviderSettingsManager.listConfig.mockResolvedValue([
			{ name: "test-config", id: "test-id", apiProvider: "openrouter" },
		])

		// Execute
		await manager.updateApiConfiguration(mockApiConfig)

		// Verify
		expect(mockProviderSettingsManager.setModeConfig).toHaveBeenCalledWith("code", "test-id")
		expect(mockContextProxy.setProviderSettings).toHaveBeenCalledWith(mockApiConfig)
	})

	test("handleModeSwitch loads saved config for mode", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "anthropic" as const }
		mockProviderSettingsManager.getModeConfigId.mockResolvedValue("saved-config-id")
		mockProviderSettingsManager.listConfig.mockResolvedValue([
			{ name: "saved-config", id: "saved-config-id", apiProvider: "anthropic" },
		])
		mockProviderSettingsManager.loadConfig.mockResolvedValue(mockApiConfig)

		// Execute
		const result = await manager.handleModeSwitch("architect")

		// Verify
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("mode", "architect")
		expect(mockProviderSettingsManager.getModeConfigId).toHaveBeenCalledWith("architect")
		expect(mockProviderSettingsManager.loadConfig).toHaveBeenCalledWith("saved-config")
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("currentApiConfigName", "saved-config")
		expect(result).toEqual(mockApiConfig)
	})

	test("handleModeSwitch saves current config when no saved config exists", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "anthropic" as const }
		mockProviderSettingsManager.getModeConfigId.mockResolvedValue(undefined)
		mockProviderSettingsManager.listConfig.mockResolvedValue([
			{ name: "current-config", id: "current-id", apiProvider: "anthropic" },
		])
		mockContextProxy.getValue.mockImplementation(async () => "current-config")
		mockProviderSettingsManager.loadConfig.mockResolvedValue(mockApiConfig)

		// Execute
		await manager.handleModeSwitch("architect")

		// Verify
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("mode", "architect")
		expect(mockProviderSettingsManager.setModeConfig).toHaveBeenCalledWith("architect", "current-id")
	})

	test("upsertApiConfiguration saves config and updates state", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "anthropic" as const }
		mockProviderSettingsManager.listConfig.mockResolvedValue([
			{ name: "test-config", id: "test-id", apiProvider: "anthropic" },
		])

		// Mock the imported buildApiHandler function
		const { buildApiHandler } = require("../../../api")
		buildApiHandler.mockReturnValue({})

		// Execute
		await manager.upsertApiConfiguration("test-config", mockApiConfig)

		// Verify
		expect(mockProviderSettingsManager.saveConfig).toHaveBeenCalledWith("test-config", mockApiConfig)
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("listApiConfigMeta", [
			{ name: "test-config", id: "test-id", apiProvider: "anthropic" },
		])
		expect(mockContextProxy.setValue).toHaveBeenCalledWith("currentApiConfigName", "test-config")
		expect(mockContextProxy.setProviderSettings).toHaveBeenCalledWith(mockApiConfig)
		expect(buildApiHandler).toHaveBeenCalledWith(mockApiConfig)
	})

	test("upsertApiConfiguration handles errors gracefully", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "anthropic" as const }
		mockProviderSettingsManager.saveConfig.mockRejectedValue(new Error("Failed to save config"))
		
		// Mock window.showErrorMessage
		vscode.window.showErrorMessage = jest.fn()

		// Execute & Verify
		await expect(manager.upsertApiConfiguration("test-config", mockApiConfig)).rejects.toThrow()
		expect(mockOutputChannel.appendLine).toHaveBeenCalled()
		expect(vscode.window.showErrorMessage).toHaveBeenCalled()
	})

	test("handleOpenRouterCallback exchanges code for API key and updates config", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "openrouter" as const }
		mockContextProxy.getProviderSettings.mockImplementation(() => mockApiConfig)
		mockContextProxy.getValue.mockImplementation(() => Promise.resolve("default"))
		
		// Mock axios response
		;(axios.post as jest.Mock).mockResolvedValue({
			data: { key: "test-api-key" },
		})

		// Mock upsertApiConfiguration method
		manager.upsertApiConfiguration = jest.fn().mockResolvedValue(undefined)

		// Execute
		await manager.handleOpenRouterCallback("test-code")

		// Verify
		expect(axios.post).toHaveBeenCalledWith("https://openrouter.ai/api/v1/auth/keys", { code: "test-code" })
		expect(manager.upsertApiConfiguration).toHaveBeenCalledWith(
			"default",
			{
				...mockApiConfig,
				apiProvider: "openrouter",
				openRouterApiKey: "test-api-key",
				openRouterModelId: openRouterDefaultModelId,
				openRouterModelInfo: openRouterDefaultModelInfo,
			}
		)
	})

	test("handleGlamaCallback exchanges code for API key and updates config", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "glama" as const }
		mockContextProxy.getProviderSettings.mockImplementation(() => mockApiConfig)
		mockContextProxy.getValue.mockImplementation(() => Promise.resolve("default"))
		
		// Mock axios response
		;(axios.post as jest.Mock).mockResolvedValue({
			data: { apiKey: "test-api-key" },
		})

		// Mock upsertApiConfiguration method
		manager.upsertApiConfiguration = jest.fn().mockResolvedValue(undefined)

		// Execute
		await manager.handleGlamaCallback("test-code")

		// Verify
		expect(axios.post).toHaveBeenCalledWith("https://glama.ai/api/gateway/v1/auth/exchange-code", { code: "test-code" })
		expect(manager.upsertApiConfiguration).toHaveBeenCalledWith(
			"default",
			{
				...mockApiConfig,
				apiProvider: "glama",
				glamaApiKey: "test-api-key",
				glamaModelId: glamaDefaultModelId,
				glamaModelInfo: glamaDefaultModelInfo,
			}
		)
	})

	test("handleRequestyCallback updates config with provided code as API key", async () => {
		// Setup
		const mockApiConfig = { apiProvider: "requesty" as const }
		mockContextProxy.getProviderSettings.mockImplementation(() => mockApiConfig)
		mockContextProxy.getValue.mockImplementation(() => Promise.resolve("default"))

		// Mock upsertApiConfiguration method
		manager.upsertApiConfiguration = jest.fn().mockResolvedValue(undefined)

		// Execute
		await manager.handleRequestyCallback("test-api-key")

		// Verify
		expect(manager.upsertApiConfiguration).toHaveBeenCalledWith(
			"default",
			{
				...mockApiConfig,
				apiProvider: "requesty",
				requestyApiKey: "test-api-key",
				requestyModelId: requestyDefaultModelId,
				requestyModelInfo: requestyDefaultModelInfo,
			}
		)
	})

	test("buildApiHandler calls the global buildApiHandler function", () => {
		// Setup
		const mockApiConfig = { apiProvider: "openrouter" as const }
		const mockApiHandler = { getModel: jest.fn() }
		const { buildApiHandler } = require("../../../api")
		buildApiHandler.mockReturnValue(mockApiHandler)

		// Execute
		const result = manager.buildApiHandler(mockApiConfig)

		// Verify
		expect(buildApiHandler).toHaveBeenCalledWith(mockApiConfig)
		expect(result).toBe(mockApiHandler)
	})
})