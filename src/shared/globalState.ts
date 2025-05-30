/**
 * For convenience we'd like the `TheaCodeAPI` to define `SecretKey` and `GlobalStateKey`,
 * but since it is a type definition file we can't export constants without some
 * annoyances. In order to achieve proper type safety without using constants as
 * in the type definition we use this clever Check<>Exhaustiveness pattern.
 * If you extend the `SecretKey` or `GlobalStateKey` types, you will need to
 * update the `SECRET_KEYS` and `GLOBAL_STATE_KEYS` arrays to include the new
 * keys or a type error will be thrown.
 */

export const SECRET_KEYS = [
	"apiKey",
	"glamaApiKey",
	"openRouterApiKey",
	"awsAccessKey",
	"awsSecretKey",
	"awsSessionToken",
	"openAiApiKey",
	"geminiApiKey",
	"openAiNativeApiKey",
	"deepSeekApiKey",
	"mistralApiKey",
	"unboundApiKey",
	"requestyApiKey",
] as const

// Redefine missing types locally
type SecretKey = (typeof SECRET_KEYS)[number]

type CheckSecretKeysExhaustiveness = Exclude<SecretKey, (typeof SECRET_KEYS)[number]> extends never ? true : false

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _checkSecretKeysExhaustiveness: CheckSecretKeysExhaustiveness = true

export const GLOBAL_STATE_KEYS = [
	"apiProvider",
	"apiModelId",
	"glamaModelId",
	"glamaModelInfo",
	"awsRegion",
	"awsUseCrossRegionInference",
	"awsProfile",
	"awsUseProfile",
	"awsCustomArn",
	"vertexKeyFile",
	"vertexJsonCredentials",
	"vertexProjectId",
	"vertexRegion",
	"lastShownAnnouncementId",
	"customInstructions",
	"alwaysAllowReadOnly",
	"alwaysAllowReadOnlyOutsideWorkspace",
	"alwaysAllowWrite",
	"alwaysAllowWriteOutsideWorkspace",
	"alwaysAllowExecute",
	"alwaysAllowBrowser",
	"alwaysAllowMcp",
	"alwaysAllowModeSwitch",
	"alwaysAllowSubtasks",
	"taskHistory",
	"openAiBaseUrl",
	"openAiModelId",
	"openAiCustomModelInfo",
	"openAiUseAzure",
	"ollamaModelId",
	"ollamaBaseUrl",
	"lmStudioModelId",
	"lmStudioBaseUrl",
	"anthropicBaseUrl",
	"modelMaxThinkingTokens",
	"azureApiVersion",
	"openAiStreamingEnabled",
	"openAiR1FormatEnabled",
	"openRouterModelId",
	"openRouterModelInfo",
	"openRouterBaseUrl",
	"openRouterSpecificProvider",
	"openRouterUseMiddleOutTransform",
	"googleGeminiBaseUrl",
	"allowedCommands",
	"soundEnabled",
	"ttsEnabled",
	"ttsSpeed",
	"soundVolume",
	"diffEnabled",
	"enableCheckpoints",
	"checkpointStorage",
	"browserViewportSize",
	"screenshotQuality",
	"remoteBrowserHost",
	"fuzzyMatchThreshold",
	"writeDelayMs",
	"terminalOutputLineLimit",
	"terminalShellIntegrationTimeout",
	"mcpEnabled",
	"enableMcpServerCreation",
	"alwaysApproveResubmit",
	"requestDelaySeconds",
	"rateLimitSeconds",
	"currentApiConfigName",
	"listApiConfigMeta",
	"vsCodeLmModelSelector",
	"mode",
	"modeApiConfigs",
	"customModePrompts",
	"customSupportPrompts",
	"enhancementApiConfigId",
	"experiments", // Map of experiment IDs to their enabled state.
	"autoApprovalEnabled",
	"customModes", // Array of custom modes.
	"unboundModelId",
	"requestyModelId",
	"requestyModelInfo",
	"unboundModelInfo",
	"modelTemperature",
	"modelMaxTokens",
	"mistralCodestralUrl",
	"maxOpenTabsContext",
	"browserToolEnabled",
	"lmStudioSpeculativeDecodingEnabled",
	"lmStudioDraftModelId",
	"telemetrySetting",
	"showTheaIgnoredFiles",
	"remoteBrowserEnabled",
	"language",
	"maxWorkspaceFiles",
	"maxReadFileLine",
	"fakeAi",
	"pinnedApiConfigs",
] as const

// Redefine missing types locally
type GlobalStateKey = (typeof GLOBAL_STATE_KEYS)[number]
type ConfigurationKey = SecretKey | GlobalStateKey

// Define ConfigurationValues based on known types (approximate, might need adjustment based on actual usage)
import type { GlobalSettings, ProviderSettings } from "../exports/thea-code"
type ConfigurationValues = GlobalSettings & ProviderSettings

export type { SecretKey, GlobalStateKey, ConfigurationKey, ConfigurationValues }

export const PASS_THROUGH_STATE_KEYS = ["taskHistory"] as const

type CheckGlobalStateKeysExhaustiveness =
	Exclude<GlobalStateKey, (typeof GLOBAL_STATE_KEYS)[number]> extends never ? true : false

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _checkGlobalStateKeysExhaustiveness: CheckGlobalStateKeysExhaustiveness = true

export const isSecretKey = (key: string): key is SecretKey => SECRET_KEYS.includes(key as SecretKey)

export const isGlobalStateKey = (key: string): key is GlobalStateKey =>
	GLOBAL_STATE_KEYS.includes(key as GlobalStateKey)

export const isPassThroughStateKey = (key: string): key is (typeof PASS_THROUGH_STATE_KEYS)[number] =>
	PASS_THROUGH_STATE_KEYS.includes(key as (typeof PASS_THROUGH_STATE_KEYS)[number])
