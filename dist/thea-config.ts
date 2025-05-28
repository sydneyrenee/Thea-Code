export const EXTENSION_NAME = "thea-code";
export const EXTENSION_DISPLAY_NAME = "Thea Code";
export const EXTENSION_CONFIG_DIR = ".thea";
export const CONFIG = { SECTION: "thea-code" } as const;
export const configSection = (): string => CONFIG.SECTION;
