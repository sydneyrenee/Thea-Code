import * as vscode from "vscode"
import * as os from "os" // Needed for getState osInfo

import { ContextProxy } from "../../config/ContextProxy"
import { ProviderSettingsManager } from "../../config/ProviderSettingsManager"
import { CustomModesManager } from "../../config/CustomModesManager"
import { GlobalState, TheaCodeSettings } from "../../../schemas"
import { Mode, ModeConfig, defaultModeSlug } from "../../../shared/modes"
import { ApiProvider } from "../../../shared/api"
import { formatLanguage } from "../../../shared/language"
import type { experimentDefault } from "../../../shared/experiments"
import type { TERMINAL_SHELL_INTEGRATION_TIMEOUT } from "../../../integrations/terminal/Terminal"

/**
 * Manages application state retrieval and updates.
 */
export class TheaStateManager {
	// Renamed class
	private contextProxy: ContextProxy
	// Managers are now passed in, assuming they are needed by getState logic implicitly via contextProxy or directly
	private providerSettingsManager: ProviderSettingsManager
	private customModesManager: CustomModesManager

	// Define the property explicitly - assigned by TheaProvider instance after construction
	public getCustomModes?: () => Promise<ModeConfig[] | undefined>

	constructor(
		private readonly context: vscode.ExtensionContext,
		providerSettingsManager: ProviderSettingsManager, // Accept needed managers
		customModesManager: CustomModesManager,
	) {
		this.contextProxy = new ContextProxy(context)
		this.providerSettingsManager = providerSettingsManager // Store passed instance
		this.customModesManager = customModesManager // Store passed instance
	}

	/**
	 * Retrieves the consolidated application state.
	 */
	async getState() {
		// This logic comes directly from the original ClineProvider.getState
		const stateValues = this.contextProxy.getValues()

		// Ensure getCustomModes is assigned and callable before invoking
		const customModes = this.getCustomModes
			? await this.getCustomModes()
			: await this.customModesManager.getCustomModes() // Fallback if not assigned? Or rely on assignment.

		// Determine apiProvider with the same logic as before.
		const apiProvider: ApiProvider = stateValues.apiProvider ? stateValues.apiProvider : "anthropic"

		// Build the apiConfiguration object combining state values and secrets.
		const providerSettings = this.contextProxy.getProviderSettings()

		// Ensure apiProvider is set properly if not already in state
		if (!providerSettings.apiProvider) {
			providerSettings.apiProvider = apiProvider
		}

		// Return the same structure as before
		return {
			apiConfiguration: providerSettings,
			osInfo: os.platform() === "win32" ? "win32" : "unix",
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
			cachedChromeHostUrl: stateValues.cachedChromeHostUrl,
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
			pinnedApiConfigs: stateValues.pinnedApiConfigs ?? {},
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
			showTheaIgnoredFiles: stateValues.showTheaIgnoredFiles ?? true, // Read correct key from stateValues
			maxReadFileLine: stateValues.maxReadFileLine ?? 500,
		}
	}

	// --- State Update Methods (Delegating to ContextProxy) ---

	// @deprecated - Use `ContextProxy#setValue` instead.
	async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		await this.contextProxy.setValue(key, value)
	}

	// @deprecated - Use `ContextProxy#getValue` instead.
	getGlobalState<K extends keyof GlobalState>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public async setValue<K extends keyof TheaCodeSettings>(key: K, value: TheaCodeSettings[K]) {
		await this.contextProxy.setValue(key, value)
	}

	public getValue<K extends keyof TheaCodeSettings>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public getValues() {
		return this.contextProxy.getValues()
	}

	public async setValues(values: TheaCodeSettings) {
		await this.contextProxy.setValues(values)
	}
}
