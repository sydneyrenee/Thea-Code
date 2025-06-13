import * as vscode from "vscode"
import axios from "axios"

import { ContextProxy } from "../../config/ContextProxy" // Adjusted path
import { ProviderSettingsManager } from "../../config/ProviderSettingsManager" // Adjusted path
import {
	ApiConfiguration,
	openRouterDefaultModelId,
	openRouterDefaultModelInfo,
	glamaDefaultModelId,
	glamaDefaultModelInfo,
	requestyDefaultModelId,
	requestyDefaultModelInfo,
	// ProviderSettings is imported from schemas and re-exported as ApiConfiguration below
} from "../../../shared/api" // Adjusted path
import { Mode } from "../../../shared/modes" // Adjusted path
import { buildApiHandler as globalBuildApiHandler } from "../../../api" // Renamed import
import { t } from "../../../i18n" // Adjusted path

/**
 * Manages API configurations, authentication callbacks, and related logic.
 */
export class TheaApiManager {
	// Renamed class

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly contextProxy: ContextProxy,
		private readonly providerSettingsManager: ProviderSettingsManager,
	) {}

	/**
	 * Updates the API configuration settings and mode association.
	 * Note: Does not update the active TheaTask instance's API handler directly. That is the responsibility of the calling TheaProvider.
	 */
	async updateApiConfiguration(apiConfiguration: ApiConfiguration): Promise<void> {
		const mode = this.contextProxy.getValue("mode") // Get mode via contextProxy

		if (mode) {
			const currentApiConfigName = this.contextProxy.getValue("currentApiConfigName")
			const listApiConfig = await this.providerSettingsManager.listConfig()
			const config = listApiConfig?.find((c) => c.name === currentApiConfigName)

			if (config?.id) {
				await this.providerSettingsManager.setModeConfig(mode, config.id)
			}
		}

		await this.contextProxy.setProviderSettings(apiConfiguration)
		// Removed updating current TheaTask's API handler - TheaProvider should do this
	}

	/**
	 * Handle switching to a new mode, including updating the associated API configuration.
	 * Note: Does not post state to webview.
	 */
	public async handleModeSwitch(newMode: Mode): Promise<ApiConfiguration | undefined> {
		// Return the config to load
		// Telemetry capture removed - should be handled by TheaProvider which has taskId
		// telemetryService.captureModeSwitch(currentTaskId, newMode)

		await this.contextProxy.setValue("mode", newMode)

		const savedConfigId = await this.providerSettingsManager.getModeConfigId(newMode)
		const listApiConfig = await this.providerSettingsManager.listConfig()

		// Update listApiConfigMeta first
		await this.contextProxy.setValue("listApiConfigMeta", listApiConfig)

		let apiConfigToLoad: ApiConfiguration | undefined = undefined

		if (savedConfigId) {
			const config = listApiConfig?.find((c) => c.id === savedConfigId)
			if (config?.name) {
				apiConfigToLoad = await this.providerSettingsManager.loadConfig(config.name)
				// Update state for the new config name
				await this.contextProxy.setValue("currentApiConfigName", config.name)
				// Update the general API configuration state - important for consistency
				await this.updateApiConfiguration(apiConfigToLoad)
			}
		} else {
			// If no saved config for this mode, associate the current config with this mode
			const currentApiConfigName = this.contextProxy.getValue("currentApiConfigName")
			if (currentApiConfigName) {
				const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
				if (config?.id) {
					await this.providerSettingsManager.setModeConfig(newMode, config.id)
					// Load the current config as the one to use
					apiConfigToLoad = await this.providerSettingsManager.loadConfig(currentApiConfigName)
					// Ensure the general API configuration state reflects this if it wasn't saved for the mode
					await this.updateApiConfiguration(apiConfigToLoad)
				}
			}
		}
		// Removed postStateToWebview - TheaProvider should do this
		return apiConfigToLoad // Return the config that should be active
	}

	/**
	 * Saves or updates an API configuration profile.
	 * Note: Does not post state to webview.
	 */
	async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration): Promise<void> {
		try {
			await this.providerSettingsManager.saveConfig(configName, apiConfiguration)
			const listApiConfig = await this.providerSettingsManager.listConfig()

			await Promise.all([
				this.contextProxy.setValue("listApiConfigMeta", listApiConfig),
				this.updateApiConfiguration(apiConfiguration), // Ensure main config state is updated
				this.contextProxy.setValue("currentApiConfigName", configName),
			])

			// Build API handler for the new configuration
			try {
				globalBuildApiHandler(apiConfiguration)
			} catch (error) {
				this.outputChannel.appendLine(
					`Warning: Could not build API handler for new configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				// Don't throw here, as we've already saved the config
			}

			// Removed postStateToWebview - TheaProvider should do this
		} catch (error) {
			this.outputChannel.appendLine(
				`Error upserting api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			vscode.window.showErrorMessage(t("common:errors.create_api_config"))
			// Re-throw or handle as appropriate for the manager's responsibility
			throw error
		}
	}

	/**
	 * Handles OAuth callback from OpenRouter.
	 */
	async handleOpenRouterCallback(code: string): Promise<void> {
		// Fetch only necessary parts instead of full getState()
		const apiConfiguration = this.contextProxy.getProviderSettings()
		const currentApiConfigName = this.contextProxy.getValue("currentApiConfigName") ?? "default"

		let apiKey: string
		try {
			const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1"
			const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"
			const response = await axios.post<{ key?: string }>(`${baseUrlDomain}/api/v1/auth/keys`, { code })
			if (response.data?.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			this.outputChannel.appendLine(
				`Error exchanging OpenRouter code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const newConfiguration: ApiConfiguration = {
			...apiConfiguration,
			apiProvider: "openrouter",
			openRouterApiKey: apiKey,
			openRouterModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
			openRouterModelInfo: apiConfiguration?.openRouterModelInfo || openRouterDefaultModelInfo,
		}

		await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
		// TheaProvider will call postStateToWebview
	}

	/**
	 * Handles OAuth callback from Glama.
	 */
	async handleGlamaCallback(code: string): Promise<void> {
		const apiConfiguration = this.contextProxy.getProviderSettings()
		const currentApiConfigName = this.contextProxy.getValue("currentApiConfigName") ?? "default"

		let apiKey: string
		try {
			const response = await axios.post<{ apiKey?: string }>(
				"https://glama.ai/api/gateway/v1/auth/exchange-code",
				{ code },
			)
			if (response.data?.apiKey) {
				apiKey = response.data.apiKey
			} else {
				throw new Error("Invalid response from Glama API")
			}
		} catch (error) {
			this.outputChannel.appendLine(
				`Error exchanging Glama code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			throw error
		}

		const newConfiguration: ApiConfiguration = {
			...apiConfiguration,
			apiProvider: "glama",
			glamaApiKey: apiKey,
			glamaModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
			glamaModelInfo: apiConfiguration?.glamaModelInfo || glamaDefaultModelInfo,
		}

		await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
		// TheaProvider will call postStateToWebview
	}

	/**
	 * Handles callback from Requesty.
	 */
	async handleRequestyCallback(code: string): Promise<void> {
		const apiConfiguration = this.contextProxy.getProviderSettings()
		const currentApiConfigName = this.contextProxy.getValue("currentApiConfigName") ?? "default"

		const newConfiguration: ApiConfiguration = {
			...apiConfiguration,
			apiProvider: "requesty",
			requestyApiKey: code, // Assuming the 'code' is the API key for Requesty
			requestyModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
			requestyModelInfo: apiConfiguration?.requestyModelInfo || requestyDefaultModelInfo,
		}

		await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
		// TheaProvider will call postStateToWebview
	}

	/**
	 * Builds an API handler instance using the global function. Accepts ApiConfiguration type.
	 */
	buildApiHandler(apiConfiguration: ApiConfiguration) {
		return globalBuildApiHandler(apiConfiguration)
	}
}
