
 export const EXTENSION_NAME = "thea-code";
 export const EXTENSION_DISPLAY_NAME = "Thea Code";
 export const EXTENSION_PUBLISHER = "SolaceHarmony";
 export const EXTENSION_VERSION = "0.0.5";
 export const EXTENSION_ID = "SolaceHarmony.thea-code";
 export const EXTENSION_SECRETS_PREFIX = "thea_code_config_";
 export const EXTENSION_CONFIG_DIR = ".thea";
 export const CONFIG_DIR_NAME = ".thea";
 export const REPOSITORY_URL = "https://github.com/SolaceHarmony/Thea-Code";
 export const HOMEPAGE_URL = "https://github.com/SolaceHarmony/Thea-Code";
 export const AUTHOR_NAME = "Sydney Renee";
 export const AUTHOR_EMAIL = "sydney@solace.ofharmony.ai";
 export const AI_IDENTITY_NAME = "Thea";
 export const BRANCH_PREFIX = "thea-";

 export const COMMANDS = {
  "PLUS_BUTTON": "thea-code.plusButtonClicked",
  "MCP_BUTTON": "thea-code.mcpButtonClicked",
  "PROMPTS_BUTTON": "thea-code.promptsButtonClicked",
  "HISTORY_BUTTON": "thea-code.historyButtonClicked",
  "POPOUT_BUTTON": "thea-code.popoutButtonClicked",
  "SETTINGS_BUTTON": "thea-code.settingsButtonClicked",
  "HELP_BUTTON": "thea-code.helpButtonClicked",
  "OPEN_NEW_TAB": "thea-code.openInNewTab",
  "EXPLAIN_CODE": "thea-code.explainCode",
  "FIX_CODE": "thea-code.fixCode",
  "IMPROVE_CODE": "thea-code.improveCode",
  "ADD_TO_CONTEXT": "thea-code.addToContext",
  "TERMINAL_ADD_TO_CONTEXT": "thea-code.terminalAddToContext",
  "TERMINAL_FIX": "thea-code.terminalFixCommand",
  "TERMINAL_EXPLAIN": "thea-code.terminalExplainCommand",
  "TERMINAL_FIX_CURRENT": "thea-code.terminalFixCommandInCurrentTask",
  "TERMINAL_EXPLAIN_CURRENT": "thea-code.terminalExplainCommandInCurrentTask",
  "NEW_TASK": "thea-code.newTask"
};
export const VIEWS = {
  "SIDEBAR": "thea-code.SidebarProvider",
  "TAB_PANEL": "thea-code.TabPanelProvider",
  "ACTIVITY_BAR": "thea-code-ActivityBar"
};
export const CONFIG = {
  "SECTION": "thea-code",
  "ALLOWED_COMMANDS": "allowedCommands",
  "VS_CODE_LM_SELECTOR": "vsCodeLmModelSelector",
  "CHECKPOINTS_PREFIX": "thea-code-checkpoints"
};
export const MENU_GROUPS = {
  "AI_COMMANDS": "Thea Code Commands",
  "NAVIGATION": "navigation"
};
export const TEXT_PATTERNS = { createRoleDefinition: (role: string, modeName?: string): string => { return `You are ${AI_IDENTITY_NAME}, ${role}`; }, logPrefix: (): string => `${EXTENSION_DISPLAY_NAME} <Language Model API>:` };
export const API_REFERENCES = {
  "REPO_URL": "https://github.com/SolaceHarmony/Thea-Code",
  "HOMEPAGE": "https://github.com/SolaceHarmony/Thea-Code",
  "APP_TITLE": "Thea Code",
  "DISCORD_URL": "https://discord.gg/EmberHarmony",
  "REDDIT_URL": "https://reddit.com/r/SolaceHarmony"
}; // Updated
export const GLOBAL_FILENAMES = {
  "IGNORE_FILENAME": ".thea_ignore",
  "MODES_FILENAME": ".thea_modes"
};
export const SPECIFIC_STRINGS = {
  "AI_IDENTITY_NAME_LOWERCASE": "thea",
  "IGNORE_ERROR_IDENTIFIER": "theaignore_error",
  "IGNORE_CONTENT_VAR_NAME": "theaIgnoreContent",
  "IGNORE_PARSED_VAR_NAME": "theaIgnoreParsed",
  "IGNORE_CONTROLLER_CLASS_NAME": "TheaIgnoreController",
  "SETTINGS_FILE_NAME": "thea-code-settings.json",
  "PORTAL_NAME": "thea-portal"
};

export const SETTING_KEYS = {
  "SHOW_IGNORED_FILES": "showTheaCodeIgnoredFiles"
};
export const TYPE_NAMES = {
  "API": "TheaCodeAPI",
  "EVENTS": "TheaCodeEvents"
};
// Helper function equivalents
export const prefixCommand = (command: string): string => `${EXTENSION_NAME}.${command}`;
export const brandMessage = (message: string): string => `${EXTENSION_DISPLAY_NAME}: ${message}`;
export const configSection = (): string => CONFIG.SECTION;
// Add other helpers if needed
