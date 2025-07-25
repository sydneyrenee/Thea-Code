import * as path from "path"
import fs from "fs/promises"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"

import { TheaProvider } from "./TheaProvider" // Renamed import
import { CheckpointStorage, Language, ApiConfigMeta } from "../../schemas"
import { changeLanguage, t } from "../../i18n"
import { ApiConfiguration } from "../../shared/api"
import { supportPrompt } from "../../shared/support-prompt"
import { GlobalFileNames } from "../../shared/globalFileNames"

import { checkoutDiffPayloadSchema, checkoutRestorePayloadSchema, WebviewMessage } from "../../shared/WebviewMessage"
import { checkExistKey } from "../../shared/checkExistApiConfig"
import { EXPERIMENT_IDS, experimentDefault } from "../../shared/experiments"
import { Terminal } from "../../integrations/terminal/Terminal"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { selectImages } from "../../integrations/misc/process-images"
import { getTheme } from "../../integrations/theme/getTheme"
import { discoverChromeHostUrl, tryChromeHostUrl } from "../../services/browser/browserDiscovery"
import { searchWorkspaceFiles } from "../../services/search/file-search"
import { fileExistsAtPath } from "../../utils/fs"
import { playSound, setSoundEnabled, setSoundVolume } from "../../utils/sound"
import { playTts, setTtsEnabled, setTtsSpeed, stopTts } from "../../utils/tts"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { searchCommits } from "../../utils/git"
import { exportSettings, importSettings } from "../config/importExport"
import { OpenRouterHandler } from "../../api/providers/openrouter"
import { getGlamaModels } from "../../api/providers/glama"
import { getUnboundModels } from "../../api/providers/unbound"
import { getRequestyModels } from "../../api/providers/requesty"
import { getOpenAiModels } from "../../api/providers/openai"
import { getOllamaModels } from "../../api/providers/ollama"
import { getVsCodeLmModels } from "../../api/providers/vscode-lm"
import { getLmStudioModels } from "../../api/providers/lmstudio"
import { getOpenRouterModels } from "../../api/providers/openrouter"
import { openMention } from "../mentions"
import { telemetryService } from "../../services/telemetry/TelemetryService"
import { TelemetrySetting } from "../../shared/TelemetrySetting"
import { getWorkspacePath } from "../../utils/path"
import { Mode, defaultModeSlug, getModeBySlug, getGroupName } from "../../shared/modes"
import { getDiffStrategy } from "../diff/DiffStrategy"
import { SYSTEM_PROMPT } from "../prompts/system"
import { buildApiHandler } from "../../api"
import { EXTENSION_CONFIG_DIR, configSection } from "../../../dist/thea-config" // Import branded constants

// Export for testing
export const webviewMessageHandler = async (provider: TheaProvider, message: WebviewMessage) => {
	// Renamed type
	switch (message.type) {
		case "webviewDidLaunch": {
			// Load custom modes first
			const customModes = await provider.customModesManager.getCustomModes()
			await provider.updateGlobalState("customModes", customModes)

			await provider.postStateToWebview()
			void provider.workspaceTracker?.initializeFilePaths()

			void getTheme().then((theme) =>
				provider.postMessageToWebview({ type: "theme", text: JSON.stringify(theme) }),
			)

			// If MCP Hub is already initialized, update the webview with current server list
			if (provider.mcpHub) {
				await provider.postMessageToWebview({
					type: "mcpServers",
					mcpServers: provider.mcpHub.getAllServers(),
				})
			}

			const cacheDir = await provider.ensureCacheDirectoryExists()

			// Post last cached models in case the call to endpoint fails.
			void provider.readModelsFromCache(GlobalFileNames.openRouterModels).then((openRouterModels) => {
				if (openRouterModels) {
					void provider.postMessageToWebview({
						type: "openRouterModels",
						openRouterModels,
					})
				}
			})

			// GUI relies on model info to be up-to-date to provide
			// the most accurate pricing, so we need to fetch the
			// latest details on launch.
			// We do this for all users since many users switch
			// between api providers and if they were to switch back
			// to OpenRouter it would be showing outdated model info
			// if we hadn't retrieved the latest at this point
			// (see normalizeApiConfiguration > openrouter).
			const { apiConfiguration: currentApiConfig } = await provider.getState()
			const openRouterHandler = new OpenRouterHandler(currentApiConfig)
			const { id: modelId, info: openRouterModelInfo } = openRouterHandler.getModel()
			if (openRouterModelInfo && modelId) {
				const openRouterModelsRecord: Record<string, typeof openRouterModelInfo> = {
					[modelId]: openRouterModelInfo
				}
				await fs.writeFile(
					path.join(cacheDir, GlobalFileNames.openRouterModels),
					JSON.stringify(openRouterModelsRecord),
				)
				await provider.postMessageToWebview({ type: "openRouterModels", openRouterModels: openRouterModelsRecord })

				// Update model info in state (this needs to be
				// done here since we don't want to update state
				// while settings is open, and we may refresh
				// models there).
				const { apiConfiguration } = await provider.getState()

				if (apiConfiguration.openRouterModelId && openRouterModelsRecord[apiConfiguration.openRouterModelId]) {
					await provider.updateGlobalState(
						"openRouterModelInfo",
						openRouterModelsRecord[apiConfiguration.openRouterModelId],
					)
					await provider.postStateToWebview()
				}
			}

			void provider.readModelsFromCache(GlobalFileNames.glamaModels).then((glamaModels) => {
				if (glamaModels) {
					void provider.postMessageToWebview({ type: "glamaModels", glamaModels })
				}
			})

			void getGlamaModels().then(async (glamaModels) => {
				if (Object.keys(glamaModels).length > 0) {
					await fs.writeFile(path.join(cacheDir, GlobalFileNames.glamaModels), JSON.stringify(glamaModels))
					await provider.postMessageToWebview({ type: "glamaModels", glamaModels })

					const { apiConfiguration } = await provider.getState()

					if (apiConfiguration.glamaModelId) {
						await provider.updateGlobalState("glamaModelInfo", glamaModels[apiConfiguration.glamaModelId])
						await provider.postStateToWebview()
					}
				}
			})

			void provider.readModelsFromCache(GlobalFileNames.unboundModels).then((unboundModels) => {
				if (unboundModels) {
					void provider.postMessageToWebview({ type: "unboundModels", unboundModels })
				}
			})

			// getUnboundModels() is synchronous and returns Record<string, ModelInfo>
			const unboundModels = getUnboundModels()
			if (Object.keys(unboundModels).length > 0) {
				void fs.writeFile(
					path.join(cacheDir, GlobalFileNames.unboundModels),
					JSON.stringify(unboundModels),
				).then(async () => {
					await provider.postMessageToWebview({ type: "unboundModels", unboundModels })

					const { apiConfiguration } = await provider.getState()

					if (apiConfiguration?.unboundModelId && unboundModels[apiConfiguration.unboundModelId]) {
						await provider.updateGlobalState(
							"unboundModelInfo",
							unboundModels[apiConfiguration.unboundModelId],
						)
						await provider.postStateToWebview()
					}
				})
			}

			void provider.readModelsFromCache(GlobalFileNames.requestyModels).then((requestyModels) => {
				if (requestyModels) {
					void provider.postMessageToWebview({ type: "requestyModels", requestyModels })
				}
			})

			void getRequestyModels().then(async (requestyModels) => {
				if (Object.keys(requestyModels).length > 0) {
					await fs.writeFile(
						path.join(cacheDir, GlobalFileNames.requestyModels),
						JSON.stringify(requestyModels),
					)
					await provider.postMessageToWebview({ type: "requestyModels", requestyModels })

					const { apiConfiguration } = await provider.getState()

					if (apiConfiguration.requestyModelId) {
						await provider.updateGlobalState(
							"requestyModelInfo",
							requestyModels[apiConfiguration.requestyModelId],
						)
						await provider.postStateToWebview()
					}
				}
			})

			void provider.providerSettingsManager
				.listConfig()
				.then(async (listApiConfig) => {
					if (!listApiConfig) {
						return
					}

					if (listApiConfig.length === 1) {
						// Check if first time init then sync with exist config.
						if (!checkExistKey(listApiConfig[0])) {
							const { apiConfiguration } = await provider.getState()

							await provider.providerSettingsManager.saveConfig(
								listApiConfig[0].name ?? "default",
								apiConfiguration,
							)

							listApiConfig[0].apiProvider = apiConfiguration.apiProvider
						}
					}

					const currentConfigName = provider.getGlobalState("currentApiConfigName")

					if (currentConfigName) {
						if (!(await provider.providerSettingsManager.hasConfig(currentConfigName))) {
							// current config name not valid, get first config in list
							await provider.updateGlobalState("currentApiConfigName", listApiConfig?.[0]?.name)
							if (listApiConfig?.[0]?.name) {
								const apiConfig = await provider.providerSettingsManager.loadConfig(
									listApiConfig?.[0]?.name,
								)

								await Promise.all([
									provider.updateGlobalState("listApiConfigMeta", listApiConfig),
									provider.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
									provider.updateApiConfiguration(apiConfig),
								])
								await provider.postStateToWebview()
								return
							}
						}
					}

					await Promise.all([
						await provider.updateGlobalState("listApiConfigMeta", listApiConfig),
						await provider.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
					])
				})
				.catch((error) =>
					provider.outputChannel.appendLine(
						`Error list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					),
				)

			// If user already opted in to telemetry, enable telemetry service
			void provider.getStateToPostToWebview().then((state) => {
				const { telemetrySetting } = state
				const isOptedIn = telemetrySetting === "enabled"
				telemetryService.updateTelemetryState(isOptedIn)
			})

			provider.isViewLaunched = true
			break
		}

		case "newTask": {
			// Code that should run in response to the hello message command
			//vscode.window.showInformationMessage(message.text!)

			// Send a message to our webview.
			// You can send any JSON serializable data.
			// Could also do this in extension .ts
			//provider.postMessageToWebview({ type: "text", text: `Extension: ${Date.now()}` })
			// initializing new instance of Cline will make sure that any agentically running promises in old instance don't affect our new task. this essentially creates a fresh slate for the new task
			await provider.initWithTask(message.text, message.images)
			break
		}
		case "apiConfiguration": {
			if (message.apiConfiguration) {
				await provider.updateApiConfiguration(message.apiConfiguration)
				// Make sure to post state to webview after successful API configuration update
				await provider.postStateToWebview()
			}
			break
		}
		case "customInstructions": {
			await provider.updateCustomInstructions(message.text)
			break
		}
		case "alwaysAllowReadOnly": {
			await provider.updateGlobalState("alwaysAllowReadOnly", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowReadOnlyOutsideWorkspace": {
			await provider.updateGlobalState("alwaysAllowReadOnlyOutsideWorkspace", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowWrite": {
			await provider.updateGlobalState("alwaysAllowWrite", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowWriteOutsideWorkspace": {
			await provider.updateGlobalState("alwaysAllowWriteOutsideWorkspace", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowExecute": {
			await provider.updateGlobalState("alwaysAllowExecute", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowBrowser": {
			await provider.updateGlobalState("alwaysAllowBrowser", message.bool ?? undefined)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowMcp": {
			await provider.updateGlobalState("alwaysAllowMcp", message.bool)
			await provider.postStateToWebview()
			break
		}
		case "alwaysAllowModeSwitch":
			await provider.updateGlobalState("alwaysAllowModeSwitch", message.bool)
			await provider.postStateToWebview()
			break
		case "alwaysAllowSubtasks":
			await provider.updateGlobalState("alwaysAllowSubtasks", message.bool)
			await provider.postStateToWebview()
			break
		case "askResponse":
			provider
				.getCurrent()
				?.webviewCommunicator.handleWebviewAskResponse(message.askResponse!, message.text, message.images) // Use communicator
			break
		case "clearTask":
			// clear task resets the current session and allows for a new task to be started, if this session is a subtask - it allows the parent task to be resumed
			await provider.finishSubTask(t("common:tasks.canceled"))
			await provider.postStateToWebview()
			break
		case "didShowAnnouncement":
			await provider.updateGlobalState("lastShownAnnouncementId", provider.latestAnnouncementId)
			await provider.postStateToWebview()
			break
		case "selectImages": {
			const images = await selectImages()
			await provider.postMessageToWebview({ type: "selectedImages", images })
			break
		}
		case "exportCurrentTask": {
			const currentTaskId = provider.getCurrent()?.taskId
			if (currentTaskId) {
				await provider.exportTaskWithId(currentTaskId)
			}
			break
		}
		case "showTaskWithId":
			await provider.showTaskWithId(message.text!)
			break
		case "deleteTaskWithId":
			await provider.deleteTaskWithId(message.text!)
			break
		case "deleteMultipleTasksWithIds": {
			const ids = message.ids

			if (Array.isArray(ids)) {
				// Process in batches of 20 (or another reasonable number)
				const batchSize = 20
				const results = []

				// Only log start and end of the operation
				console.log(`Batch deletion started: ${ids.length} tasks total`)

				for (let i = 0; i < ids.length; i += batchSize) {
					const batch = ids.slice(i, i + batchSize)

					const batchPromises = batch.map(async (id) => {
						try {
							await provider.deleteTaskWithId(id)
							return { id, success: true }
						} catch (error) {
							// Keep error logging for debugging purposes
							console.log(
								`Failed to delete task ${id}: ${error instanceof Error ? error.message : String(error)}`,
							)
							return { id, success: false }
						}
					})

					// Process each batch in parallel but wait for completion before starting the next batch
					const batchResults = await Promise.all(batchPromises)
					results.push(...batchResults)

					// Update the UI after each batch to show progress
					await provider.postStateToWebview()
				}

				// Log final results
				const successCount = results.filter((r) => r.success).length
				const failCount = results.length - successCount
				console.log(
					`Batch deletion completed: ${successCount}/${ids.length} tasks successful, ${failCount} tasks failed`,
				)
			}
			break
		}
		case "exportTaskWithId":
			await provider.exportTaskWithId(message.text!)
			break
		case "importSettings": {
			const { success } = await importSettings({
				providerSettingsManager: provider.providerSettingsManager,
				contextProxy: provider.contextProxy,
			})

			if (success) {
				provider.settingsImportedAt = Date.now()
				await provider.postStateToWebview()
				await vscode.window.showInformationMessage(t("common:info.settings_imported"))
			}

			break
		}
		case "exportSettings":
			await exportSettings({
				providerSettingsManager: provider.providerSettingsManager,
				contextProxy: provider.contextProxy,
			})

			break
		case "resetState":
			await provider.resetState()
			break
		case "refreshOpenRouterModels": {
			const { apiConfiguration: configForRefresh } = await provider.getState()
			const openRouterModels = await getOpenRouterModels(configForRefresh)

			if (Object.keys(openRouterModels).length > 0) {
				const cacheDir = await provider.ensureCacheDirectoryExists()
				await fs.writeFile(
					path.join(cacheDir, GlobalFileNames.openRouterModels),
					JSON.stringify(openRouterModels),
				)
				await provider.postMessageToWebview({ type: "openRouterModels", openRouterModels })
			}

			break
		}
		case "refreshGlamaModels": {
			const glamaModels = await getGlamaModels()

			if (Object.keys(glamaModels).length > 0) {
				const cacheDir = await provider.ensureCacheDirectoryExists()
				await fs.writeFile(path.join(cacheDir, GlobalFileNames.glamaModels), JSON.stringify(glamaModels))
				await provider.postMessageToWebview({ type: "glamaModels", glamaModels })
			}

			break
		}
		case "refreshUnboundModels": {
			const unboundModels = getUnboundModels()

			if (Object.keys(unboundModels).length > 0) {
				const cacheDir = await provider.ensureCacheDirectoryExists()
				await fs.writeFile(path.join(cacheDir, GlobalFileNames.unboundModels), JSON.stringify(unboundModels))
				await provider.postMessageToWebview({ type: "unboundModels", unboundModels })
			}

			break
		}
		case "refreshRequestyModels": {
			const requestyModels = await getRequestyModels()

			if (Object.keys(requestyModels).length > 0) {
				const cacheDir = await provider.ensureCacheDirectoryExists()
				await fs.writeFile(path.join(cacheDir, GlobalFileNames.requestyModels), JSON.stringify(requestyModels))
				await provider.postMessageToWebview({ type: "requestyModels", requestyModels })
			}

			break
		}
		case "refreshOpenAiModels": {
			if (message?.values?.baseUrl && message?.values?.apiKey) {
				const values = message.values as { baseUrl: string; apiKey: string }
				const openAiModels = await getOpenAiModels(values.baseUrl, values.apiKey)
				// Handle the case where getOpenAiModels returns {} on error or string[] on success
				const normalizedModels = Array.isArray(openAiModels) ? openAiModels : []
				await provider.postMessageToWebview({ type: "openAiModels", openAiModels: normalizedModels })
			}

			break
		}
		case "requestOllamaModels": {
			const ollamaModels = await getOllamaModels(message.text)
			// TODO: Cache like we do for OpenRouter, etc?
			await provider.postMessageToWebview({ type: "ollamaModels", ollamaModels })
			break
		}
		case "requestLmStudioModels": {
			const lmStudioModels = await getLmStudioModels(message.text)
			// TODO: Cache like we do for OpenRouter, etc?
			await provider.postMessageToWebview({ type: "lmStudioModels", lmStudioModels })
			break
		}
		case "requestVsCodeLmModels": {
			const vsCodeLmModels = await getVsCodeLmModels()
			// TODO: Cache like we do for OpenRouter, etc?
			await provider.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
			break
		}
		case "openImage": {
			await openImage(message.text!)
			break
		}
		case "openFile": {
			await openFile(message.text!, message.values as { create?: boolean; content?: string })
			break
		}
		case "openMention": {
			const { osInfo } = (await provider.getState()) || {}
			await openMention(message.text, osInfo)
			break
		}
		case "checkpointDiff": {
			const result = checkoutDiffPayloadSchema.safeParse(message.payload)

			if (result.success) {
				await provider.getCurrent()?.checkpointDiff(result.data)
			}

			break
		}
		case "checkpointRestore": {
			const result = checkoutRestorePayloadSchema.safeParse(message.payload)

			if (result.success) {
				await provider.cancelTask()

				try {
					await pWaitFor(() => provider.getCurrent()?.isInitialized === true, { timeout: 3_000 })
				} catch {
					vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
				}

				try {
					await provider.getCurrent()?.checkpointRestore(result.data)
				} catch {
					vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
				}
			}

			break
		}
		case "cancelTask": {
			await provider.cancelTask()
			break
		}
		case "allowedCommands": {
			await provider.context.globalState.update("allowedCommands", message.commands)
			// Also update workspace settings
			await vscode.workspace
				.getConfiguration(configSection())
				.update("allowedCommands", message.commands, vscode.ConfigurationTarget.Global)
			break
		}
		case "openMcpSettings": {
			const mcpSettingsFilePath = await provider.mcpHub?.getMcpSettingsFilePath()
			if (mcpSettingsFilePath) {
				await openFile(mcpSettingsFilePath)
			}
			break
		}
		case "openProjectMcpSettings": {
			if (!vscode.workspace.workspaceFolders?.length) {
				vscode.window.showErrorMessage(t("common:errors.no_workspace"))
				return
			}

			const workspaceFolder = vscode.workspace.workspaceFolders[0]
			const configDir = path.join(workspaceFolder.uri.fsPath, EXTENSION_CONFIG_DIR)
			const mcpPath = path.join(configDir, "mcp.json") // Use renamed variable

			try {
				await fs.mkdir(configDir, { recursive: true })
				const exists = await fileExistsAtPath(mcpPath)
				if (!exists) {
					await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: {} }, null, 2))
				}
				await openFile(mcpPath)
			} catch (error: unknown) {
				vscode.window.showErrorMessage(t("common:errors.create_mcp_json", { error: String(error) }))
			}
			break
		}
		case "openCustomModesSettings": {
			const customModesFilePath = await provider.customModesManager.getCustomModesFilePath()
			if (customModesFilePath) {
				await openFile(customModesFilePath)
			}
			break
		}
		case "deleteMcpServer": {
			if (!message.serverName) {
				break
			}

			try {
				provider.outputChannel.appendLine(`Attempting to delete MCP server: ${message.serverName}`)
				await provider.mcpHub?.deleteServer(message.serverName, message.source as "global" | "project")
				provider.outputChannel.appendLine(`Successfully deleted MCP server: ${message.serverName}`)
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				provider.outputChannel.appendLine(`Failed to delete MCP server: ${errorMessage}`)
				// Error messages are already handled by McpHub.deleteServer
			}
			break
		}
		case "restartMcpServer": {
			try {
				await provider.mcpHub?.restartConnection(message.text!, message.source as "global" | "project")
			} catch (error: unknown) {
				provider.outputChannel.appendLine(
					`Failed to retry connection for ${message.text}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
			}
			break
		}
		case "toggleToolAlwaysAllow": {
			try {
				if (provider.mcpHub) {
					await provider.mcpHub.toggleToolAlwaysAllow(
						message.serverName!,
						message.source as "global" | "project",
						message.toolName!,
						Boolean(message.alwaysAllow),
					)
				}
			} catch (error: unknown) {
				provider.outputChannel.appendLine(
					`Failed to toggle auto-approve for tool ${message.toolName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
			}
			break
		}
		case "toggleMcpServer": {
			try {
				await provider.mcpHub?.toggleServerDisabled(
					message.serverName!,
					message.disabled!,
					message.source as "global" | "project",
				)
			} catch (error: unknown) {
				provider.outputChannel.appendLine(
					`Failed to toggle MCP server ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
			}
			break
		}
		case "mcpEnabled": {
			const mcpEnabled = message.bool ?? true
			await provider.updateGlobalState("mcpEnabled", mcpEnabled)
			await provider.postStateToWebview()
			break
		}
		case "enableMcpServerCreation":
			await provider.updateGlobalState("enableMcpServerCreation", message.bool ?? true)
			await provider.postStateToWebview()
			break
		case "playSound":
			if (message.audioType) {
				const soundPath = path.join(provider.context.extensionPath, "audio", `${message.audioType}.wav`)
				playSound(soundPath)
			}
			break
		case "soundEnabled": {
			const soundEnabled = message.bool ?? true
			await provider.updateGlobalState("soundEnabled", soundEnabled)
			setSoundEnabled(soundEnabled) // Add this line to update the sound utility
			await provider.postStateToWebview()
			break
		}
		case "soundVolume": {
			const soundVolume = message.value ?? 0.5
			await provider.updateGlobalState("soundVolume", soundVolume)
			setSoundVolume(soundVolume)
			await provider.postStateToWebview()
			break
		}
		case "ttsEnabled": {
			const ttsEnabled = message.bool ?? true
			await provider.updateGlobalState("ttsEnabled", ttsEnabled)
			setTtsEnabled(ttsEnabled) // Add this line to update the tts utility
			await provider.postStateToWebview()
			break
		}
		case "ttsSpeed": {
			const ttsSpeed = message.value ?? 1.0
			await provider.updateGlobalState("ttsSpeed", ttsSpeed)
			setTtsSpeed(ttsSpeed)
			await provider.postStateToWebview()
			break
		}
		case "playTts":
			if (message.text) {
				await playTts(message.text, {
					onStart: () => {
						void provider.postMessageToWebview({ type: "ttsStart", text: message.text })
					},
					onStop: () => {
						void provider.postMessageToWebview({ type: "ttsStop", text: message.text })
					},
				})
			}
			break
		case "stopTts":
			stopTts()
			break
		case "diffEnabled": {
			const diffEnabled = message.bool ?? true
			await provider.updateGlobalState("diffEnabled", diffEnabled)
			await provider.postStateToWebview()
			break
		}
		case "enableCheckpoints": {
			const enableCheckpoints = message.bool ?? true
			await provider.updateGlobalState("enableCheckpoints", enableCheckpoints)
			await provider.postStateToWebview()
			break
		}
		case "checkpointStorage": {
			console.log(`[ClineProvider] checkpointStorage: ${message.text}`)
			const checkpointStorage = message.text ?? "task"
			await provider.updateGlobalState("checkpointStorage", checkpointStorage as CheckpointStorage)
			await provider.postStateToWebview()
			break
		}
		case "browserViewportSize": {
			const browserViewportSize = message.text ?? "900x600"
			await provider.updateGlobalState("browserViewportSize", browserViewportSize)
			await provider.postStateToWebview()
			break
		}
		case "remoteBrowserHost":
			await provider.updateGlobalState("remoteBrowserHost", message.text)
			await provider.postStateToWebview()
			break
		case "remoteBrowserEnabled":
			// Store the preference in global state
			// remoteBrowserEnabled now means "enable remote browser connection"
			await provider.updateGlobalState("remoteBrowserEnabled", message.bool ?? false)
			// If disabling remote browser connection, clear the remoteBrowserHost
			if (!message.bool) {
				await provider.updateGlobalState("remoteBrowserHost", undefined)
			}
			await provider.postStateToWebview()
			break
		case "testBrowserConnection":
			// If no text is provided, try auto-discovery
			if (!message.text) {
				// Use testBrowserConnection for auto-discovery
				const chromeHostUrl = await discoverChromeHostUrl()
				if (chromeHostUrl) {
					// Send the result back to the webview
					await provider.postMessageToWebview({
						type: "browserConnectionResult",
						success: !!chromeHostUrl,
						text: `Auto-discovered and tested connection to Chrome: ${chromeHostUrl}`,
						values: { endpoint: chromeHostUrl },
					})
				} else {
					await provider.postMessageToWebview({
						type: "browserConnectionResult",
						success: false,
						text: "No Chrome instances found on the network. Make sure Chrome is running with remote debugging enabled (--remote-debugging-port=9222).",
					})
				}
			} else {
				// Test the provided URL
				const customHostUrl = message.text
				const hostIsValid = await tryChromeHostUrl(message.text)
				// Send the result back to the webview
				await provider.postMessageToWebview({
					type: "browserConnectionResult",
					success: hostIsValid,
					text: hostIsValid
						? `Successfully connected to Chrome: ${customHostUrl}`
						: "Failed to connect to Chrome",
				})
			}
			break
		case "fuzzyMatchThreshold":
			await provider.updateGlobalState("fuzzyMatchThreshold", message.value)
			await provider.postStateToWebview()
			break
		case "alwaysApproveResubmit":
			await provider.updateGlobalState("alwaysApproveResubmit", message.bool ?? false)
			await provider.postStateToWebview()
			break
		case "requestDelaySeconds":
			await provider.updateGlobalState("requestDelaySeconds", message.value ?? 5)
			await provider.postStateToWebview()
			break
		case "rateLimitSeconds":
			await provider.updateGlobalState("rateLimitSeconds", message.value ?? 0)
			await provider.postStateToWebview()
			break
		case "writeDelayMs":
			await provider.updateGlobalState("writeDelayMs", message.value)
			await provider.postStateToWebview()
			break
		case "terminalOutputLineLimit":
			await provider.updateGlobalState("terminalOutputLineLimit", message.value)
			await provider.postStateToWebview()
			break
		case "terminalShellIntegrationTimeout":
			await provider.updateGlobalState("terminalShellIntegrationTimeout", message.value)
			await provider.postStateToWebview()
			if (message.value !== undefined) {
				Terminal.setShellIntegrationTimeout(message.value)
			}
			break
		case "mode":
			await provider.handleModeSwitch(message.text as Mode)
			break
		case "updateSupportPrompt":
			try {
				if (Object.keys(message?.values ?? {}).length === 0) {
					return
				}

				const existingPrompts = provider.getGlobalState("customSupportPrompts") ?? {}
				const updatedPrompts = { ...existingPrompts, ...(message.values as Record<string, string>) }
				await provider.updateGlobalState("customSupportPrompts", updatedPrompts)
				await provider.postStateToWebview()
			} catch (error) {
				provider.outputChannel.appendLine(
					`Error update support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.update_support_prompt"))
			}
			break
		case "resetSupportPrompt":
			try {
				if (!message?.text) {
					return
				}

				const existingPrompts = provider.getGlobalState("customSupportPrompts") ?? {}
				const updatedPrompts = { ...existingPrompts }
				updatedPrompts[message.text] = undefined
				await provider.updateGlobalState("customSupportPrompts", updatedPrompts)
				await provider.postStateToWebview()
			} catch (error) {
				provider.outputChannel.appendLine(
					`Error reset support prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.reset_support_prompt"))
			}
			break
		case "updatePrompt":
			if (message.promptMode && message.customPrompt !== undefined) {
				const existingPrompts = provider.getGlobalState("customModePrompts") ?? {}
				const updatedPrompts = { ...existingPrompts, [message.promptMode]: message.customPrompt }
				await provider.updateGlobalState("customModePrompts", updatedPrompts)
				const currentState = await provider.getState()
				const stateWithPrompts = { ...currentState, customModePrompts: updatedPrompts }
				provider.view?.webview.postMessage({ type: "state", state: stateWithPrompts })
			}
			break
		case "deleteMessage": {
			const answer = await vscode.window.showInformationMessage(
				t("common:confirmation.delete_message"),
				{ modal: true },
				t("common:confirmation.just_this_message"),
				t("common:confirmation.this_and_subsequent"),
			)

			if (
				(answer === t("common:confirmation.just_this_message") ||
					answer === t("common:confirmation.this_and_subsequent")) &&
				provider.getCurrent() &&
				typeof message.value === "number" &&
				message.value
			) {
				const timeCutoff = message.value - 1000 // 1 second buffer before the message to delete

				const messageIndex = provider
					.getCurrent()!
					.taskStateManager.theaTaskMessages.findIndex((msg) => msg.ts && msg.ts >= timeCutoff) // Access via state manager

				const apiConversationHistoryIndex = provider
					.getCurrent()
					?.taskStateManager.apiConversationHistory.findIndex((msg) => msg.ts && msg.ts >= timeCutoff) // Access via state manager

				if (messageIndex !== -1) {
					const { historyItem } = await provider.getTaskWithId(provider.getCurrent()!.taskId) // Access taskId directly from TheaTask

					if (answer === t("common:confirmation.just_this_message")) {
						// Find the next user message first
						const nextUserMessage = provider
							.getCurrent()!
							.taskStateManager.theaTaskMessages.slice(messageIndex + 1) // Access via state manager
							.find((msg) => msg.type === "say" && msg.say === "user_feedback")

						// Handle UI messages
						if (nextUserMessage) {
							// Find absolute index of next user message
							const nextUserMessageIndex = provider
								.getCurrent()!
								.taskStateManager.theaTaskMessages.findIndex((msg) => msg === nextUserMessage) // Access via state manager

							// Keep messages before current message and after next user message
							await provider.getCurrent()!.taskStateManager.overwriteClineMessages([
								// Access via state manager
								...provider.getCurrent()!.taskStateManager.theaTaskMessages.slice(0, messageIndex),
								...provider.getCurrent()!.taskStateManager.theaTaskMessages.slice(nextUserMessageIndex),
							])
						} else {
							// If no next user message, keep only messages before current message
							await provider.getCurrent()!.taskStateManager.overwriteClineMessages(
								// Access via state manager
								provider.getCurrent()!.taskStateManager.theaTaskMessages.slice(0, messageIndex),
							)
						}

						// Handle API messages
						if (apiConversationHistoryIndex !== -1) {
							if (nextUserMessage && nextUserMessage.ts) {
								// Keep messages before current API message and after next user message
								await provider.getCurrent()!.taskStateManager.overwriteApiConversationHistory([
									// Access via state manager
									...provider
										.getCurrent()!
										.taskStateManager.apiConversationHistory.slice(0, apiConversationHistoryIndex), // Access via state manager
									...provider.getCurrent()!.taskStateManager.apiConversationHistory.filter(
										// Access via state manager
										(msg) => msg.ts && msg.ts >= nextUserMessage.ts,
									),
								])
							} else {
								// If no next user message, keep only messages before current API message
								await provider.getCurrent()!.taskStateManager.overwriteApiConversationHistory(
									// Access via state manager
									provider
										.getCurrent()!
										.taskStateManager.apiConversationHistory.slice(0, apiConversationHistoryIndex), // Access via state manager
								)
							}
						}
					} else if (answer === t("common:confirmation.this_and_subsequent")) {
						await provider // Added await
							.getCurrent()!
							.taskStateManager.overwriteClineMessages(
								provider.getCurrent()!.taskStateManager.theaTaskMessages.slice(0, messageIndex),
							) // Access via state manager
						if (apiConversationHistoryIndex !== -1) {
							await provider.getCurrent()!.taskStateManager.overwriteApiConversationHistory(
								// Access via state manager
								provider
									.getCurrent()!
									.taskStateManager.apiConversationHistory.slice(0, apiConversationHistoryIndex), // Access via state manager
							)
						}
					}

					await provider.initWithHistoryItem(historyItem)
				}
			}
			break
		}
		case "screenshotQuality":
			await provider.updateGlobalState("screenshotQuality", message.value)
			await provider.postStateToWebview()
			break
		case "maxOpenTabsContext": {
			const tabCount = Math.min(Math.max(0, message.value ?? 20), 500)
			await provider.updateGlobalState("maxOpenTabsContext", tabCount)
			await provider.postStateToWebview()
			break
		}
		case "maxWorkspaceFiles": {
			const fileCount = Math.min(Math.max(0, message.value ?? 200), 500)
			await provider.updateGlobalState("maxWorkspaceFiles", fileCount)
			await provider.postStateToWebview()
			break
		}
		case "browserToolEnabled":
			await provider.updateGlobalState("browserToolEnabled", message.bool ?? true)
			await provider.postStateToWebview()
			break
		case "language":
			await changeLanguage(message.text ?? "en")
			await provider.updateGlobalState("language", message.text as Language)
			await provider.postStateToWebview()
			break
		case "showTheaIgnoredFiles": // Rename message type
			await provider.updateGlobalState("showTheaIgnoredFiles", message.bool ?? true) // Use new setting key
			await provider.postStateToWebview()
			break
		case "maxReadFileLine":
			await provider.updateGlobalState("maxReadFileLine", message.value)
			await provider.postStateToWebview()
			break
		case "toggleApiConfigPin":
			if (message.text) {
				const currentPinned = provider.getGlobalState("pinnedApiConfigs") ?? {}
				const updatedPinned: Record<string, boolean> = { ...currentPinned }

				if (currentPinned[message.text]) {
					delete updatedPinned[message.text]
				} else {
					updatedPinned[message.text] = true
				}

				await provider.updateGlobalState("pinnedApiConfigs", updatedPinned)
				await provider.postStateToWebview()
			}
			break
		case "enhancementApiConfigId":
			await provider.updateGlobalState("enhancementApiConfigId", message.text)
			await provider.postStateToWebview()
			break
		case "autoApprovalEnabled":
			await provider.updateGlobalState("autoApprovalEnabled", message.bool ?? false)
			await provider.postStateToWebview()
			break
		case "enhancePrompt":
			if (message.text) {
				try {
					const { apiConfiguration, customSupportPrompts, listApiConfigMeta, enhancementApiConfigId } =
						await provider.getState()

					// Try to get enhancement config first, fall back to current config
					let configToUse: ApiConfiguration = apiConfiguration
					if (enhancementApiConfigId) {
						const config = listApiConfigMeta?.find((c: ApiConfigMeta) => c.id === enhancementApiConfigId)
						if (config?.name) {
							const loadedConfig = await provider.providerSettingsManager.loadConfig(config.name)
							if (loadedConfig.apiProvider) {
								configToUse = loadedConfig
							}
						}
					}

					const enhancedPrompt = await singleCompletionHandler(
						configToUse,
						supportPrompt.create(
							"ENHANCE",
							{
								userInput: message.text,
							},
							customSupportPrompts,
						),
					)

					await provider.postMessageToWebview({
						type: "enhancedPrompt",
						text: enhancedPrompt,
					})
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error enhancing prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.enhance_prompt"))
					await provider.postMessageToWebview({
						type: "enhancedPrompt",
					})
				}
			}
			break
		case "getSystemPrompt":
			try {
				const systemPrompt = await generateSystemPrompt(provider, message)

				await provider.postMessageToWebview({
					type: "systemPrompt",
					text: systemPrompt,
					mode: message.mode,
				})
			} catch (error) {
				provider.outputChannel.appendLine(
					`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
			}
			break
		case "copySystemPrompt":
			try {
				const systemPrompt = await generateSystemPrompt(provider, message)

				await vscode.env.clipboard.writeText(systemPrompt)
				await vscode.window.showInformationMessage(t("common:info.clipboard_copy"))
			} catch (error) {
				provider.outputChannel.appendLine(
					`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
			}
			break
		case "searchCommits": {
			const cwd = provider.cwd
			if (cwd) {
				try {
					const commits = await searchCommits(message.query || "", cwd)
					await provider.postMessageToWebview({
						type: "commitSearchResults",
						commits,
					})
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error searching commits: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.search_commits"))
				}
			}
			break
		}
		case "searchFiles": {
			const workspacePath = getWorkspacePath()

			if (!workspacePath) {
				// Handle case where workspace path is not available
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results: [],
					requestId: message.requestId,
					error: "No workspace path available",
				})
				break
			}
			try {
				// Call file search service with query from message
				const results = await searchWorkspaceFiles(
					message.query || "",
					workspacePath,
					20, // Use default limit, as filtering is now done in the backend
				)

				// Send results back to webview
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results,
					requestId: message.requestId,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)

				// Send error response to webview
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results: [],
					error: errorMessage,
					requestId: message.requestId,
				})
			}
			break
		}
		case "saveApiConfiguration":
			if (message.text && message.apiConfiguration) {
				try {
					await provider.providerSettingsManager.saveConfig(message.text, message.apiConfiguration)
					const listApiConfig = await provider.providerSettingsManager.listConfig()
					await provider.updateGlobalState("listApiConfigMeta", listApiConfig)
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error save api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.save_api_config"))
				}
			}
			break
		case "upsertApiConfiguration":
			if (message.text && message.apiConfiguration) {
				try {
					await provider.upsertApiConfiguration(message.text, message.apiConfiguration)
					// Make sure to post state to webview after successful API configuration update
					await provider.postStateToWebview()
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error handling upsertApiConfiguration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					// Error is already shown to user in upsertApiConfiguration
				}
			}
			break
		case "renameApiConfiguration":
			if (message.values && message.apiConfiguration) {
				try {
					const { oldName, newName } = message.values as { oldName: string; newName: string }

					if (oldName === newName) {
						break
					}

					// Load the old configuration to get its ID
					const oldConfig = await provider.providerSettingsManager.loadConfig(oldName)

					// Create a new configuration with the same ID
					const newConfig = {
						...message.apiConfiguration,
						id: oldConfig.id, // Preserve the ID
					}

					// Save with the new name but same ID
					await provider.providerSettingsManager.saveConfig(newName, newConfig)
					await provider.providerSettingsManager.deleteConfig(oldName)

					const listApiConfig = await provider.providerSettingsManager.listConfig()

					// Update listApiConfigMeta first to ensure UI has latest data
					await provider.updateGlobalState("listApiConfigMeta", listApiConfig)
					await provider.updateGlobalState("currentApiConfigName", newName)

					await provider.postStateToWebview()
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error rename api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.rename_api_config"))
				}
			}
			break
		case "loadApiConfiguration":
			if (message.text) {
				try {
					const apiConfig = await provider.providerSettingsManager.loadConfig(message.text)
					const listApiConfig = await provider.providerSettingsManager.listConfig()

					await Promise.all([
						provider.updateGlobalState("listApiConfigMeta", listApiConfig),
						provider.updateGlobalState("currentApiConfigName", message.text),
						provider.updateApiConfiguration(apiConfig),
					])

					await provider.postStateToWebview()
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error load api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.load_api_config"))
				}
			}
			break
		case "loadApiConfigurationById":
			if (message.text) {
				try {
					const { config: apiConfig, name } = await provider.providerSettingsManager.loadConfigById(
						message.text,
					)
					const listApiConfig = await provider.providerSettingsManager.listConfig()

					await Promise.all([
						provider.updateGlobalState("listApiConfigMeta", listApiConfig),
						provider.updateGlobalState("currentApiConfigName", name),
						provider.updateApiConfiguration(apiConfig),
					])

					await provider.postStateToWebview()
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error load api configuration by ID: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.load_api_config"))
				}
			}
			break
		case "deleteApiConfiguration":
			if (message.text) {
				const answer = await vscode.window.showInformationMessage(
					t("common:confirmation.delete_config_profile"),
					{ modal: true },
					t("common:answers.yes"),
				)

				if (answer !== t("common:answers.yes")) {
					break
				}

				try {
					await provider.providerSettingsManager.deleteConfig(message.text)
					const listApiConfig = await provider.providerSettingsManager.listConfig()

					// Update listApiConfigMeta first to ensure UI has latest data
					await provider.updateGlobalState("listApiConfigMeta", listApiConfig)

					// If this was the current config, switch to first available
					const currentApiConfigName = provider.getGlobalState("currentApiConfigName")

					if (message.text === currentApiConfigName && listApiConfig?.[0]?.name) {
						const apiConfig = await provider.providerSettingsManager.loadConfig(listApiConfig[0].name)
						await Promise.all([
							provider.updateGlobalState("currentApiConfigName", listApiConfig[0].name),
							provider.updateApiConfiguration(apiConfig),
						])
					}

					await provider.postStateToWebview()
				} catch (error) {
					provider.outputChannel.appendLine(
						`Error delete api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.delete_api_config"))
				}
			}
			break
		case "getListApiConfiguration":
			try {
				const listApiConfig = await provider.providerSettingsManager.listConfig()
				await provider.updateGlobalState("listApiConfigMeta", listApiConfig)
				await provider.postMessageToWebview({ type: "listApiConfig", listApiConfig })
			} catch (error) {
				provider.outputChannel.appendLine(
					`Error get list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
				)
				vscode.window.showErrorMessage(t("common:errors.list_api_config"))
			}
			break
		case "updateExperimental": {
			if (!message.values) {
				break
			}

			const updatedExperiments = {
				...(provider.getGlobalState("experiments") ?? experimentDefault),
				...message.values,
			}

			await provider.updateGlobalState("experiments", updatedExperiments)

			const currentCline = provider.getCurrent()

			// Update diffStrategy in current Cline instance if it exists.
			if (message.values[EXPERIMENT_IDS.DIFF_STRATEGY_UNIFIED] !== undefined && currentCline) {
				currentCline.updateDiffStrategy(updatedExperiments)
			}

			await provider.postStateToWebview()
			break
		}
		case "updateMcpTimeout":
			if (message.serverName && typeof message.timeout === "number") {
				try {
					await provider.mcpHub?.updateServerTimeout(
						message.serverName,
						message.timeout,
						message.source as "global" | "project",
					)
				} catch (error) {
					provider.outputChannel.appendLine(
						`Failed to update timeout for ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
					)
					vscode.window.showErrorMessage(t("common:errors.update_server_timeout"))
				}
			}
			break
		case "updateCustomMode":
			if (message.modeConfig) {
				await provider.customModesManager.updateCustomMode(message.modeConfig.slug, message.modeConfig)
				// Update state after saving the mode
				const customModes = await provider.customModesManager.getCustomModes()
				await provider.updateGlobalState("customModes", customModes)
				await provider.updateGlobalState("mode", message.modeConfig.slug)
				await provider.postStateToWebview()
			}
			break
		case "deleteCustomMode":
			if (message.slug) {
				const answer = await vscode.window.showInformationMessage(
					t("common:confirmation.delete_custom_mode"),
					{ modal: true },
					t("common:answers.yes"),
				)

				if (answer !== t("common:answers.yes")) {
					break
				}

				await provider.customModesManager.deleteCustomMode(message.slug)
				// Switch back to default mode after deletion
				await provider.updateGlobalState("mode", defaultModeSlug)
				await provider.postStateToWebview()
			}
			break

		case "telemetrySetting": {
			const telemetrySetting = message.text as TelemetrySetting
			await provider.updateGlobalState("telemetrySetting", telemetrySetting)
			const isOptedIn = telemetrySetting === "enabled"
			telemetryService.updateTelemetryState(isOptedIn)
			await provider.postStateToWebview()
			break
		}
	}
}

const generateSystemPrompt = async (provider: TheaProvider, message: WebviewMessage) => {
	// Renamed type
	const {
		apiConfiguration,
		customModePrompts,
		customInstructions,
		browserViewportSize,
		diffEnabled,
		mcpEnabled,
		fuzzyMatchThreshold,
		experiments,
		enableMcpServerCreation,
		browserToolEnabled,
		language,
	} = await provider.getState()

	// Create diffStrategy based on current model and settings.
	const diffStrategy = getDiffStrategy({
		model: apiConfiguration.apiModelId || apiConfiguration.openRouterModelId || "",
		experiments,
		fuzzyMatchThreshold,
	})

	const cwd = provider.cwd

	const mode = message.mode ?? defaultModeSlug
	const customModes = await provider.customModesManager.getCustomModes()

	const theaIgnoreInstructions = provider.getCurrent()?.theaIgnoreController?.getInstructions()

	// Determine if browser tools can be used based on model support, mode, and user settings
	let modelSupportsComputerUse = false

	// Create a temporary API handler to check if the model supports computer use
	// This avoids relying on an active Cline instance which might not exist during preview
	try {
		const tempApiHandler = buildApiHandler(apiConfiguration)
		modelSupportsComputerUse = tempApiHandler.getModel().info.supportsComputerUse ?? false
	} catch (error) {
		console.error("Error checking if model supports computer use:", error)
	}

	// Check if the current mode includes the browser tool group
	const modeConfig = getModeBySlug(mode, customModes)
	const modeSupportsBrowser = modeConfig?.groups.some((group) => getGroupName(group) === "browser") ?? false

	// Only enable browser tools if the model supports it, the mode includes browser tools,
	// and browser tools are enabled in settings
	const canUseBrowserTool = modelSupportsComputerUse && modeSupportsBrowser && (browserToolEnabled ?? true)

	const systemPrompt = await SYSTEM_PROMPT(
		provider.context,
		cwd,
		canUseBrowserTool,
		mcpEnabled ? provider.mcpHub : undefined,
		diffStrategy,
		browserViewportSize ?? "900x600",
		mode,
		customModePrompts,
		customModes,
		customInstructions,
		diffEnabled,
		experiments,
		enableMcpServerCreation,
		language,
		theaIgnoreInstructions,
	)
	return systemPrompt
}
