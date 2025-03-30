// Extracted from src/core/webview/ClineProvider-original.ts

import * as vscode from 'vscode'
import { GlobalStateKey, SecretKey, ConfigurationValues, SECRET_KEYS, GLOBAL_STATE_KEYS } from "../../../shared/globalState"
import { ApiConfiguration, ApiProvider, API_CONFIG_KEYS } from "../../../shared/api"
import { Mode, defaultModeSlug, ModeConfig } from "../../../shared/modes"
import { experimentDefault } from "../../../shared/experiments"
import { formatLanguage } from "../../../shared/language"
import { ContextProxy } from "../../contextProxy"
import { TERMINAL_SHELL_INTEGRATION_TIMEOUT } from "../../../integrations/terminal/Terminal"

/**
 * Manages global state for the Cline provider
 */
export class ClineStateManager {
    private contextProxy: ContextProxy
    // Define the property explicitly
    public getCustomModes?: () => Promise<ModeConfig[] | undefined>

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.contextProxy = new ContextProxy(context)
    }

    /**
     * Gets the complete state from both global state and secrets
     */
    async getState() {
        try {
            // Create an object to store all fetched values
            const stateValues: Record<GlobalStateKey | SecretKey, any> = {} as Record<GlobalStateKey | SecretKey, any>
            const secretValues: Record<SecretKey, any> = {} as Record<SecretKey, any>

            // Create promise arrays for global state and secrets
            const statePromises = GLOBAL_STATE_KEYS.map((key) => this.getGlobalState(key))
            const secretPromises = SECRET_KEYS.map((key) => this.getSecret(key))

            // Add promise for custom modes which is handled separately
            const customModesPromise = this.getCustomModes?.()

            let idx = 0
            const valuePromises = customModesPromise 
                ? await Promise.all([...statePromises, ...secretPromises, customModesPromise])
                : await Promise.all([...statePromises, ...secretPromises])

            // Populate stateValues and secretValues
            GLOBAL_STATE_KEYS.forEach((key, _) => {
                stateValues[key] = valuePromises[idx]
                idx = idx + 1
            })

            SECRET_KEYS.forEach((key, index) => {
                secretValues[key] = valuePromises[idx]
                idx = idx + 1
            })

            let customModes
            if (customModesPromise) {
                customModes = valuePromises[idx]
            }

            // Determine apiProvider with the same logic as before
            let apiProvider: ApiProvider
            if (stateValues.apiProvider) {
                apiProvider = stateValues.apiProvider
            } else {
                apiProvider = "anthropic"
            }

            // Build the apiConfiguration object combining state values and secrets
            // Using the dynamic approach with API_CONFIG_KEYS
            const apiConfiguration: ApiConfiguration = {
                // Dynamically add all API-related keys from stateValues
                ...Object.fromEntries(API_CONFIG_KEYS.map((key) => [key, stateValues[key]])),
                // Add all secrets
                ...secretValues,
            }

            // Ensure apiProvider is set properly if not already in state
            if (!apiConfiguration.apiProvider) {
                apiConfiguration.apiProvider = apiProvider
            }

            // Return the complete state including all settings
            return {
                apiConfiguration,
                lastShownAnnouncementId: stateValues.lastShownAnnouncementId,
                customInstructions: stateValues.customInstructions,
                alwaysAllowReadOnly: stateValues.alwaysAllowReadOnly ?? false,
                alwaysAllowReadOnlyOutsideWorkspace: stateValues.alwaysAllowReadOnlyOutsideWorkspace ?? false,
                alwaysAllowWrite: stateValues.alwaysAllowWrite ?? false,
                alwaysAllowWriteOutsideWorkspace: stateValues.alwaysAllowWriteOutsideWorkspace ?? false,
                alwaysAllowExecute: stateValues.alwaysAllowExecute ?? false,
                alwaysAllowBrowser: stateValues.alwaysAllowBrowser ?? false,
                alwaysAllowMcp: stateValues.alwaysAllowMcp ?? false,
                alwaysAllowModeSwitch: stateValues.alwaysAllowModeSwitch ?? false,
                alwaysAllowSubtasks: stateValues.alwaysAllowSubtasks ?? false,
                taskHistory: stateValues.taskHistory,
                allowedCommands: stateValues.allowedCommands,
                soundEnabled: stateValues.soundEnabled ?? false,
                ttsEnabled: stateValues.ttsEnabled ?? false,
                ttsSpeed: stateValues.ttsSpeed ?? 1.0,
                diffEnabled: stateValues.diffEnabled ?? true,
                enableCheckpoints: stateValues.enableCheckpoints ?? true,
                checkpointStorage: stateValues.checkpointStorage ?? "task",
                soundVolume: stateValues.soundVolume,
                browserViewportSize: stateValues.browserViewportSize ?? "900x600",
                screenshotQuality: stateValues.screenshotQuality ?? 75,
                remoteBrowserHost: stateValues.remoteBrowserHost,
                remoteBrowserEnabled: stateValues.remoteBrowserEnabled ?? false,
                fuzzyMatchThreshold: stateValues.fuzzyMatchThreshold ?? 1.0,
                writeDelayMs: stateValues.writeDelayMs ?? 1000,
                terminalOutputLineLimit: stateValues.terminalOutputLineLimit ?? 500,
                terminalShellIntegrationTimeout:
                    stateValues.terminalShellIntegrationTimeout ?? TERMINAL_SHELL_INTEGRATION_TIMEOUT,
                mode: stateValues.mode ?? defaultModeSlug,
                language: stateValues.language ?? formatLanguage(vscode.env.language),
                mcpEnabled: stateValues.mcpEnabled ?? true,
                enableMcpServerCreation: stateValues.enableMcpServerCreation ?? true,
                alwaysApproveResubmit: stateValues.alwaysApproveResubmit ?? false,
                requestDelaySeconds: Math.max(5, stateValues.requestDelaySeconds ?? 10),
                rateLimitSeconds: stateValues.rateLimitSeconds ?? 0,
                currentApiConfigName: stateValues.currentApiConfigName ?? "default",
                listApiConfigMeta: stateValues.listApiConfigMeta ?? [],
                modeApiConfigs: stateValues.modeApiConfigs ?? ({} as Record<Mode, string>),
                customModePrompts: stateValues.customModePrompts ?? {},
                customSupportPrompts: stateValues.customSupportPrompts ?? {},
                enhancementApiConfigId: stateValues.enhancementApiConfigId,
                experiments: stateValues.experiments ?? experimentDefault,
                autoApprovalEnabled: stateValues.autoApprovalEnabled ?? false,
                customModes,
                maxOpenTabsContext: stateValues.maxOpenTabsContext ?? 20,
                maxWorkspaceFiles: stateValues.maxWorkspaceFiles ?? 200,
                openRouterUseMiddleOutTransform: stateValues.openRouterUseMiddleOutTransform ?? true,
                browserToolEnabled: stateValues.browserToolEnabled ?? true,
                telemetrySetting: stateValues.telemetrySetting || "unset",
                showRooIgnoredFiles: stateValues.showRooIgnoredFiles ?? true,
                maxReadFileLine: stateValues.maxReadFileLine ?? 500,
            }
        } catch (error) {
            console.error(`Error getting state: ${error instanceof Error ? error.message : String(error)}`)
            // Return a minimal default state
            return {
                apiConfiguration: { apiProvider: "anthropic" as ApiProvider },
                mode: defaultModeSlug,
                language: formatLanguage(vscode.env.language),
            }
        }
    }

    /**
     * Updates a value in the global state
     */
    async updateGlobalState(key: GlobalStateKey, value: any): Promise<void> {
        return this.contextProxy.updateGlobalState(key, value)
    }

    /**
     * Gets a value from the global state
     */
    async getGlobalState(key: GlobalStateKey): Promise<any> {
        return this.contextProxy.getGlobalState(key)
    }

    /**
     * Gets a secret value
     */
    private async getSecret(key: SecretKey): Promise<string | undefined> {
        return this.contextProxy.getSecret(key)
    }
    
    /**
     * Sets multiple values at once
     */
    async setValues(values: Partial<ConfigurationValues>): Promise<void> {
        return this.contextProxy.setValues(values)
    }
    
    /**
     * Stores a secret value
     */
    async storeSecret(key: SecretKey, value?: string): Promise<void> {
        await this.contextProxy.storeSecret(key, value)
    }
    
    /**
     * Reference to get custom modes - will be injected by ClineProvider
     */
}
