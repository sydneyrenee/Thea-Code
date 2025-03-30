// Extracted from src/core/webview/ClineProvider-original.ts

import { getOpenAiModels } from "../../../api/providers/openai";
import { getOpenRouterModels } from "../../../api/providers/openrouter";
import { getGlamaModels } from "../../../api/providers/glama";
import { getUnboundModels } from "../../../api/providers/unbound";
import { getRequestyModels } from "../../../api/providers/requesty";
import { getOllamaModels } from "../../../api/providers/ollama";
import { getVsCodeLmModels } from "../../../api/providers/vscode-lm";
import { getLmStudioModels } from "../../../api/providers/lmstudio";
import * as vscode from 'vscode'
import axios from 'axios'
import { ApiConfiguration, ApiProvider, ModelInfo, API_CONFIG_KEYS, openRouterDefaultModelId, openRouterDefaultModelInfo, glamaDefaultModelId, glamaDefaultModelInfo, requestyDefaultModelId, requestyDefaultModelInfo } from "../../../shared/api"
import { buildApiHandler } from "../../../api"
import { ContextProxy } from "../../contextProxy"
import { Mode } from "../../../shared/modes"
import { ConfigManager } from "../../config/ConfigManager"
import { t } from "../../../i18n"
import { SECRET_KEYS, SecretKey, GlobalStateKey } from "../../../shared/globalState"

/**
 * Manages API configurations and API handlers
 */
export class ClineApiManager {
    private contextProxy: ContextProxy
    private configManager: ConfigManager
    private outputChannel: vscode.OutputChannel

    constructor(
        private readonly context: vscode.ExtensionContext,
        outputChannel?: vscode.OutputChannel
    ) {
        this.contextProxy = new ContextProxy(context)
        this.configManager = new ConfigManager(context)
        this.outputChannel = outputChannel || vscode.window.createOutputChannel("ClineApiManager")
    }

    /**
     * Updates the API configuration in global state
     */
    async updateApiConfiguration(apiConfiguration: ApiConfiguration): Promise<void> {
        // Update mode's default config.
        const currentMode = await this.contextProxy.getGlobalState("mode")
        
        if (currentMode && typeof currentMode === 'string') { // Ensure currentMode is a string
            const currentApiConfigName = await this.contextProxy.getGlobalState("currentApiConfigName")
            const listApiConfig = await this.configManager.listConfig()
            const config = listApiConfig?.find((c) => c.name === currentApiConfigName)

            if (config && typeof config.id === 'string') {
                await this.configManager.setModeConfig(currentMode, config.id)
            }
        }
        
        await this.contextProxy.setApiConfiguration(apiConfiguration)
    }

    /**
     * Builds an API handler from the given configuration
     */
    buildApiHandler(apiConfiguration: ApiConfiguration) {
        return buildApiHandler(apiConfiguration)
    }
    
    /**
     * Handle switching to a new mode, updating the associated API configuration
     * @param newMode The mode to switch to
     */
    async handleModeSwitch(newMode: Mode): Promise<void> {
        await this.contextProxy.updateGlobalState("mode", newMode)

        // Load the saved API config for the new mode if it exists
        const savedConfigId = await this.configManager.getModeConfigId(newMode)
        const listApiConfig = await this.configManager.listConfig()

        // Update listApiConfigMeta first to ensure UI has latest data
        await this.contextProxy.updateGlobalState("listApiConfigMeta", listApiConfig)

        // If this mode has a saved config, use it
        if (savedConfigId) {
            const config = listApiConfig?.find((c) => c.id === savedConfigId)
            if (config?.name) {
                const apiConfig = await this.configManager.loadConfig(config.name)
                await Promise.all([
                    this.contextProxy.updateGlobalState("currentApiConfigName", config.name),
                    this.updateApiConfiguration(apiConfig),
                ])
            }
        } else {
            // If no saved config for this mode, save current config as default
            const currentApiConfigName = await this.contextProxy.getGlobalState("currentApiConfigName")
            if (currentApiConfigName) {
                const config = listApiConfig?.find((c) => c.name === currentApiConfigName)
                if (config?.id) {
                    await this.configManager.setModeConfig(newMode, config.id)
                }
            }
        }
    }
    
    /**
     * Save or update an API configuration
     */
    async upsertApiConfiguration(configName: string, apiConfiguration: ApiConfiguration): Promise<void> {
        try {
            await this.configManager.saveConfig(configName, apiConfiguration)
            const listApiConfig = await this.configManager.listConfig()

            await Promise.all([
                this.contextProxy.updateGlobalState("listApiConfigMeta", listApiConfig),
                this.updateApiConfiguration(apiConfiguration),
                this.contextProxy.updateGlobalState("currentApiConfigName", configName),
            ])
        } catch (error) {
            console.error("Error creating new API configuration:", error)
            throw error;
        }
    }

    /**
     * Handles OAuth callback from OpenRouter
     */
    async handleOpenRouterCallback(code: string): Promise<void> {
        const { apiConfiguration, currentApiConfigName } = await this.getState()

        let apiKey: string
        try {
            const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1"
            // Extract the base domain for the auth endpoint
            const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"
            const response = await axios.post(`${baseUrlDomain}/api/v1/auth/keys`, { code })
            if (response.data && response.data.key) {
                apiKey = response.data.key
            } else {
                throw new Error("Invalid response from OpenRouter API")
            }
        } catch (error) {
            this.outputChannel.appendLine(
                `Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`
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
    }

    /**
     * Handles OAuth callback from Glama
     */
    async handleGlamaCallback(code: string): Promise<void> {
        let apiKey: string
        try {
            const response = await axios.post("https://glama.ai/api/gateway/v1/auth/exchange-code", { code })
            if (response.data && response.data.apiKey) {
                apiKey = response.data.apiKey
            } else {
                throw new Error("Invalid response from Glama API")
            }
        } catch (error) {
            this.outputChannel.appendLine(
                `Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`
            )
            throw error
        }

        const { apiConfiguration, currentApiConfigName } = await this.getState()

        const newConfiguration: ApiConfiguration = {
            ...apiConfiguration,
            apiProvider: "glama",
            glamaApiKey: apiKey,
            glamaModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
            glamaModelInfo: apiConfiguration?.glamaModelInfo || glamaDefaultModelInfo,
        }

        await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
    }

    /**
     * Handles callback from Requesty
     */
    async handleRequestyCallback(code: string): Promise<void> {
        const { apiConfiguration, currentApiConfigName } = await this.getState()

        const newConfiguration: ApiConfiguration = {
            ...apiConfiguration,
            apiProvider: "requesty",
            requestyApiKey: code,
            requestyModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
            requestyModelInfo: apiConfiguration?.requestyModelInfo || requestyDefaultModelInfo,
        }

        await this.upsertApiConfiguration(currentApiConfigName, newConfiguration)
    }

    /**
     * Gets model providers and their models
     */
    async getApiProviders(): Promise<Record<string, any>> {
        return {
            openai: await getOpenAiModels(),
            anthropic: [], // Default anthropic models are loaded directly
            openrouter: await getOpenRouterModels(this.outputChannel),
            glama: await getGlamaModels(this.outputChannel),
            unbound: await getUnboundModels(this.outputChannel),
            requesty: await getRequestyModels(this.outputChannel),
            ollama: await getOllamaModels(this.outputChannel),
            "vscode-lm": await getVsCodeLmModels(this.outputChannel),
            lmstudio: await getLmStudioModels(this.outputChannel)
        };
    }

    /**
     * Gets the current state containing apiConfiguration
     */
    private async getState(): Promise<{apiConfiguration: ApiConfiguration, currentApiConfigName: string}> {
        // Create an object to store all fetched values
        const stateValues: Record<GlobalStateKey | SecretKey, any> = {} as Record<GlobalStateKey | SecretKey, any>;
        const secretValues: Record<SecretKey, any> = {} as Record<SecretKey, any>;

        // Create promise arrays for global state and secrets relevant to API config
        const statePromises = API_CONFIG_KEYS.map(key => this.contextProxy.getGlobalState(key));
        const secretPromises = SECRET_KEYS.map(key => this.contextProxy.getSecret(key));

        // Fetch currentApiConfigName separately
        const currentApiConfigNamePromise = this.contextProxy.getGlobalState("currentApiConfigName");

        // Await all promises
        const [stateResults, secretResults, currentApiConfigNameResult] = await Promise.all([
            Promise.all(statePromises),
            Promise.all(secretPromises),
            currentApiConfigNamePromise
        ]);

        // Populate stateValues and secretValues
        API_CONFIG_KEYS.forEach((key, index) => {
            stateValues[key] = stateResults[index];
        });
        SECRET_KEYS.forEach((key, index) => {
            secretValues[key] = secretResults[index];
        });

        // Build the apiConfiguration object
        const apiConfiguration: ApiConfiguration = {
            ...Object.fromEntries(API_CONFIG_KEYS.map((key) => [key, stateValues[key]])),
            ...secretValues,
        };
        
        // Ensure apiProvider is set properly if not already in state
        if (!apiConfiguration.apiProvider) {
            // Determine default apiProvider if necessary (e.g., "anthropic")
             apiConfiguration.apiProvider = "anthropic"; // Or fetch default if stored elsewhere
        }

        return {
            apiConfiguration,
            // Ensure currentApiConfigNameResult is treated as string | undefined before defaulting
            currentApiConfigName: typeof currentApiConfigNameResult === 'string' ? currentApiConfigNameResult : "default"
        };
    }
}
